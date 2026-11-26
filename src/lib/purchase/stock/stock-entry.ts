// Stock Entry entered here (owner, 26-11-2026: "The '+ Add Stock Entry' button is missing. Add the complete
// functionality"), as ERPNext 14.92 ran it (stock/doctype/stock_entry/stock_entry.py, stock_entry.js) for
// the purposes the store enters by hand — Material Issue (4,041 on the old site), Material Receipt and
// Material Transfer:
//
//   * a row's item fills its name, description, group, UOMs, conversion factor, Difference Account (a
//     Material Issue: the item's expense account, else the company's default expense account; otherwise
//     the company's stock adjustment account), Cost Center, the stock it finds in its warehouse (Actual
//     Qty) and its Basic Rate — what going out would cost by the FIFO queue at the posting time, or, coming
//     in, the valuation rate then;
//   * validate_warehouse: a Material Issue's rows take the Default Source Warehouse (no target), a
//     Material Receipt's the Default Target Warehouse (no source), a Transfer's both, never the same;
//   * set_transfer_qty, calculate_rate_and_amount: Qty as per Stock UOM, Basic Amount, the Additional
//     Costs shared over the incoming rows by their Basic Amount, Valuation Rate, Amount, the totals;
//   * a row made from a Material Request row must be that row's item; the request's Completed Qty and
//     status follow the submitted entries (status_updater), never past the request's own Stock Qty;
//   * Submit posts each row to the stock ledger (out of the source warehouse, into the target), valued
//     by the FIFO engine, refused if stock would go below zero; Cancel reverses it (stock/stock-post.ts).
// Manufacture, Repack, Send to Subcontractor and the Work Order transfers are made from Work Orders and
// BOMs, which this module does not hold (docs/12 §8, decision 4): they are refused here. Rows of items
// kept by batch or serial number are refused too (their ledger is not posted here yet). Server only.
import "server-only";
import { Prisma } from "@prisma/client";
import { flt } from "../calc/pymath";
import type { Doc } from "../doc/store";
import { stockEntryColumns, stockEntryDetailColumns } from "../migrate/stock-build";
import { refreshMaterialRequestsOrdered } from "./material-request";
import { cancelEntries, postEntries, stockAt, type PostEntry } from "./stock-post";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof import("../server/db").db;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const rowsOf = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);
const P = 3; // the site's currency and float precision

export class StockEntryError extends Error {}
const refuse = (message: string): never => {
  throw new StockEntryError(message);
};

/** The purposes entered here. */
export const ENTERED_PURPOSES = ["Material Issue", "Material Receipt", "Material Transfer"] as const;
const SOURCE_MANDATORY = new Set(["Material Issue", "Material Transfer", "Send to Subcontractor", "Material Transfer for Manufacture", "Material Consumption for Manufacture"]);
const TARGET_MANDATORY = new Set(["Material Receipt", "Material Transfer", "Send to Subcontractor", "Material Transfer for Manufacture"]);

async function companyDefaults(db: Db, company: string) {
  const c = await db.purchaseCompany.findUnique({ where: { code: company }, select: { legacy: true } });
  const l = (c?.legacy ?? {}) as Record<string, string | null>;
  return { expense: l.default_expense_account ?? "", adjustment: l.stock_adjustment_account ?? "", costCenter: l.cost_center ?? "", letterHead: l.default_letter_head ?? "" };
}

/** The company's default letter head (a new entry's Letter Head). */
export async function defaultLetterHead(db: Db, company: string): Promise<string> {
  return (await companyDefaults(db, company)).letterHead;
}

/** The posting moment: the entered one with "Edit Posting Date and Time", else now (the site's clock). */
function postingOf(doc: Doc): { date: string; time: string } {
  if (num(doc.set_posting_time) && str(doc.posting_date)) return { date: str(doc.posting_date), time: str(doc.posting_time) || "00:00:00" };
  const now = new Date(Date.now() + 330 * 60_000).toISOString();
  return { date: now.slice(0, 10), time: `${now.slice(11, 19)}.${now.slice(20, 23)}000` };
}

/** stock_entry.get_item_details and get_warehouse_details: what a row's item and warehouse fill. */
export async function stockEntryRowDetails(db: Db, row: Doc, parent: Doc): Promise<Doc> {
  const code = str(row.item_code);
  if (!code) return {};
  const item = await db.purchaseItem.findUnique({
    where: { code },
    select: {
      itemName: true, description: true, stockUom: true, image: true, hasBatchNo: true, hasSerialNo: true,
      itemGroup: { select: { code: true } }, uomConversions: { select: { uom: true, conversionFactor: true } },
      defaults: { select: { expenseAccount: { select: { code: true } }, buyingCostCenter: { select: { code: true } } } },
    },
  });
  if (!item) return {};
  const company = str(parent.company);
  const def = await companyDefaults(db, company);
  const purpose = str(parent.purpose);
  const itemExpense = item.defaults[0]?.expenseAccount?.code ?? "";
  const uom = str(row.uom) && str(row.__item) === code ? str(row.uom) : item.stockUom;
  const cf = uom === item.stockUom ? 1 : Number(item.uomConversions.find((u) => u.uom === uom)?.conversionFactor ?? 0) || 1;
  const transferQty = flt(num(row.qty) * cf, 9);
  const out: Doc = {
    item_name: item.itemName, description: item.description ?? item.itemName, item_group: item.itemGroup?.code ?? "", image: item.image ?? "",
    stock_uom: item.stockUom, uom, conversion_factor: cf, transfer_qty: transferQty,
    expense_account: str(row.expense_account) || (purpose === "Material Issue" ? itemExpense || def.expense : itemExpense || def.adjustment),
    cost_center: str(row.cost_center) || item.defaults[0]?.buyingCostCenter?.code || def.costCenter,
    s_warehouse: str(row.s_warehouse) || (SOURCE_MANDATORY.has(purpose) ? str(parent.from_warehouse) : ""),
    t_warehouse: str(row.t_warehouse) || (TARGET_MANDATORY.has(purpose) ? str(parent.to_warehouse) : ""),
  };
  const { date, time } = postingOf(parent);
  const source = str(out.s_warehouse);
  const target = str(out.t_warehouse);
  if (source || target) {
    const s = await stockAt(db, code, source || target, date, time, source ? Math.max(transferQty, 0) : 0);
    out.actual_qty = s.actualQty;
    // An incoming row keeps the rate typed in it.
    if (source || !num(row.basic_rate)) out.basic_rate = flt(s.rate, 9);
  }
  return out;
}

/** validate(): purpose, warehouses, rows filled, rates and amounts, totals. Mutates `doc`. */
export async function validateStockEntry(tx: Tx, doc: Doc, opts: { submitting: boolean }): Promise<void> {
  const type = await tx.purchaseStockEntryType.findUnique({ where: { code: str(doc.stock_entry_type) }, select: { legacy: true } });
  if (!type) refuse(`Stock Entry Type ${str(doc.stock_entry_type)} not found`);
  const purpose = str(((type!.legacy ?? {}) as Record<string, string>).purpose) || str(doc.stock_entry_type);
  doc.purpose = purpose;
  if (!(ENTERED_PURPOSES as readonly string[]).includes(purpose)) {
    refuse(`A ${purpose} entry is made from a Work Order or BOM, which are not entered in this ERP. Only Material Issue, Material Receipt and Material Transfer entries are made here.`);
  }
  const { date, time } = postingOf(doc);
  doc.posting_date = date;
  doc.posting_time = time;
  // validate_warehouse
  if (SOURCE_MANDATORY.has(purpose) && !TARGET_MANDATORY.has(purpose)) doc.to_warehouse = "";
  else if (TARGET_MANDATORY.has(purpose) && !SOURCE_MANDATORY.has(purpose)) doc.from_warehouse = "";
  const rows = rowsOf(doc.items);
  if (!rows.length) refuse("Items are required");
  const def = await companyDefaults(tx, str(doc.company));
  for (const [i, r] of rows.entries()) {
    const idx = i + 1;
    if (SOURCE_MANDATORY.has(purpose) && !TARGET_MANDATORY.has(purpose)) r.t_warehouse = "";
    if (TARGET_MANDATORY.has(purpose) && !SOURCE_MANDATORY.has(purpose)) r.s_warehouse = "";
    if (!str(r.s_warehouse) && !str(r.t_warehouse)) {
      r.s_warehouse = doc.from_warehouse ?? "";
      r.t_warehouse = doc.to_warehouse ?? "";
    }
    if (SOURCE_MANDATORY.has(purpose) && !str(r.s_warehouse)) {
      if (str(doc.from_warehouse)) r.s_warehouse = doc.from_warehouse;
      else refuse(`Source warehouse is mandatory for row ${idx}`);
    }
    if (TARGET_MANDATORY.has(purpose) && !str(r.t_warehouse)) {
      if (str(doc.to_warehouse)) r.t_warehouse = doc.to_warehouse;
      else refuse(`Target warehouse is mandatory for row ${idx}`);
    }
    if (str(r.s_warehouse) === str(r.t_warehouse)) refuse(`Source and target warehouse cannot be same for row ${idx}`);
    const item = await tx.purchaseItem.findUnique({
      where: { code: str(r.item_code) },
      select: { stockUom: true, disabled: true, hasVariants: true, isStockItem: true, hasBatchNo: true, hasSerialNo: true, uomConversions: { select: { uom: true, conversionFactor: true } } },
    });
    if (!item) refuse(`Row #${idx}: Item ${str(r.item_code)} not found`);
    const it = item!;
    if (it.disabled) refuse(`Item ${str(r.item_code)} is disabled`);
    if (it.hasVariants) refuse(`Row #${idx}: ${str(r.item_code)} is a template, please select one of its variants`);
    if (!it.isStockItem) refuse(`Item ${str(r.item_code)} is not a stock Item`);
    if (it.hasBatchNo || it.hasSerialNo) refuse(`Row #${idx}: Item ${str(r.item_code)} is kept by ${it.hasBatchNo ? "batch" : "serial"} number; entries of such items are not posted in this ERP yet.`);
    if (num(r.qty) <= 0) refuse(`Row ${idx}: Qty is mandatory`);
    // set_transfer_qty: the UOM's factor from the item.
    if (!str(r.uom)) r.uom = it.stockUom;
    r.stock_uom = it.stockUom;
    if (str(r.uom) === it.stockUom) r.conversion_factor = 1;
    else {
      const cf = it.uomConversions.find((u) => u.uom === str(r.uom));
      if (!cf) refuse(`Row #${idx}: UOM Conversion factor is required for UOM: ${str(r.uom)} in Item: ${str(r.item_code)}`);
      if (!num(r.conversion_factor)) r.conversion_factor = Number(cf!.conversionFactor);
    }
    r.transfer_qty = flt(num(r.qty) * num(r.conversion_factor), 9);
    const details = await stockEntryRowDetails(tx, { ...r, __item: r.item_code }, doc);
    for (const k of ["item_name", "description", "item_group"]) if (!str(r[k])) r[k] = details[k];
    if (!str(r.expense_account)) r.expense_account = purpose === "Material Issue" ? details.expense_account || def.expense : details.expense_account || def.adjustment;
    if (!str(r.cost_center)) r.cost_center = details.cost_center || def.costCenter;
    r.actual_qty = num(details.actual_qty);
    // set_rate_for_outgoing_items: a row going out is valued as the ledger will value it; one only coming
    // in keeps its typed rate, else the valuation rate then.
    if (str(r.s_warehouse)) r.basic_rate = num(details.basic_rate);
    else if (!num(r.basic_rate) && !num(r.allow_zero_valuation_rate)) r.basic_rate = num(details.basic_rate);
    r.basic_amount = flt(num(r.transfer_qty) * num(r.basic_rate), P);
    // validate_with_material_request
    if (str(r.material_request_item)) {
      const mri = await tx.purchaseMaterialRequestItem.findUnique({ where: { erpnextName: str(r.material_request_item) }, select: { itemCode: true, request: { select: { number: true, docStatus: true, status: true } } } });
      if (!mri || mri.request.number !== str(r.material_request)) refuse(`Row #${idx}: Material Request ${str(r.material_request)} not found`);
      if (mri!.itemCode !== str(r.item_code)) refuse(`Item for row ${idx} does not match Material Request`);
      if (mri!.request.docStatus !== "SUBMITTED") refuse(`Material Request ${mri!.request.number} is not submitted`);
      if (mri!.request.status === "Stopped") refuse(`Material Request ${mri!.request.number} is Stopped`);
    }
    if (opts.submitting && !num(r.basic_rate) && !num(r.allow_zero_valuation_rate) && str(r.t_warehouse) && !str(r.s_warehouse)) {
      refuse(`Valuation Rate for the Item ${str(r.item_code)}, is required to do accounting entries for Stock Entry. If the item is transacting as a zero valuation rate item in the Stock Entry, please enable 'Allow Zero Valuation Rate' in the row ${idx}.`);
    }
  }
  // distribute_additional_costs: over the incoming rows by their Basic Amount.
  const extra = rowsOf(doc.additional_costs);
  for (const c of extra) c.base_amount = num(c.amount);
  doc.total_additional_costs = flt(extra.reduce((s, c) => s + num(c.amount), 0), P);
  const incomingBasic = rows.filter((r) => str(r.t_warehouse)).reduce((s, r) => s + num(r.basic_amount), 0);
  for (const r of rows) {
    // A transfer's incoming side is the outgoing side's value.
    r.additional_cost = str(r.t_warehouse) && incomingBasic ? flt((num(r.basic_amount) / incomingBasic) * num(doc.total_additional_costs), P) : 0;
    r.valuation_rate = flt(num(r.basic_rate) + num(r.additional_cost) / num(r.transfer_qty), 9);
    r.amount = flt(num(r.basic_amount) + num(r.additional_cost), P);
  }
  doc.total_outgoing_value = flt(rows.filter((r) => str(r.s_warehouse)).reduce((s, r) => s + num(r.amount), 0), P);
  doc.total_incoming_value = flt(rows.filter((r) => str(r.t_warehouse)).reduce((s, r) => s + num(r.amount), 0), P);
  doc.value_difference = flt(num(doc.total_incoming_value) - num(doc.total_outgoing_value), P);
  doc.total_amount = flt(rows.reduce((s, r) => s + num(r.amount), 0), P);
}

/** on_submit / on_cancel: the stock ledger and the Material Requests the rows came from. */
export async function postStockEntry(tx: Tx, name: string, doc: Doc, who: { email: string; now: Date; stamp: string }, cancel: boolean): Promise<void> {
  const rows = rowsOf(doc.items);
  if (cancel) await cancelEntries(tx, "Stock Entry", name, who);
  else {
    const entries: PostEntry[] = [];
    // get_sle_for_source_warehouse, then get_sle_for_target_warehouse.
    for (const r of rows) {
      if (!str(r.s_warehouse)) continue;
      entries.push({
        itemCode: str(r.item_code), warehouse: str(r.s_warehouse), company: str(doc.company), stockUom: str(r.stock_uom) || null, actualQty: -num(r.transfer_qty),
        incomingRate: 0, outgoingRate: 0, voucherType: "Stock Entry", voucherNo: name, voucherDetailNo: str(r.name) || null,
        postingDate: str(doc.posting_date), postingTime: str(doc.posting_time),
      });
    }
    for (const r of rows) {
      if (!str(r.t_warehouse)) continue;
      entries.push({
        itemCode: str(r.item_code), warehouse: str(r.t_warehouse), company: str(doc.company), stockUom: str(r.stock_uom) || null, actualQty: num(r.transfer_qty),
        incomingRate: num(r.valuation_rate), voucherType: "Stock Entry", voucherNo: name, voucherDetailNo: str(r.name) || null,
        postingDate: str(doc.posting_date), postingTime: str(doc.posting_time),
      });
    }
    await postEntries(tx, entries, who);
  }
  const requests = rows.map((r) => str(r.material_request)).filter(Boolean);
  if (requests.length) await refreshMaterialRequestsOrdered(tx, requests, { email: who.email, stamp: who.stamp }, cancel ? {} : { overLimit: "Stock Entry" });
}

/** Writes the entry and its rows (the importer's columns, so an entry made here is stored as an imported one). */
export async function writeStockEntry(tx: Tx, id: string | null, legacy: Doc): Promise<string> {
  const header: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(legacy)) if (!Array.isArray(v)) header[k] = v === null || v === undefined ? null : String(v);
  const [type, amended] = await Promise.all([
    tx.purchaseStockEntryType.findUnique({ where: { code: str(header.stock_entry_type) }, select: { id: true } }),
    str(header.amended_from) ? tx.purchaseStockEntry.findUnique({ where: { number: str(header.amended_from) }, select: { id: true } }) : null,
  ]);
  const cols = stockEntryColumns(header, { stockEntryTypeId: type?.id ?? null, amendedFromId: amended?.id ?? null });
  const { createdAt: _c, ...data } = cols;
  void _c;
  const entryId = id ? (await tx.purchaseStockEntry.update({ where: { id }, data, select: { id: true } })).id : (await tx.purchaseStockEntry.create({ data: cols, select: { id: true } })).id;
  await tx.purchaseStockEntryDetail.deleteMany({ where: { entryId } });
  const rows = rowsOf(legacy.items) as Record<string, string | null>[];
  if (rows.length) {
    const codes = [...new Set(rows.map((r) => str(r.item_code)))];
    const whs = [...new Set(rows.flatMap((r) => [str(r.s_warehouse), str(r.t_warehouse)]).filter(Boolean))];
    const sups = [...new Set(rows.map((r) => str(r.custom_supplier)).filter(Boolean))];
    const [items, warehouses, suppliers] = await Promise.all([
      tx.purchaseItem.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }),
      tx.purchaseWarehouse.findMany({ where: { code: { in: whs } }, select: { id: true, code: true } }),
      tx.purchaseSupplier.findMany({ where: { code: { in: sups } }, select: { id: true, code: true } }),
    ]);
    const itemId = new Map(items.map((x) => [x.code, x.id]));
    const whId = new Map(warehouses.map((x) => [x.code, x.id]));
    const supId = new Map(suppliers.map((x) => [x.code, x.id]));
    await tx.purchaseStockEntryDetail.createMany({
      data: rows.map((r) => ({
        entryId,
        ...stockEntryDetailColumns(r, {
          sourceWarehouseId: whId.get(str(r.s_warehouse)) ?? null, targetWarehouseId: whId.get(str(r.t_warehouse)) ?? null,
          itemId: itemId.get(str(r.item_code)) ?? null, supplierId: supId.get(str(r.custom_supplier)) ?? null,
        }),
      })),
    });
  }
  return entryId;
}

/** Cancel: refused while a submitted document made from the entry exists (none are made here). */
export async function stockEntryCancelRefusal(_tx: Tx, _name: string): Promise<string | null> {
  return null;
}

/**
 * Create › Issue Material / Material Transfer / Material Receipt on a submitted request
 * (material_request.py make_stock_entry): the rows not yet done, each its remaining Qty, from the request's
 * warehouse (a transfer: from its Source to its Target; a Customer Provided request: into it).
 */
export async function stockEntryFromMaterialRequest(db: Db, name: string, base: Doc): Promise<Doc | { error: string }> {
  const mr = await db.purchaseMaterialRequest.findUnique({ where: { number: name }, select: { docStatus: true, status: true, materialRequestType: true, legacy: true, items: { orderBy: { idx: "asc" } } } });
  if (!mr) return { error: `Material Request ${name} not found` };
  if (mr.docStatus !== "SUBMITTED") return { error: `Material Request ${name} must be submitted` };
  if (!["Material Transfer", "Material Issue", "Customer Provided"].includes(mr.materialRequestType)) return { error: `Material Request ${name}: Purpose must be one of Material Transfer, Material Issue, Customer Provided` };
  if (mr.status === "Stopped") return { error: `Material Request ${name} is Stopped` };
  const head = (mr.legacy ?? {}) as Record<string, string | null>;
  const purpose = mr.materialRequestType === "Customer Provided" ? "Material Receipt" : mr.materialRequestType;
  const doc: Doc = { ...base, purpose, stock_entry_type: purpose, from_warehouse: head.set_from_warehouse ?? "", to_warehouse: head.set_warehouse ?? "" };
  const rows: Doc[] = [];
  for (const i of mr.items) {
    if (!(Number(i.orderedQty) < Number(i.stockQty))) continue;
    const cf = Number(i.conversionFactor) || 1;
    const qty = (Number(i.stockQty) - Number(i.orderedQty)) / cf;
    const legacy = (i.legacy ?? {}) as Record<string, string | null>;
    const row: Doc = {
      __islocal: 1, name: Math.random().toString(36).slice(2, 12), idx: rows.length + 1, docstatus: 0,
      item_code: i.itemCode, item_name: i.itemName ?? "", description: i.description ?? "", item_group: i.itemGroup ?? "",
      qty: flt(qty, 9), transfer_qty: flt(qty * cf, 9), uom: i.uom, stock_uom: i.uom, conversion_factor: cf,
      expense_account: i.expenseAccount ?? "", cost_center: i.costCenter ?? "",
      material_request: name, material_request_item: i.erpnextName,
      s_warehouse: "", t_warehouse: "", basic_rate: 0, allow_zero_valuation_rate: mr.materialRequestType === "Customer Provided" ? 1 : 0,
    };
    if (mr.materialRequestType === "Material Transfer" || mr.materialRequestType === "Customer Provided") row.t_warehouse = i.warehouseCode ?? "";
    else row.s_warehouse = i.warehouseCode ?? "";
    if (mr.materialRequestType === "Material Transfer") row.s_warehouse = legacy.from_warehouse ?? i.fromWarehouse ?? "";
    const d = await stockEntryRowDetails(db, { ...row, __item: i.itemCode }, doc);
    row.actual_qty = d.actual_qty ?? 0;
    row.basic_rate = d.basic_rate ?? 0;
    row.basic_amount = flt(num(row.transfer_qty) * num(row.basic_rate), P);
    row.amount = row.basic_amount;
    row.valuation_rate = row.basic_rate;
    if (!str(row.expense_account)) row.expense_account = d.expense_account ?? "";
    if (!str(row.cost_center)) row.cost_center = d.cost_center ?? "";
    rows.push(row);
  }
  if (!rows.length) return { error: `All items of Material Request ${name} have already been transferred` };
  doc.items = rows;
  return doc;
}
