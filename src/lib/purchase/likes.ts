// Likes: Frappe's ♥ on a list row and in a form's sidebar (frappe/desk/like.py). Anyone who can open
// a record may like it. A row shows the heart filled when the viewer liked it, and how many did; the
// list can show only what the viewer liked. On a PO, liking writes "{name} Liked" on its timeline (a
// Like comment) and unliking takes that line away again, as _toggle_like did. Neither changes when
// the record was last modified (update_modified=False). Not used on the old site (no record was
// liked); brought back by the owner's decision of 19-11-2026. The pure rules are like-rules.ts.
import "server-only";
import type { ActionResult } from "./orders/form-schema";
import { namesOf } from "./orders/activity";
import type { ListFilter } from "./orders/list";
import type { PurchaseUser } from "./server/current-user";
import { db } from "./server/db";
import { recordOrderEvent } from "./server/audit";
import { LIKE_DOCTYPE, likedByCondition, NO_LIKES, type LikeInfo, type LikeKind } from "./like-rules";
import { DOC_SCREENS } from "./doc/screens";
import { docRecordExists } from "./doc/list-data";

export { LIKE_DOCTYPE, NO_LIKES, isLikeKind, type LikeInfo, type LikeKind } from "./like-rules";

/** The likes of these records, by record id (records nobody liked are absent). */
export async function likesOf(kind: LikeKind, ids: readonly string[], viewer: string): Promise<Record<string, LikeInfo>> {
  if (!ids.length) return {};
  const rows = await db.purchaseLike.findMany({
    where: { doctype: LIKE_DOCTYPE[kind], recordId: { in: [...ids] } },
    select: { recordId: true, email: true },
    orderBy: [{ likedAt: "asc" }, { id: "asc" }],
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

/** A "Liked By" condition (the ♥ heading, or the filter builder) as a condition on record ids. */
export async function likedByWhere(kind: LikeKind, f: Pick<ListFilter, "op" | "value">): Promise<{ id: { in: string[] } | { notIn: string[] } }> {
  const rows = await db.purchaseLike.findMany({
    where: { doctype: LIKE_DOCTYPE[kind] },
    select: { recordId: true, email: true },
    orderBy: [{ likedAt: "asc" }, { id: "asc" }],
  });
  const likers = new Map<string, string[]>();
  for (const r of rows) {
    const list = likers.get(r.recordId);
    if (list) list.push(r.email);
    else likers.set(r.recordId, [r.email]);
  }
  return { id: likedByCondition(f, likers) };
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
    case "gateEntries":
      return db.purchaseGateEntry.findUnique(where);
    case "receipts":
      return db.purchaseReceipt.findUnique(where);
    default: {
      // The Stock screens drawn from their definitions (doc/screens.ts): their own table, or the
      // generic one.
      const screen = DOC_SCREENS.find((s) => s.key === kind);
      return screen ? ((await docRecordExists(screen, id)) ? { id } : null) : null;
    }
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
