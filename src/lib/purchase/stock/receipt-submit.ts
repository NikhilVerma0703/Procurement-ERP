// What submitting or cancelling a Purchase Receipt does beyond the receipt itself — ERPNext 14.92's
// PurchaseReceipt.on_submit / on_cancel (Phase II; owner, 23-11-2026: "the Receipt section …
// completely"), checked against the old site's own records (23-11-2026):
//   * the stock ledger: each stock row's accepted quantity (in stock units) into its warehouse at its
//     valuation rate, a rejected quantity into the rejected warehouse at 0 (update_stock_ledger;
//     stock/stock-post.ts values them and refreshes the bins);
//   * the PO: each line's Received Qty is the sum of the submitted receipts' received quantities on it
//     (6,140 of 6,140 lines agree), the PO's % Received Frappe's formula (2,650 of 2,650), its status
//     the status map's (calc/status.ts) — and the bins' ordered quantities follow;
//   * the Gate Entry the receipt names gets its Inward No and Inward Date (the add-on's hook: on the old
//     site the gate entry changed a second after the receipt's submission, and no draft receipt's gate
//     entry carries one — 3,263 of 3,263); cancelling clears them again;
//   * the item's Last Purchase Rate (buying/utils.py update_last_purchase_rate): this receipt's net
//     rate per stock unit, unless a later purchase exists; on cancel, the last other purchase's.
// No accounting entries: this module keeps no ledgers of accounts (docs/12 §8, decision 3).
// Server-only; runs inside the caller's transaction.
import "server-only";
import { Prisma } from "@prisma/client";
import { dbDecimal, flt } from "../calc/pymath";
import { purchaseOrderStatus, type PoStatus } from "../calc/status";
import type { Doc } from "../doc/store";
import { labelOf, PO_STATUS_KEYS } from "../orders/labels";
import { receiptStockEntries } from "./receipt-doc";
import { cancelEntries, postEntries, refreshBin } from "./stock-post";

type Tx = Prisma.TransactionClient;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const rowsOf = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);

/** The status updater over the POs a receipt touches: lines' Received Qty, % Received, status. */
export async function refreshOrdersReceived(tx: Tx, orderNumbers: string[], who: { email: string; stamp: string }): Promise<{ itemCode: string; warehouse: string }[]> {
  const bins: { itemCode: string; warehouse: string }[] = [];
  for (const number of [...new Set(orderNumbers.filter(Boolean))]) {
    const o = await tx.purchaseOrder.findUnique({
      where: { number },
      select: {
        id: true, docStatus: true, status: true, perBilled: true, legacy: true,
        items: { select: { id: true, erpnextName: true, itemCode: true, qty: true, receivedQty: true, legacy: true, warehouse: { select: { code: true } } } },
      },
    });
    if (!o || o.docStatus !== "SUBMITTED") continue;
    const sums = await tx.$queryRaw<{ poi: string; recv: string }[]>`
      SELECT ri.order_item_name AS poi, SUM(ri.received_qty)::text AS recv
      FROM purchase_receipt_items ri JOIN purchase_receipts r ON r.id = ri.receipt_id
      WHERE r.doc_status = 'Submitted' AND COALESCE(r.legacy->>'is_return', '0') IN ('0', '') AND ri.order_number = ${number}
      GROUP BY 1`;
    const received = new Map(sums.map((s) => [s.poi, s.recv]));
    let num_ = 0;
    let den = 0;
    for (const it of o.items) {
      const recv = received.get(it.erpnextName ?? it.id) ?? "0";
      const qty = Number(it.qty);
      const r = Number(recv);
      num_ += Math.abs(qty) > Math.abs(r) ? Math.abs(r) : Math.abs(qty);
      den += Math.abs(qty);
      if (Math.abs(r - Number(it.receivedQty)) > 1e-9) {
        await tx.purchaseOrderItem.update({
          where: { id: it.id },
          data: { receivedQty: recv, legacy: { ...((it.legacy ?? {}) as Record<string, unknown>), received_qty: dbDecimal(r), modified: who.stamp } as Prisma.InputJsonObject },
        });
        if (it.warehouse?.code) bins.push({ itemCode: it.itemCode, warehouse: it.warehouse.code });
      }
    }
    const perReceived = den ? flt((num_ / den) * 100, 6) : 0;
    const label = purchaseOrderStatus({ docStatus: 1, status: labelOf(PO_STATUS_KEYS, o.status) as PoStatus, perReceived, perBilled: Number(o.perBilled) });
    await tx.purchaseOrder.update({
      where: { id: o.id },
      data: {
        perReceived: dbDecimal(perReceived), status: PO_STATUS_KEYS[label], updatedBy: who.email,
        legacy: { ...((o.legacy ?? {}) as Record<string, unknown>), per_received: dbDecimal(perReceived), status: label, modified: who.stamp, modified_by: who.email } as Prisma.InputJsonObject,
      },
    });
  }
  return bins;
}

/** The add-on's hook: the receipt's Gate Entry gets its Inward No and Date (or loses them on cancel). */
async function linkGateEntry(tx: Tx, gateEntry: string, receipt: { number: string; postingDate: string } | null, cancelling: string | null, who: { email: string; stamp: string }) {
  if (!gateEntry) return;
  const g = await tx.purchaseGateEntry.findUnique({ where: { number: gateEntry }, select: { id: true, receiptNumber: true, legacy: true } });
  if (!g) return;
  if (cancelling && g.receiptNumber !== cancelling) return;
  const inwardNo = receipt?.number ?? null;
  const inwardDate = receipt?.postingDate ?? null;
  await tx.purchaseGateEntry.update({
    where: { id: g.id },
    data: {
      receiptNumber: inwardNo, inwardDate: inwardDate ? new Date(`${inwardDate}T00:00:00Z`) : null, updatedBy: who.email,
      legacy: { ...((g.legacy ?? {}) as Record<string, unknown>), inward_no: inwardNo, inward_date: inwardDate, modified: who.stamp, modified_by: who.email } as Prisma.InputJsonObject,
    },
  });
}

/** update_last_purchase_rate: per item, this receipt's rate per stock unit unless a later purchase exists. */
async function lastPurchaseRates(tx: Tx, doc: Doc, isSubmit: boolean) {
  const thisDate = str(doc.posting_date);
  const number = str(doc.name);
  for (const r of rowsOf(doc.items)) {
    const code = str(r.item_code);
    if (!code) continue;
    const [po] = await tx.$queryRaw<{ rate: number; cf: number; date: string }[]>`
      SELECT i.base_net_rate::float8 AS rate, i.conversion_factor::float8 AS cf, to_char(o.transaction_date, 'YYYY-MM-DD') AS date
      FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.order_id
      WHERE i.item_code = ${code} AND o.doc_status = 'Submitted' ORDER BY o.transaction_date DESC, o.number DESC LIMIT 1`;
    const [pr] = await tx.$queryRaw<{ rate: number; cf: number; date: string }[]>`
      SELECT i.base_net_rate::float8 AS rate, i.conversion_factor::float8 AS cf, to_char(r.posting_date, 'YYYY-MM-DD') AS date
      FROM purchase_receipt_items i JOIN purchase_receipts r ON r.id = i.receipt_id
      WHERE i.item_code = ${code} AND r.doc_status = 'Submitted' AND r.number <> ${number}
      ORDER BY r.posting_date DESC, r.posting_time DESC, r.number DESC LIMIT 1`;
    // get_last_purchase_details: the newer of the last PO and the last receipt (a PO only when strictly newer).
    const last = po && pr ? (po.date > pr.date ? po : pr) : po ?? pr;
    let rate: number | null = null;
    if (last && (!isSubmit || last.date > thisDate)) rate = last.rate / (last.cf || 1);
    else if (isSubmit) rate = num(r.base_net_rate) / (num(r.conversion_factor) || 1);
    const item = await tx.purchaseItem.findUnique({ where: { code }, select: { id: true, legacy: true } });
    if (!item) continue;
    await tx.purchaseItem.update({
      where: { id: item.id },
      data: { lastPurchaseRate: dbDecimal(flt(rate ?? 0)), legacy: { ...((item.legacy ?? {}) as Record<string, unknown>), last_purchase_rate: dbDecimal(flt(rate ?? 0)) } as Prisma.InputJsonObject },
    });
  }
}

/** Everything a receipt's submission does outside it (the receipt is already stored as submitted). */
export async function applyReceiptSubmission(tx: Tx, doc: Doc, isStock: (itemCode: string) => boolean, who: { email: string; now: Date; stamp: string }) {
  const orders = rowsOf(doc.items).map((r) => str(r.purchase_order));
  const poBins = await refreshOrdersReceived(tx, orders, who);
  await postEntries(tx, receiptStockEntries(doc, isStock), { email: who.email, now: who.now });
  for (const b of poBins) await refreshBin(tx, b.itemCode, b.warehouse, who);
  await linkGateEntry(tx, str(doc.gate_entry), { number: str(doc.name), postingDate: str(doc.posting_date) }, null, who);
  await lastPurchaseRates(tx, doc, true);
}

/** Everything a receipt's cancellation undoes (the receipt is already stored as cancelled). */
export async function applyReceiptCancellation(tx: Tx, doc: Doc, who: { email: string; now: Date; stamp: string }) {
  await cancelEntries(tx, "Purchase Receipt", str(doc.name), { email: who.email, now: who.now });
  const poBins = await refreshOrdersReceived(tx, rowsOf(doc.items).map((r) => str(r.purchase_order)), who);
  for (const b of poBins) await refreshBin(tx, b.itemCode, b.warehouse, who);
  await linkGateEntry(tx, str(doc.gate_entry), null, str(doc.name), who);
  await lastPurchaseRates(tx, doc, false);
}
