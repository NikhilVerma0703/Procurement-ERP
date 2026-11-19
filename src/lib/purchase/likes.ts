// Likes: Frappe's ♥ on a list row and in a form's sidebar (frappe/desk/like.py). Anyone who can open
// a record may like it. A row shows the heart filled when the viewer liked it, and how many did; the
// list can show only what the viewer liked. On a PO, liking writes "{name} Liked" on its timeline (a
// Like comment) and unliking takes that line away again, as _toggle_like did. Neither changes when
// the record was last modified (update_modified=False). Not used on the old site (no record was
// liked); brought back by the owner's decision of 19-11-2026.
import "server-only";
import type { ActionResult } from "./orders/form-schema";
import { namesOf } from "./orders/activity";
import type { PurchaseUser } from "./server/current-user";
import { db } from "./server/db";
import { recordOrderEvent } from "./server/audit";

/** The doctype each screen's records are liked as (ERPNext's doctype names). */
export const LIKE_DOCTYPE = {
  orders: "Purchase Order",
  suppliers: "Supplier",
  items: "Item",
  addresses: "Address",
  contacts: "Contact",
  taxTemplates: "Purchase Taxes and Charges Template",
  paymentTermsTemplates: "Payment Terms Template",
  paymentTerms: "Payment Term",
  terms: "Terms and Conditions",
} as const;
export type LikeKind = keyof typeof LIKE_DOCTYPE;
export const isLikeKind = (k: string): k is LikeKind => Object.prototype.hasOwnProperty.call(LIKE_DOCTYPE, k);

export interface LikeInfo {
  count: number;
  /** Did the viewer like it? */
  mine: boolean;
  /** Who liked it, by name, first liker first (the heart's tooltip). */
  names: string[];
}

export const NO_LIKES: LikeInfo = { count: 0, mine: false, names: [] };

/** The likes of these records, by record id (records nobody liked are absent). */
export async function likesOf(kind: LikeKind, ids: readonly string[], viewer: string): Promise<Record<string, LikeInfo>> {
  if (!ids.length) return {};
  const rows = await db.purchaseLike.findMany({
    where: { doctype: LIKE_DOCTYPE[kind], recordId: { in: [...ids] } },
    select: { recordId: true, email: true },
    orderBy: { likedAt: "asc" },
  });
  const nameOf = await namesOf(rows.map((r) => r.email));
  const out: Record<string, LikeInfo> = {};
  for (const r of rows) {
    const x = (out[r.recordId] ??= { count: 0, mine: false, names: [] });
    x.count += 1;
    x.names.push(nameOf(r.email));
    if (r.email.toLowerCase() === viewer.toLowerCase()) x.mine = true;
  }
  return out;
}

/** The ids of the records of a kind the viewer liked (the list's "liked by me"). */
export async function likedIds(kind: LikeKind, viewer: string): Promise<string[]> {
  const rows = await db.purchaseLike.findMany({ where: { doctype: LIKE_DOCTYPE[kind], email: { equals: viewer, mode: "insensitive" } }, select: { recordId: true } });
  return rows.map((r) => r.recordId);
}

/** Does the record exist? (A like is kept only for a record that is there.) */
async function recordExists(kind: LikeKind, id: string): Promise<{ id?: string; number?: string } | null> {
  const where = { where: { id }, select: { id: true } } as const;
  switch (kind) {
    case "orders":
      return db.purchaseOrder.findUnique({ where: { id }, select: { number: true } });
    case "suppliers":
      return db.purchaseSupplier.findUnique(where);
    case "items":
      return db.purchaseItem.findUnique(where);
    case "addresses":
      return db.purchaseAddress.findUnique(where);
    case "contacts":
      return db.purchaseContact.findUnique(where);
    case "taxTemplates":
      return db.purchaseTaxTemplate.findUnique(where);
    case "paymentTermsTemplates":
      return db.purchasePaymentTermsTemplate.findUnique(where);
    case "paymentTerms":
      return db.purchasePaymentTerm.findUnique(where);
    case "terms":
      return db.purchaseTermsTemplate.findUnique(where);
  }
}

/** Likes or unlikes a record for the user (frappe.desk.like.toggle_like); answers its likes after. */
export async function toggleLike(user: PurchaseUser, kind: LikeKind, recordId: string, like: boolean): Promise<ActionResult<LikeInfo>> {
  const record = await recordExists(kind, recordId);
  if (!record) return { ok: false, error: `${LIKE_DOCTYPE[kind]} not found` };
  const doctype = LIKE_DOCTYPE[kind];
  await db.$transaction(async (tx) => {
    if (like) {
      const added = await tx.purchaseLike.createMany({ data: [{ doctype, recordId, email: user.email }], skipDuplicates: true });
      if (added.count && kind === "orders") {
        await recordOrderEvent(tx, { orderId: recordId, orderNumber: record.number!, kind: "INFO", byEmail: user.email, subject: "Like", content: "Liked" });
      }
    } else {
      await tx.purchaseLike.deleteMany({ where: { doctype, recordId, email: user.email } });
      // remove_like: the user's Like lines go from the timeline with the like.
      if (kind === "orders") await tx.purchaseOrderEvent.deleteMany({ where: { orderId: recordId, kind: "INFO", subject: "Like", byEmail: user.email } });
    }
  });
  return { ok: true, value: (await likesOf(kind, [recordId], user.email))[recordId] ?? NO_LIKES };
}
