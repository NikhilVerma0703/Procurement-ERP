// Material Request entered here (owner, 26-11-2026: "The '+ Add Material Request' button is completely
// missing. This is one of the most important functionalities"), as ERPNext 14.92 ran it
// (stock/doctype/material_request/material_request.py, material_request.js, controllers/status_updater.py):
//
//   * a row's item fills its name, description, group, brand, HSN code, stock UOM and UOM (the item's
//     purchase UOM for a Purchase request, else its stock UOM) with the conversion factor from the item's
//     UOM table; Stock Qty = Qty × factor; the row takes the request's Required By and its Set Source /
//     Set Target Warehouse when it has none (reset_default_field_value), and its item's default
//     warehouse after that; Actual and Projected Qty come from the item's Bin;
//   * validate_schedule_date: a row's Required By may not be before the Transaction Date; the request's
//     own Required By is its rows' earliest;
//   * set_title: "<Purpose> Request for <the first three item names>" (100 characters at most), once;
//   * the status (status_updater's map, last rule that holds): Draft; on submit Pending, then Partially
//     Ordered / Ordered / Issued / Transferred / Received as rows are ordered or received; Stopped;
//     Cancelled;
//   * update_requested_qty: a submitted, not stopped request's rows not yet ordered count in the Bin's
//     requested (indented) qty, a Material Issue's against it — and so in its projected qty;
//   * Cancel is refused while a submitted Purchase Order or Stock Entry made from it exists; Stop and
//     Re-open change only the status (and the requested qty).
// Server only.
import "server-only";
import { Prisma } from "@prisma/client";
import { dbDecimal, flt } from "../calc/pymath";
import type { Doc } from "../doc/store";
import { materialRequestColumns, materialRequestItemColumns } from "../migrate/stock-build";
import { refreshBin } from "./stock-post";

type Tx = Prisma.TransactionClient;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const rowsOf = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);

export class MaterialRequestError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}
const refuse = (message: string, field?: string): never => {
  throw new MaterialRequestError(message, field);
};

/** The item's values a row takes (get_item_details, as material_request.js asked for them). */
export async function materialRequestRowDetails(tx: Tx | typeof import("../server/db").db, row: Doc, parent: Doc): Promise<Doc> {
  const code = str(row.item_code);
  if (!code) return {};
  const item = await tx.purchaseItem.findUnique({
    where: { code },
    select: {
      itemName: true, description: true, brand: true, stockUom: true, purchaseUom: true, gstHsnCode: true, image: true, minOrderQty: true,
      itemGroup: { select: { code: true } }, uomConversions: { select: { uom: true, conversionFactor: true } },
      defaults: { select: { defaultWarehouse: { select: { code: true } }, expenseAccount: { select: { code: true } }, buyingCostCenter: { select: { code: true } } } },
    },
  });
  if (!item) return {};
  const type = str(parent.material_request_type);
  const uom = str(row.uom) && str(row.__item) === code ? str(row.uom) : type === "Purchase" ? item.purchaseUom || item.stockUom : item.stockUom;
  const cf = uom === item.stockUom ? 1 : Number(item.uomConversions.find((u) => u.uom === uom)?.conversionFactor ?? 0) || 1;
  const def = item.defaults[0];
  const warehouse = str(row.warehouse) || str(parent.set_warehouse) || def?.defaultWarehouse?.code || "";
  const out: Doc = {
    item_name: item.itemName, description: item.description ?? item.itemName, item_group: item.itemGroup?.code ?? "", brand: item.brand ?? "",
    gst_hsn_code: item.gstHsnCode ?? "", image: item.image ?? "", stock_uom: item.stockUom, uom, conversion_factor: cf,
    min_order_qty: Number(item.minOrderQty), warehouse, schedule_date: str(row.schedule_date) || str(parent.schedule_date),
    expense_account: str(row.expense_account) || def?.expenseAccount?.code || "", cost_center: str(row.cost_center) || def?.buyingCostCenter?.code || "",
    stock_qty: flt(num(row.qty) * cf, 9),
  };
  if (warehouse) {
    const bin = await tx.purchaseBin.findFirst({ where: { itemCode: code, warehouseCode: warehouse }, select: { actualQty: true, projectedQty: true } });
    out.actual_qty = Number(bin?.actualQty ?? 0);
    out.projected_qty = Number(bin?.projectedQty ?? 0);
  }
  return out;
}

/** The request's status by status_updater's map (the last rule that holds). */
export function materialRequestStatus(doc: Doc): string {
  const docstatus = num(doc.docstatus);
  const stopped = str(doc.status) === "Stopped";
  const type = str(doc.material_request_type);
  const ordered = flt(num(doc.per_ordered), 9);
  const received = flt(num(doc.per_received), 9);
  const rules: [string, boolean][] = [
    ["Draft", true],
    ["Stopped", stopped],
    ["Cancelled", docstatus === 2],
    ["Pending", !stopped && ordered === 0 && docstatus === 1],
    ["Ordered", !stopped && ordered === 100 && docstatus === 1 && type === "Purchase"],
    ["Transferred", !stopped && ordered === 100 && docstatus === 1 && type === "Material Transfer"],
    ["Issued", !stopped && ordered === 100 && docstatus === 1 && type === "Material Issue"],
    ["Received", !stopped && received === 100 && docstatus === 1 && type === "Purchase"],
    ["Partially Received", !stopped && received > 0 && received < 100 && docstatus === 1 && type === "Purchase"],
    ["Partially Ordered", !stopped && ordered < 100 && ordered > 0 && docstatus === 1],
    ["Manufactured", !stopped && ordered === 100 && docstatus === 1 && type === "Manufacture"],
  ];
  for (const [status, holds] of [...rules].reverse()) if (holds) return status;
  return "Draft";
}

/** validate(): rows filled and checked, the request's dates, title and status. */
export async function validateMaterialRequest(tx: Tx, doc: Doc): Promise<void> {
  const type = str(doc.material_request_type);
  if (!["Purchase", "Material Transfer", "Material Issue", "Manufacture", "Customer Provided"].includes(type)) refuse("Purpose must be one of Purchase, Material Transfer, Material Issue, Manufacture, Customer Provided", "material_request_type");
  if (type === "Customer Provided" && !str(doc.customer)) refuse("Customer is mandatory for 'Customer Provided Item'", "customer");
  const rows = rowsOf(doc.items);
  for (const [i, r] of rows.entries()) {
    // reset_default_field_value: the request's Set Source / Target Warehouse fill the rows that have none.
    if (!str(r.warehouse) && str(doc.set_warehouse)) r.warehouse = doc.set_warehouse;
    if (!str(r.from_warehouse) && str(doc.set_from_warehouse)) r.from_warehouse = doc.set_from_warehouse;
    if (!str(r.schedule_date) && str(doc.schedule_date)) r.schedule_date = doc.schedule_date;
    const item = await tx.purchaseItem.findUnique({ where: { code: str(r.item_code) }, select: { stockUom: true, disabled: true, hasVariants: true, uomConversions: { select: { uom: true, conversionFactor: true } } } });
    if (!item) refuse(`Row #${i + 1}: Item ${str(r.item_code)} not found`);
    if (item!.disabled) refuse(`Item ${str(r.item_code)} is disabled`);
    if (item!.hasVariants) refuse(`Row #${i + 1}: ${str(r.item_code)} is a template, please select one of its variants`);
    const details = await materialRequestRowDetails(tx, { ...r, __item: r.item_code }, doc);
    for (const k of ["item_name", "description", "item_group", "stock_uom", "gst_hsn_code"]) if (!str(r[k])) r[k] = details[k];
    if (!str(r.uom)) r.uom = details.uom;
    if (str(r.uom) === item!.stockUom) r.conversion_factor = 1;
    else {
      const cf = item!.uomConversions.find((u) => u.uom === str(r.uom));
      if (!cf) refuse(`Row #${i + 1}: UOM Conversion factor is required for UOM: ${str(r.uom)} in Item: ${str(r.item_code)}`);
      if (!num(r.conversion_factor)) r.conversion_factor = Number(cf!.conversionFactor);
    }
    r.stock_qty = flt(num(r.qty) * num(r.conversion_factor), 9);
    if (num(r.qty) <= 0) refuse(`Row #${i + 1}: Quantity must be greater than zero`);
    if (str(r.schedule_date) && str(doc.transaction_date) && str(r.schedule_date) < str(doc.transaction_date)) refuse(`Row #${i + 1}: Reqd by Date cannot be before Transaction Date`);
  }
  // BuyingController.validate_schedule_date: the request's Required By is its rows' earliest.
  const dates = rows.map((r) => str(r.schedule_date)).filter(Boolean).sort();
  if (dates.length) doc.schedule_date = dates[0];
  if (!str(doc.title)) {
    const names = rows.map((r) => str(r.item_name)).slice(0, 3).join(", ");
    doc.title = `${type} Request for ${names}`.slice(0, 100);
  }
  doc.status = materialRequestStatus({ ...doc, status: num(doc.docstatus) === 0 ? "" : doc.status });
}

/** get_indented_qty: the requested qty of an item in a warehouse, from every open request. */
async function refreshRequested(tx: Tx, itemCode: string, warehouse: string, who: { email: string; stamp: string }) {
  const [{ inward, outward }] = await tx.$queryRaw<{ inward: number | null; outward: number | null }[]>`
    SELECT
      SUM(CASE WHEN m.material_request_type IN ('Purchase', 'Manufacture', 'Customer Provided', 'Material Transfer') THEN i.stock_qty - i.ordered_qty END)::float8 AS inward,
      SUM(CASE WHEN m.material_request_type = 'Material Issue' THEN i.stock_qty - i.ordered_qty END)::float8 AS outward
    FROM purchase_material_request_items i JOIN purchase_material_requests m ON m.id = i.request_id
    WHERE i.item_code = ${itemCode} AND i.warehouse_code = ${warehouse} AND i.stock_qty > i.ordered_qty
      AND m.status <> 'Stopped' AND m.doc_status = 'Submitted'`;
  const requested = flt((inward ?? 0) - (outward ?? 0), 9);
  const bin = await tx.purchaseBin.findFirst({ where: { itemCode, warehouseCode: warehouse }, select: { id: true, legacy: true } });
  if (bin) {
    await tx.purchaseBin.update({ where: { id: bin.id }, data: { legacy: { ...((bin.legacy ?? {}) as Record<string, unknown>), indented_qty: dbDecimal(requested) } as Prisma.InputJsonObject } });
  } else if (!requested) return;
  await refreshBin(tx, itemCode, warehouse, who);
  if (!bin) {
    const made = await tx.purchaseBin.findFirst({ where: { itemCode, warehouseCode: warehouse }, select: { id: true, legacy: true } });
    if (made) {
      await tx.purchaseBin.update({ where: { id: made.id }, data: { legacy: { ...((made.legacy ?? {}) as Record<string, unknown>), indented_qty: dbDecimal(requested) } as Prisma.InputJsonObject } });
      await refreshBin(tx, itemCode, warehouse, who);
    }
  }
}

/** update_requested_qty for each of the request's item / warehouse pairs. */
export async function updateRequestedQty(tx: Tx, doc: Doc, who: { email: string; stamp: string }): Promise<void> {
  const pairs = new Map<string, [string, string]>();
  for (const r of rowsOf(doc.items)) if (str(r.item_code) && str(r.warehouse)) pairs.set(`${str(r.item_code)}\u0000${str(r.warehouse)}`, [str(r.item_code), str(r.warehouse)]);
  for (const [item, warehouse] of pairs.values()) await refreshRequested(tx, item, warehouse, who);
}

/** Cancel: refused while a submitted document made from the request exists. */
export async function materialRequestCancelRefusal(tx: Tx, name: string): Promise<string | null> {
  const po = await tx.purchaseOrderItem.findFirst({ where: { materialRequest: name, order: { docStatus: "SUBMITTED" } }, select: { order: { select: { number: true } } } });
  if (po) return `Cannot cancel because submitted Purchase Order ${po.order.number} is linked with Material Request ${name}`;
  const se = await tx.purchaseStockEntryDetail.findFirst({ where: { materialRequest: name, entry: { docStatus: "SUBMITTED" } }, select: { entry: { select: { number: true } } } });
  if (se) return `Cannot cancel because submitted Stock Entry ${se.entry.number} is linked with Material Request ${name}`;
  return null;
}

/** Writes the request and its rows (the importer's columns, so a request made here is stored as an imported one). */
export async function writeMaterialRequest(tx: Tx, id: string | null, legacy: Doc): Promise<string> {
  const header: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(legacy)) if (!Array.isArray(v)) header[k] = v === null || v === undefined ? null : String(v);
  const amended = str(header.amended_from) ? await tx.purchaseMaterialRequest.findUnique({ where: { number: str(header.amended_from) }, select: { id: true } }) : null;
  const cols = materialRequestColumns(header, { amendedFromId: amended?.id ?? null });
  const { createdAt: _c, ...data } = cols;
  void _c;
  const reqId = id
    ? (await tx.purchaseMaterialRequest.update({ where: { id }, data, select: { id: true } })).id
    : (await tx.purchaseMaterialRequest.create({ data: cols, select: { id: true } })).id;
  await tx.purchaseMaterialRequestItem.deleteMany({ where: { requestId: reqId } });
  const rows = rowsOf(legacy.items) as Record<string, string | null>[];
  if (rows.length) {
    const codes = [...new Set(rows.map((r) => str(r.item_code)))];
    const whs = [...new Set(rows.map((r) => str(r.warehouse)).filter(Boolean))];
    const [items, warehouses] = await Promise.all([
      tx.purchaseItem.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }),
      tx.purchaseWarehouse.findMany({ where: { code: { in: whs } }, select: { id: true, code: true } }),
    ]);
    const itemId = new Map(items.map((x) => [x.code, x.id]));
    const whId = new Map(warehouses.map((x) => [x.code, x.id]));
    await tx.purchaseMaterialRequestItem.createMany({
      data: rows.map((r) => ({
        requestId: reqId,
        ...materialRequestItemColumns(r, { itemId: itemId.get(str(r.item_code)) ?? null, warehouseId: whId.get(str(r.warehouse)) ?? null }),
      })),
    });
  }
  return reqId;
}

/**
 * status_updater for the documents made from requests (a PO's rows, a Stock Entry's): each request row's
 * Completed Qty is what the submitted documents made from it hold in stock units; % Ordered the share
 * of the request done (each row counted up to its own Stock Qty); the status follows; the requested qty
 * in the Bins too.
 */
export async function refreshMaterialRequestsOrdered(
  tx: Tx,
  names: readonly string[],
  who: { email: string; stamp: string },
  /** The document being submitted (its DocType): a row may not take a request row past its Stock Qty (validate_qty). */
  opts: { overLimit?: string } = {},
): Promise<void> {
  for (const name of [...new Set(names.filter(Boolean))]) {
    const mr = await tx.purchaseMaterialRequest.findUnique({ where: { number: name }, select: { id: true, legacy: true, items: { select: { id: true, erpnextName: true, itemCode: true, stockQty: true, legacy: true } } } });
    if (!mr) continue;
    let done = 0;
    let total = 0;
    for (const it of mr.items) {
      const [{ q }] = await tx.$queryRaw<{ q: number | null }[]>`
        SELECT (COALESCE((SELECT SUM(i.stock_qty) FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.order_id
                           WHERE i.material_request_item = ${it.erpnextName} AND o.doc_status = 'Submitted'), 0)
              + COALESCE((SELECT SUM(d.transfer_qty) FROM purchase_stock_entry_details d JOIN purchase_stock_entries e ON e.id = d.entry_id
                           WHERE d.material_request_item = ${it.erpnextName} AND e.doc_status = 'Submitted'), 0))::float8 AS q`;
      const ordered = flt(q ?? 0, 9);
      const stock = Number(it.stockQty);
      if (opts.overLimit && ordered > stock + 1e-9) {
        const over = flt(ordered - stock, 3);
        refuse(`This document is over limit by Stock Qty ${over} for item ${it.itemCode}. Are you making another ${opts.overLimit} against the same Material Request Item?`);
      }
      done += Math.min(Math.abs(ordered), Math.abs(stock));
      total += Math.abs(stock);
      await tx.purchaseMaterialRequestItem.update({
        where: { id: it.id },
        data: { orderedQty: new Prisma.Decimal(ordered), legacy: { ...((it.legacy ?? {}) as Record<string, unknown>), ordered_qty: dbDecimal(ordered), modified: who.stamp } as Prisma.InputJsonObject },
      });
    }
    const perOrdered = total ? flt((done / total) * 100, 9) : 0;
    const head = (mr.legacy ?? {}) as Doc;
    const status = materialRequestStatus({ ...head, per_ordered: perOrdered });
    await tx.purchaseMaterialRequest.update({
      where: { id: mr.id },
      data: { perOrdered: new Prisma.Decimal(perOrdered), status, legacy: { ...head, per_ordered: dbDecimal(perOrdered), status, modified: who.stamp, modified_by: who.email } as Prisma.InputJsonObject },
    });
    const rows = await tx.purchaseMaterialRequestItem.findMany({ where: { requestId: mr.id }, select: { itemCode: true, warehouseCode: true } });
    await updateRequestedQty(tx, { items: rows.map((r) => ({ item_code: r.itemCode, warehouse: r.warehouseCode })) }, who);
  }
}

/** A PO row made from a request row must point at a submitted Purchase request's row of the same item. */
export async function materialRequestRowRefusal(tx: Tx | typeof import("../server/db").db, rows: { itemCode: string; materialRequest?: string | null; materialRequestItem?: string | null }[]): Promise<string | null> {
  for (const [i, r] of rows.entries()) {
    if (!r.materialRequestItem) continue;
    const it = await tx.purchaseMaterialRequestItem.findUnique({ where: { erpnextName: r.materialRequestItem }, select: { itemCode: true, request: { select: { number: true, docStatus: true, status: true, materialRequestType: true } } } });
    if (!it || it.request.number !== r.materialRequest) return `Row #${i + 1}: Material Request ${r.materialRequest ?? ""} not found`;
    if (it.request.docStatus !== "SUBMITTED") return `Row #${i + 1}: Material Request ${it.request.number} is not submitted`;
    if (it.request.status === "Stopped") return `Row #${i + 1}: Material Request ${it.request.number} is Stopped`;
    if (it.itemCode !== r.itemCode) return `Row #${i + 1}: Item ${r.itemCode} is not in Material Request ${it.request.number}`;
  }
  return null;
}
