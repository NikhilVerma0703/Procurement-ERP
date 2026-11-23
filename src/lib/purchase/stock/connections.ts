// A Purchase Receipt's Connections tab, as the old form's dashboard showed it (Phase II, owner
// 21-11-2026): ERPNext 14.92's purchase_receipt_dashboard.py with India Compliance's GST Logs group, as
// the live site served it on 21-11-2026 — Related (Purchase Invoice, Landed Cost Voucher, Asset),
// Reference (Material Request, Purchase Order, Quality Inspection, Project), GST Logs (e-Waybill Log,
// Integration Request), Returns (Purchase Receipt), Subscription (Auto Repeat) — each with how many
// documents link to this receipt. On the old site no invoice row, asset, e-waybill log, integration
// request or auto repeat ever referred to a receipt (checked in the 21-11 backup), so those count 0.

import type { PrismaClient } from "@prisma/client";
import { orderPath, receiptPath } from "../routes";

export interface ConnectionItem {
  doctype: string;
  count: number;
  /** Where the link opens: the one linked document's page here, when there is exactly one. */
  href: string | null;
}
export interface ConnectionGroup {
  label: string;
  items: ConnectionItem[];
}

export async function receiptConnections(db: PrismaClient, receiptId: string): Promise<ConnectionGroup[]> {
  const [items, lcvs, returns] = await Promise.all([
    db.purchaseReceiptItem.findMany({
      where: { receiptId },
      select: { orderNumber: true, orderId: true, materialRequest: true, qualityInspection: true, legacy: true },
    }),
    db.purchaseLandedCostReceipt.findMany({ where: { receiptId, receiptDocumentType: "Purchase Receipt" }, select: { voucherId: true } }),
    db.$queryRaw<{ id: string }[]>`
      SELECT r.id FROM purchase_receipts r, purchase_receipts me
      WHERE me.id = ${receiptId} AND r.legacy->>'is_return' = '1' AND r.legacy->>'return_against' = me.number`,
  ]);
  const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))];
  const orders = new Map(items.filter((i) => i.orderNumber).map((i) => [i.orderNumber!, i.orderId]));
  const projects = distinct(items.map((i) => (i.legacy as Record<string, string | null> | null)?.project));
  const one = (n: number, href: string | null) => (n === 1 ? href : null);
  const [onlyOrder] = [...orders.values()];
  return [
    {
      label: "Related",
      items: [
        { doctype: "Purchase Invoice", count: 0, href: null },
        { doctype: "Landed Cost Voucher", count: new Set(lcvs.map((l) => l.voucherId)).size, href: null },
        { doctype: "Asset", count: 0, href: null },
      ],
    },
    {
      label: "Reference",
      items: [
        { doctype: "Material Request", count: distinct(items.map((i) => i.materialRequest)).length, href: null },
        { doctype: "Purchase Order", count: orders.size, href: one(orders.size, onlyOrder ? orderPath(onlyOrder) : null) },
        { doctype: "Quality Inspection", count: distinct(items.map((i) => i.qualityInspection)).length, href: null },
        { doctype: "Project", count: projects.length, href: null },
      ],
    },
    {
      label: "GST Logs",
      items: [
        { doctype: "e-Waybill Log", count: 0, href: null },
        { doctype: "Integration Request", count: 0, href: null },
      ],
    },
    { label: "Returns", items: [{ doctype: "Purchase Receipt", count: returns.length, href: one(returns.length, returns[0] ? receiptPath(returns[0].id) : null) }] },
    { label: "Subscription", items: [{ doctype: "Auto Repeat", count: 0, href: null }] },
  ];
}
