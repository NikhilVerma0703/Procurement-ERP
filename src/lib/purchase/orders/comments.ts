// Comments on a PO, as the old form's comment box and timeline handled them
// (Frappe 14: desk/form/utils.py add_comment / update_comment, and the
// Comment doctype's permissions):
//   * anyone who may see the PO may comment on it;
//   * only the author edits a comment ("Comment can only be edited by the owner");
//   * the author, or an Admin (ERPNext's System Manager), deletes it;
//   * an empty comment is not added (the box ignored it).
// A comment is a purchase_order_events row of kind Comment, its text the
// editor's HTML cut down to the allowed tags (html.ts). Commenting does not
// change the PO itself, as Comments did not touch the document's "modified".
// Server only.
import "server-only";
import { htmlIsEmpty, sanitizeHtml } from "../html";
import { db } from "../server/db";
import type { PurchaseUser } from "../server/current-user";
import type { ActionResult } from "./form-schema";

/** The longest comment kept (ERPNext's Comment content is a Long Text; this is a sanity limit). */
const MAX_COMMENT = 100_000;

function clean(html: string): string | null {
  const s = sanitizeHtml(String(html ?? "").slice(0, MAX_COMMENT));
  return htmlIsEmpty(s) && !/<img/i.test(s) ? null : s;
}

export async function addComment(user: PurchaseUser, orderId: string, html: string): Promise<ActionResult<{ id: string }>> {
  const content = clean(html);
  if (!content) return { ok: false, error: "Comment can't be empty." };
  const order = await db.purchaseOrder.findUnique({ where: { id: orderId }, select: { id: true, number: true } });
  if (!order) return { ok: false, error: "Purchase Order not found" };
  const row = await db.purchaseOrderEvent.create({
    data: { source: "app", orderId: order.id, orderNumber: order.number, kind: "COMMENT", at: new Date(), byEmail: user.email, content },
    select: { id: true },
  });
  return { ok: true, value: { id: row.id } };
}

async function ownComment(user: PurchaseUser, id: string, mayAdmin: boolean) {
  const c = await db.purchaseOrderEvent.findUnique({ where: { id }, select: { id: true, kind: true, byEmail: true, orderId: true } });
  if (!c || c.kind !== "COMMENT") return { ok: false as const, error: "Comment not found" };
  const mine = (c.byEmail ?? "").toLowerCase() === user.email.toLowerCase();
  if (!mine && !(mayAdmin && user.role === "ADMIN")) return { ok: false as const, error: mayAdmin ? "Not permitted to delete this comment." : "Comment can only be edited by the owner" };
  return { ok: true as const, comment: c };
}

export async function updateComment(user: PurchaseUser, id: string, html: string): Promise<ActionResult<{ orderId: string | null }>> {
  const found = await ownComment(user, id, false);
  if (!found.ok) return found;
  const content = clean(html);
  if (!content) return { ok: false, error: "Comment can't be empty." };
  await db.purchaseOrderEvent.update({ where: { id }, data: { content } });
  return { ok: true, value: { orderId: found.comment.orderId } };
}

export async function deleteComment(user: PurchaseUser, id: string): Promise<ActionResult<{ orderId: string | null }>> {
  const found = await ownComment(user, id, true);
  if (!found.ok) return found;
  await db.purchaseOrderEvent.delete({ where: { id } });
  return { ok: true, value: { orderId: found.comment.orderId } };
}
