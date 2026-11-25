// Purchase Receipts: one receipt as its form held it (Phase II, owner 21-11-2026; the list is the old
// list view, doc/screens.ts RECEIPT_SCREEN). A receipt is assembled as the old form's document — its fields and its child rows
// (items, taxes, the add-on's services) under their ERPNext fieldnames — from the imported rows,
// each typed by its captured layout. Takes the database client (pages pass server/db's).

import { Prisma, type PrismaClient } from "@prisma/client";
import { gstBreakupHtml } from "../doc/gst-breakup";
import { LAYOUTS } from "../doc/layouts";
import { typedDoc } from "../doc/values";

type Legacy = Record<string, unknown>;
const rowsOf = (doctype: string, rows: { legacy: Prisma.JsonValue }[]) => {
  const layout = LAYOUTS[doctype];
  return rows.map((r) => (layout ? typedDoc(layout, (r.legacy ?? {}) as Legacy) : ((r.legacy ?? {}) as Legacy)));
};

/** One receipt as its form held it, with what its links open here. Null when there is no such receipt. */
export async function loadReceiptDoc(db: PrismaClient, id: string) {
  const r = await db.purchaseReceipt.findUnique({
    where: { id },
    include: {
      items: { orderBy: { idx: "asc" }, select: { legacy: true, itemCode: true, itemId: true, orderNumber: true, orderId: true } },
      taxes: { orderBy: { idx: "asc" }, select: { legacy: true } },
      serviceItems: { orderBy: { idx: "asc" }, select: { legacy: true } },
    },
  });
  if (!r) return null;
  const layout = LAYOUTS["Purchase Receipt"];
  const doc: Legacy = {
    ...typedDoc(layout, (r.legacy ?? {}) as Legacy),
    items: rowsOf("Purchase Receipt Item", r.items),
    taxes: rowsOf("Purchase Taxes and Charges", r.taxes),
    services_items: rowsOf("Services Items", r.serviceItems),
  };
  const company = await db.purchaseCompany.findUnique({ where: { code: r.companyCode }, select: { defaultCurrency: true } });
  // India Compliance built the GST Breakup each time the form loaded (never stored): the same here.
  // GST Settings › HSN-wise tax breakup was on; the tax amount's precision is the currency precision.
  const supplierAddressState =
    doc.gst_category === "Unregistered" && doc.supplier_address
      ? (await db.purchaseAddress.findUnique({ where: { code: String(doc.supplier_address) }, select: { gstStateNumber: true } }))?.gstStateNumber ?? null
      : null;
  doc.gst_breakup_table = gstBreakupHtml(doc, { hsnWise: true, precision: 3, supplierAddressState }) ?? doc.gst_breakup_table;
  // Purchase Taxes and Charges Template shows its title in links ("Input GST In-state", not its name).
  const template = r.taxesAndCharges
    ? await db.purchaseTaxTemplate.findUnique({ where: { code: r.taxesAndCharges }, select: { code: true, title: true } })
    : null;
  return {
    receipt: r,
    doc,
    companyCurrency: company?.defaultCurrency ?? "INR",
    linkTitles: new Map<string, string>(template ? [[`Purchase Taxes and Charges Template\u0000${template.code}`, template.title]] : []),
    ids: {
      supplier: r.supplierId,
      items: new Map(r.items.filter((i) => i.itemId).map((i) => [i.itemCode, i.itemId!])),
      orders: new Map(r.items.filter((i) => i.orderId && i.orderNumber).map((i) => [i.orderNumber!, i.orderId!])),
    },
  };
}

/**
 * The receipts before and after this one in the list's order (posting date, then last update), for
 * ‹ ›. Compared with the row's own stored values in SQL: a timestamp passed in from here would be
 * shifted by the database session's time zone.
 */
export async function adjacentReceipts(db: PrismaClient, id: string) {
  const [prev] = await db.$queryRaw<{ id: string }[]>`
    SELECT r.id FROM purchase_receipts r, (SELECT posting_date, updated_at, id FROM purchase_receipts WHERE id = ${id}) me
    WHERE (r.posting_date, r.updated_at, r.id) > (me.posting_date, me.updated_at, me.id)
    ORDER BY r.posting_date ASC, r.updated_at ASC, r.id ASC LIMIT 1`;
  const [next] = await db.$queryRaw<{ id: string }[]>`
    SELECT r.id FROM purchase_receipts r, (SELECT posting_date, updated_at, id FROM purchase_receipts WHERE id = ${id}) me
    WHERE (r.posting_date, r.updated_at, r.id) < (me.posting_date, me.updated_at, me.id)
    ORDER BY r.posting_date DESC, r.updated_at DESC, r.id DESC LIMIT 1`;
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}
