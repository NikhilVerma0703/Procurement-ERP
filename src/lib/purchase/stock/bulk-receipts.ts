// The PO list's Actions › Purchase Receipt (owner, 26-11-2026: "Build all of them"), as ERPNext 14.92.14 ran it
// (purchase_order_list.js → bulk_transaction_processing.js → utilities/bulk_transaction.py): one draft
// Purchase Receipt for each ticked PO, made by the PO's own Create › Purchase Receipt mapping, each in its own
// step so one failure does not undo the others. ERPNext inserted the drafts without its checks
// (ignore_validate, ignore_mandatory); here each goes through the receipt's save, which computes its figures as
// the form does — a receipt the save refuses is reported with its reason. ERPNext logged the outcome in its
// Bulk Transaction Log; here it is answered at once.
import "server-only";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import { receiptFromOrder } from "./receipt-map";
import { saveReceipt } from "./receipt-save";

export interface BulkReceiptOutcome {
  done: { order: string; receiptId: string; receipt: string }[];
  failed: { order: string; error: string }[];
}

export async function bulkReceiptsFromOrders(user: PurchaseUser, ids: readonly string[]): Promise<BulkReceiptOutcome> {
  const orders = await db.purchaseOrder.findMany({ where: { id: { in: [...ids] } }, select: { id: true, number: true } });
  const byId = new Map(orders.map((o) => [o.id, o.number]));
  const out: BulkReceiptOutcome = { done: [], failed: [] };
  for (const id of ids) {
    const order = byId.get(id) ?? id;
    const made = await receiptFromOrder(id);
    if (!made.ok) {
      out.failed.push({ order, error: made.error });
      continue;
    }
    const saved = await saveReceipt(user, { id: null, doc: made.doc, modified: null });
    if (saved.ok) out.done.push({ order, receiptId: saved.value.id, receipt: saved.value.number });
    else out.failed.push({ order, error: saved.fieldErrors ? `${saved.error} ${Object.values(saved.fieldErrors).join(" ")}` : saved.error });
  }
  return out;
}
