// Saving a Purchase Receipt — the server's side of the receipt form (server authority, CLAUDE.md;
// Phase II, owner 21-11-2026). It re-validates the form with the layout's schema, takes from it
// only what a user may type, fetches what the old form fetched from the masters, lets the
// calculation engine compute every figure (stock/receipt-doc.ts), checks what the old site
// checked, and writes the receipt with all its rows in one transaction — stored exactly as an
// imported receipt is (the importer's own column mappers over the document as the old site's row).
//
// The old site's save rules kept here (ERPNext 14 PurchaseReceipt.validate, BuyingController,
// StockController, TransactionBase; the add-on's services rows):
//   * a draft's posting date and time are "now" unless Edit Posting Date and Time is ticked
//     (validate_posting_time), and the posting date cannot be in the future;
//   * the supplier exists and is not disabled or on hold for all transactions;
//   * every row's item exists, is not disabled and not a template; its stock UOM, item group and
//     name come from the item; a row in its stock UOM has conversion factor 1;
//   * Received = Accepted + Rejected; no quantity is negative; a whole-number UOM takes no fraction
//     (validate_uom_is_integer); rejected stock needs a rejected warehouse, other than the accepted
//     one; every warehouse is enabled, not a group and the company's;
//   * a row from a PO keeps the PO's rate (Buying Settings: Maintain Same Rate, action Stop), and a
//     PO that is On Hold or Closed takes no receipt (check_on_hold_or_closed_status);
//   * the header's Accepted / Rejected Warehouse is kept only when every row has it
//     (reset_default_field_value);
//   * Frappe's mandatory fields; a draft's status is Draft.
// An edit is recorded as Frappe recorded it, a Version with what changed; creating records nothing.
import "server-only";
import { Prisma } from "@prisma/client";
import { flt } from "../calc/pymath";
import { SITE_PRECISION } from "../calc/settings";
import { docSchema, docSnapshot, legacyRow, missingFields, newRowName, siteDateTime, type Doc } from "../doc/store";
import { LAYOUTS } from "../doc/layouts";
import { typedDoc } from "../doc/values";
import { seriesForDate } from "../financial-year";
import { siteToday } from "../format";
import { nextInSeries } from "../series-counter";
import { importId } from "../migrate/convert";
import { receiptColumns, receiptItemColumns, receiptServiceColumns, receiptTaxColumns } from "../migrate/stock-build";
import { engineMasters } from "../orders/save";
import { fieldErrorsOf, type ActionResult } from "../orders/form-schema";
import { versionDiff } from "../orders/version";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import { computeReceipt, num, receiptValuation, rowsOf, type DocRow } from "./receipt-doc";
import { applyReceiptCancellation, applyReceiptSubmission } from "./receipt-submit";
import { StockPostingError } from "./stock-post";
import { DEFAULT_RECEIPT_SERIES, RECEIPT, RECEIPT_CHILDREN, RECEIPT_TABLES, seriesKey } from "./receipt-meta";

type Tx = Prisma.TransactionClient;

export { DEFAULT_RECEIPT_SERIES, RECEIPT, RECEIPT_CHILDREN } from "./receipt-meta";
const TABLES = RECEIPT_TABLES;

/** A refusal the user should read: it rolls the transaction back. */
class UserError extends Error {
  constructor(message: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v));

async function nextNumber(tx: Tx, series: string): Promise<string> {
  const { prefix, digits } = seriesKey(series);
  return nextInSeries(tx, prefix, digits);
}

/** The receipt's own typed document from its stored rows (what the form edits). */
export async function storedReceiptDoc(id: string): Promise<{ doc: Doc; docStatus: string; rowIds: Map<string, string> } | null> {
  const r = await db.purchaseReceipt.findUnique({
    where: { id },
    include: {
      items: { orderBy: { idx: "asc" }, select: { id: true, legacy: true } },
      taxes: { orderBy: { idx: "asc" }, select: { id: true, legacy: true } },
      serviceItems: { orderBy: { idx: "asc" }, select: { id: true, legacy: true } },
    },
  });
  if (!r) return null;
  const rows = (doctype: string, list: { id: string; legacy: Prisma.JsonValue }[]) =>
    list.map((x) => typedDoc(LAYOUTS[doctype], (x.legacy ?? {}) as Record<string, unknown>));
  const rowIds = new Map<string, string>();
  for (const list of [r.items, r.taxes, r.serviceItems]) for (const x of list) rowIds.set(String((x.legacy as Record<string, unknown>)?.name ?? ""), x.id);
  return {
    docStatus: r.docStatus,
    rowIds,
    doc: {
      ...typedDoc(LAYOUTS[RECEIPT], (r.legacy ?? {}) as Record<string, unknown>),
      items: rows("Purchase Receipt Item", r.items),
      taxes: rows("Purchase Taxes and Charges", r.taxes),
      services_items: rows("Services Items", r.serviceItems),
    },
  };
}

/** Fields the server always computes or fetches itself (never taken from the browser). */
const COMPUTED_HEADER = new Set([
  "name", "docstatus", "status", "title", "supplier_name", "total_qty", "total", "base_total", "net_total", "base_net_total",
  "taxes_and_charges_added", "taxes_and_charges_deducted", "base_taxes_and_charges_added", "base_taxes_and_charges_deducted",
  "total_taxes_and_charges", "base_total_taxes_and_charges", "base_discount_amount", "grand_total", "base_grand_total",
  "rounding_adjustment", "base_rounding_adjustment", "rounded_total", "base_rounded_total", "in_words", "base_in_words",
  "total_net_weight", "per_billed", "per_returned", "gst_breakup_table", "other_charges_calculation", "amended_from",
]);

/** The document the server will store: the stored (or new) receipt, with what the user typed over it. */
function merge(stored: Doc | null, typed: Doc): Doc {
  const out: Doc = { ...(stored ?? {}) };
  for (const [k, v] of Object.entries(typed)) {
    if (COMPUTED_HEADER.has(k) || k === "__islocal" || k === "modified" || k === "idx") continue;
    out[k] = v;
  }
  return out;
}

interface SaveRequest {
  id: string | null;
  doc: unknown;
  /** The stored receipt's "modified" when the form opened it (Frappe's check that nobody saved since). */
  modified: string | null;
  /**
   * Submit it (the form's Submit, on a saved draft): validated and computed again as a save, then
   * stored as submitted and posted — the stock ledger, the PO, the gate entry (stock/receipt-submit.ts).
   */
  submit?: boolean;
}

export async function saveReceipt(user: PurchaseUser, req: SaveRequest): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  const layout = LAYOUTS[RECEIPT];
  const parsed = docSchema(layout, RECEIPT_CHILDREN).safeParse(req.doc);
  if (!parsed.success) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    const out = await db.$transaction(async (tx) => {
      const stored = req.id ? await storedReceiptDoc(req.id) : null;
      if (req.id && !stored) throw new UserError("This Purchase Receipt no longer exists.");
      if (stored && stored.docStatus !== "DRAFT") throw new UserError(`Cannot edit a ${stored.docStatus === "SUBMITTED" ? "submitted" : "cancelled"} Purchase Receipt; only a draft can be changed.`);
      if (req.submit && !stored) throw new UserError("Save the Purchase Receipt before submitting it.");
      if (stored && req.modified && String(stored.doc.modified ?? "") !== req.modified) {
        throw new UserError(`Document has been modified after you have opened it (${req.modified}, ${String(stored.doc.modified)}). Please refresh to get the latest document.`);
      }
      const doc = merge(stored?.doc ?? null, parsed.data);
      const now = new Date();
      const stamp = siteDateTime(now);
      const errors: Record<string, string> = {};
      const refuse = (message: string, key?: string): never => {
        if (key) errors[key] = message;
        throw new UserError(message, key ? errors : undefined);
      };

      // --- header defaults and fetches -----------------------------------------------------------
      doc.docstatus = 0;
      doc.status = "Draft";
      // The series in the financial year of the Posting Date (financial-year.ts, owner 26-11-2026).
      doc.naming_series = seriesForDate(str(doc.naming_series) || DEFAULT_RECEIPT_SERIES, str(doc.posting_date) || siteToday(now));
      const company = await tx.purchaseCompany.findFirst({ where: str(doc.company) ? { code: str(doc.company) } : {}, orderBy: { code: "asc" } });
      if (!company) refuse(`Could not find Company: ${str(doc.company)}`, "company");
      doc.company = company!.code;
      const companyCurrency = company!.defaultCurrency ?? "INR";
      doc.currency = str(doc.currency) || companyCurrency;
      if (doc.currency === companyCurrency) doc.conversion_rate = 1;
      if (!num(doc.conversion_rate)) refuse("Exchange Rate is mandatory. Maybe Currency Exchange record is not created.", "conversion_rate");
      if (!num(doc.set_posting_time)) {
        doc.posting_date = siteToday(now);
        doc.posting_time = stamp.slice(11);
      }
      if (str(doc.posting_date) > siteToday(now)) refuse("Posting Date cannot be future date", "posting_date");

      const supplier = await tx.purchaseSupplier.findUnique({ where: { code: str(doc.supplier) } });
      if (!supplier) refuse(`Could not find Supplier: ${str(doc.supplier) || "(empty)"}`, "supplier");
      if (supplier!.disabled) refuse(`Supplier ${supplier!.code} is disabled`, "supplier");
      if (supplier!.onHold && (supplier!.holdType ?? "All") === "All" && (!supplier!.releaseDate || supplier!.releaseDate > now)) {
        refuse(`${supplier!.code} is blocked so this transaction cannot proceed`, "supplier");
      }
      doc.supplier_name = supplier!.supplierName;
      doc.title = supplier!.supplierName;

      // --- rows ------------------------------------------------------------------------------------
      const items = rowsOf(doc.items);
      if (!items.length) refuse("Items are required", "items");
      const codes = [...new Set(items.map((i) => str(i.item_code)).filter(Boolean))];
      const masters = new Map((await tx.purchaseItem.findMany({ where: { code: { in: codes } }, include: { itemGroup: { select: { code: true } }, uomConversions: true } })).map((i) => [i.code, i]));
      const uoms = new Map((await tx.purchaseUom.findMany({ where: { name: { in: [...new Set(items.flatMap((i) => [str(i.uom), str(i.stock_uom)]))] } } })).map((u) => [u.name, u]));
      const warehouseCodes = [...new Set(items.flatMap((i) => [str(i.warehouse), str(i.rejected_warehouse)]).concat([str(doc.set_warehouse), str(doc.rejected_warehouse)]).filter(Boolean))];
      const warehouses = new Map((await tx.purchaseWarehouse.findMany({ where: { code: { in: warehouseCodes } }, include: { company: { select: { code: true } } } })).map((w) => [w.code, w]));
      const poItemNames = items.map((i) => str(i.purchase_order_item)).filter(Boolean);
      // A PO row is linked by its ERPNext name (imported POs) or, for a PO made here, by its id.
      const poRows = await tx.purchaseOrderItem.findMany({
        where: { OR: [{ erpnextName: { in: poItemNames } }, { id: { in: poItemNames } }] },
        select: { id: true, erpnextName: true, rate: true, itemCode: true, order: { select: { id: true, number: true, status: true, docStatus: true, supplier: { select: { code: true } } } } },
      });
      const poItems = new Map(poRows.flatMap((p) => [[p.id, p], ...(p.erpnextName ? [[p.erpnextName, p] as const] : [])] as [string, (typeof poRows)[number]][]));
      const fp = SITE_PRECISION.float;
      const checkWarehouse = (code: string, key: string) => {
        const w = warehouses.get(code);
        if (!w) refuse(`Could not find Warehouse: ${code}`, key);
        if (w!.disabled) refuse(`Warehouse ${code} is disabled`, key);
        if (w!.isGroup) refuse(`Warehouse ${code} is a group warehouse: transactions cannot be made against it`, key);
        if (w!.company?.code && w!.company.code !== doc.company) refuse(`Warehouse ${code} does not belong to company ${String(doc.company)}`, key);
      };
      doc.items = items.map((it, i) => {
        const key = (f: string) => `items.${i}.${f}`;
        const code = str(it.item_code);
        const item = masters.get(code);
        if (!item) refuse(`Row #${i + 1}: Could not find Item Code ${code || "(empty)"}`, key("item_code"));
        if (item!.disabled) refuse(`Row #${i + 1}: Item ${code} is disabled`, key("item_code"));
        if (item!.hasVariants) refuse(`Row #${i + 1}: Item ${code} is a template, please select one of its variants`, key("item_code"));
        const row: DocRow = { ...it, item_name: str(it.item_name) || item!.itemName, stock_uom: item!.stockUom, item_group: item!.itemGroup?.code ?? str(it.item_group) };
        row.uom = str(row.uom) || item!.purchaseUom || item!.stockUom;
        if (row.uom === row.stock_uom) row.conversion_factor = 1;
        if (!num(row.conversion_factor)) {
          const c = item!.uomConversions.find((u) => u.uom === row.uom);
          row.conversion_factor = c ? Number(c.conversionFactor) : 0;
        }
        if (!num(row.conversion_factor)) refuse(`Row #${i + 1}: UOM Conversion factor is required`, key("conversion_factor"));
        for (const f of ["received_qty", "qty", "rejected_qty"] as const) {
          if (num(row[f]) < 0) refuse(`Row #${i + 1}: ${f === "qty" ? "Accepted Quantity" : f === "rejected_qty" ? "Rejected Quantity" : "Received Quantity"} can not be negative for item ${code}`, key(f));
        }
        if (!num(row.received_qty) && (num(row.qty) || num(row.rejected_qty))) row.received_qty = flt(num(row.qty) + num(row.rejected_qty), fp);
        if (flt(num(row.qty) + num(row.rejected_qty), fp) !== flt(num(row.received_qty), fp)) {
          refuse(`Row #${i + 1}: Received Qty must be equal to Accepted + Rejected Qty for Item ${code}`, key("received_qty"));
        }
        const uom = uoms.get(str(row.uom));
        for (const f of ["qty", "received_qty"] as const) {
          if (uom?.mustBeWholeNumber && num(row[f]) % 1 !== 0) {
            refuse(`Row ${i + 1}: Quantity (${num(row[f])}) cannot be a fraction. To allow this, disable 'Must be Whole Number' in UOM ${uom.name}.`, key(f));
          }
        }
        if (!str(row.warehouse) && str(doc.set_warehouse)) row.warehouse = doc.set_warehouse;
        if (num(row.rejected_qty) && !str(row.rejected_warehouse)) {
          if (str(doc.rejected_warehouse)) row.rejected_warehouse = doc.rejected_warehouse;
          else refuse(`Row #${i + 1}: Rejected Warehouse is mandatory for the rejected Item ${code}`, key("rejected_warehouse"));
        }
        if (str(row.rejected_warehouse) && row.rejected_warehouse === row.warehouse) refuse(`Row #${i + 1}: Accepted Warehouse and Rejected Warehouse cannot be same`, key("rejected_warehouse"));
        if (item!.isStockItem && num(row.qty) && !str(row.warehouse)) refuse(`Row #${i + 1}: Accepted Warehouse is mandatory for the stock Item ${code}`, key("warehouse"));
        if (str(row.warehouse)) checkWarehouse(str(row.warehouse), key("warehouse"));
        if (str(row.rejected_warehouse)) checkWarehouse(str(row.rejected_warehouse), key("rejected_warehouse"));
        const po = str(row.purchase_order_item) ? poItems.get(str(row.purchase_order_item)) : undefined;
        if (str(row.purchase_order_item) && (!po || po.itemCode !== code)) refuse(`Row #${i + 1}: the Purchase Order line it was made from is not for Item ${code}`, key("item_code"));
        if (po) {
          row.purchase_order = po.order.number;
          if (po.order.status === "ON_HOLD" || po.order.status === "CLOSED") refuse(`Purchase Order ${po.order.number} is ${po.order.status === "ON_HOLD" ? "On Hold" : "Closed"}`, key("purchase_order"));
          if (po.order.docStatus !== "SUBMITTED") refuse(`Row #${i + 1}: Purchase Order ${po.order.number} is not submitted`, key("purchase_order"));
          if (po.order.supplier?.code && po.order.supplier.code !== doc.supplier) refuse(`Row #${i + 1}: Purchase Order ${po.order.number} is not of Supplier ${String(doc.supplier)}`, key("purchase_order"));
        }
        if (!str(row.name)) row.name = newRowName();
        return row;
      });
      for (const f of ["set_warehouse", "rejected_warehouse"] as const) {
        const rowField = f === "set_warehouse" ? "warehouse" : "rejected_warehouse";
        const values = new Set(rowsOf(doc.items).map((r) => str(r[rowField])));
        doc[f] = values.size === 1 ? [...values][0] : "";
        if (str(doc[f])) checkWarehouse(str(doc[f]), f);
      }
      doc.taxes = rowsOf(doc.taxes).map((t) => ({ ...t, name: str(t.name) || newRowName() }));
      doc.services_items = rowsOf(doc.services_items).map((s) => ({ ...s, name: str(s.name) || newRowName(), charge_type: str(s.charge_type) || "Actual" }));

      // --- figures ---------------------------------------------------------------------------------
      const m = await engineMasters(companyCurrency);
      const { doc: computed } = computeReceipt(doc, m);
      // Maintain Same Rate (Stop): a row from a PO keeps the PO's rate (validate_rate_with_reference_doc).
      rowsOf(computed.items).forEach((r, i) => {
        const po = poItems.get(str(r.purchase_order_item));
        if (po && Math.abs(flt(num(r.rate) - Number(po.rate), SITE_PRECISION.currency)) >= 0.01) {
          refuse(`Row #${i + 1}: Rate must be same as Purchase Order: ${po.order.number} (${num(r.rate)} / ${Number(po.rate)})`, `items.${i}.rate`);
        }
      });
      const missing = missingFields(layout, RECEIPT_CHILDREN, computed);
      if (missing.summary) throw new UserError(missing.summary, missing.errors);

      // Valuation (update_valuation_rate, every save) — what a submission posts to the ledger.
      const isStock = (code: string) => Boolean(masters.get(code)?.isStockItem);
      Object.assign(computed, receiptValuation(computed, isStock, SITE_PRECISION.currency));
      // A submitted receipt with nothing billed is "To Bill" (one of value 0: "Completed").
      const docstatus = req.submit ? "1" : "0";
      if (req.submit) {
        // Batches and serial numbers (StockLedgerEntry.validate_item, serial_no.validate_serial_no): the
        // old site refused a batch item without its batch and a serialised one without its numbers. No
        // receipt since 01-01-2026 received either (3,349 rows), so receiving into them is not built here.
        rowsOf(computed.items).forEach((r, i) => {
          const item = masters.get(str(r.item_code));
          if (!item?.isStockItem || !num(r.qty)) return;
          const named = item.itemName && item.itemName !== item.code ? `${item.code}:${item.itemName}` : item.code;
          if (item.hasBatchNo) {
            refuse(str(r.batch_no) ? `Row #${i + 1}: receiving into batches (Item ${named}) is not available in this ERP yet` : `Batch number is mandatory for Item ${named}`, `items.${i}.batch_no`);
          }
          if (item.hasSerialNo) refuse(`Serial Nos Required for Serialized Item ${item.code}`, `items.${i}.serial_no`);
        });
        computed.docstatus = 1;
        computed.status = num(computed.grand_total) ? "To Bill" : "Completed";
      }

      // --- write -------------------------------------------------------------------------------------
      const number = stored ? String(stored.doc.name) : await nextNumber(tx, str(computed.naming_series));
      const creation = stored ? String(stored.doc.creation ?? stamp) : stamp;
      const owner = stored ? String(stored.doc.owner ?? user.email) : user.email;
      computed.name = number;
      const header = legacyRow(layout, computed, { name: number, owner, creation, modified: stamp, modified_by: user.email, docstatus, idx: "0" });
      const gate = str(computed.gate_entry) ? await tx.purchaseGateEntry.findUnique({ where: { number: str(computed.gate_entry) }, select: { id: true } }) : null;
      const id = req.id ?? importId("pr", number);
      const columns = receiptColumns(header, { supplierId: supplier!.id, amendedFromId: null, gateEntryId: gate?.id ?? null });
      if (stored) await tx.purchaseReceipt.update({ where: { id }, data: { ...columns, createdAt: undefined } });
      else await tx.purchaseReceipt.create({ data: { id, ...columns } });

      const itemIds = new Map((await tx.purchaseItem.findMany({ where: { code: { in: codes } }, select: { code: true, id: true } })).map((x) => [x.code, x.id]));
      const orderIds = new Map((await tx.purchaseOrder.findMany({ where: { number: { in: [...new Set(rowsOf(computed.items).map((r) => str(r.purchase_order)).filter(Boolean))] } }, select: { number: true, id: true } })).map((x) => [x.number, x.id]));
      const orderItemIds = new Map([...poItems].map(([k, p]) => [k, p.id]));
      const childStandard = (table: string, doctype: string, r: DocRow, i: number) => ({
        name: str(r.name), parent: number, parentfield: table, parenttype: RECEIPT, idx: String(i + 1), docstatus,
        owner, creation, modified: stamp, modified_by: user.email,
      });
      const rowId = (kind: string, name: string) => stored?.rowIds.get(name) ?? importId(kind, name);
      await tx.purchaseReceiptItem.deleteMany({ where: { receiptId: id } });
      await tx.purchaseReceiptTax.deleteMany({ where: { receiptId: id } });
      await tx.purchaseReceiptServiceItem.deleteMany({ where: { receiptId: id } });
      const [items_, taxes_, services_] = TABLES.map(([table, doctype]) => rowsOf(computed[table]).map((r, i) => legacyRow(LAYOUTS[doctype], r, childStandard(table, doctype, r, i))));
      if (items_.length) {
        await tx.purchaseReceiptItem.createMany({
          data: items_.map((r) => ({
            id: rowId("pri", r.name!), receiptId: id,
            ...receiptItemColumns(r, {
              itemId: itemIds.get(r.item_code ?? "") ?? null, warehouseId: warehouses.get(r.warehouse ?? "")?.id ?? null,
              orderId: orderIds.get(r.purchase_order ?? "") ?? null, orderItemId: orderItemIds.get(r.purchase_order_item ?? "") ?? null,
            }),
          })),
        });
      }
      if (taxes_.length) await tx.purchaseReceiptTax.createMany({ data: taxes_.map((r) => ({ id: rowId("prt", r.name!), receiptId: id, ...receiptTaxColumns(r) })) });
      if (services_.length) await tx.purchaseReceiptServiceItem.createMany({ data: services_.map((r) => ({ id: rowId("prsi", r.name!), receiptId: id, ...receiptServiceColumns(r) })) });

      // --- submission: the stock ledger, the PO, the gate entry, the item's last purchase rate ------------
      if (req.submit) await applyReceiptSubmission(tx, computed, isStock, { email: user.email, now, stamp });

      // --- timeline ----------------------------------------------------------------------------------
      if (stored) {
        const diff = versionDiff(docSnapshot(layout, RECEIPT_CHILDREN, stored.doc, companyCurrency), docSnapshot(layout, RECEIPT_CHILDREN, computed, companyCurrency));
        if (diff) {
          await tx.purchaseDocEvent.create({
            data: { source: "app", doctype: RECEIPT, docName: number, kind: "VERSION", at: now, byEmail: user.email, data: diff as unknown as Prisma.InputJsonValue },
          });
        }
      }
      return { id, number, modified: stamp };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof StockPostingError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Cancel a submitted receipt (its Cancel, "Permanently Cancel …?"): refused while a submitted Landed
 * Cost Voucher holds it (Frappe's linked-document check); otherwise stored as cancelled, its ledger
 * entries reversed and later ones valued again, its POs' received quantities and its gate entry's
 * Inward No undone (stock/receipt-submit.ts). The timeline records it as Frappe's Version did.
 */
export async function cancelReceipt(user: PurchaseUser, req: { id: string; modified: string | null }): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  try {
    const out = await db.$transaction(async (tx) => {
      const stored = await storedReceiptDoc(req.id);
      if (!stored) throw new UserError("This Purchase Receipt no longer exists.");
      if (stored.docStatus !== "SUBMITTED") throw new UserError("Only a submitted Purchase Receipt can be cancelled.");
      if (req.modified && String(stored.doc.modified ?? "") !== req.modified) {
        throw new UserError("Document has been modified after you have opened it. Please refresh to get the latest document.");
      }
      const number = String(stored.doc.name);
      const lcv = await tx.purchaseLandedCostReceipt.findFirst({ where: { receiptDocument: number, voucher: { docStatus: "SUBMITTED" } }, select: { voucher: { select: { number: true } } } });
      if (lcv) throw new UserError(`Cannot cancel because submitted Landed Cost Voucher ${lcv.voucher.number} is linked with Purchase Receipt ${number}`);
      const now = new Date();
      const stamp = siteDateTime(now);
      const r = await tx.purchaseReceipt.findUniqueOrThrow({ where: { id: req.id }, select: { legacy: true } });
      await tx.purchaseReceipt.update({
        where: { id: req.id },
        data: {
          docStatus: "CANCELLED", status: "Cancelled", updatedBy: user.email,
          legacy: { ...((r.legacy ?? {}) as Record<string, unknown>), docstatus: "2", status: "Cancelled", modified: stamp, modified_by: user.email } as Prisma.InputJsonObject,
        },
      });
      for (const it of await tx.purchaseReceiptItem.findMany({ where: { receiptId: req.id }, select: { id: true, legacy: true } })) {
        await tx.purchaseReceiptItem.update({ where: { id: it.id }, data: { legacy: { ...((it.legacy ?? {}) as Record<string, unknown>), docstatus: "2", modified: stamp } as Prisma.InputJsonObject } });
      }
      await applyReceiptCancellation(tx, stored.doc, { email: user.email, now, stamp });
      await tx.purchaseDocEvent.create({
        data: {
          source: "app", doctype: RECEIPT, docName: number, kind: "VERSION", at: now, byEmail: user.email,
          data: { added: [], changed: [["docstatus", 1, 2]], removed: [], row_changed: [], data_import: null, updater_reference: null } as unknown as Prisma.InputJsonValue,
        },
      });
      return { id: req.id, number, modified: stamp };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof StockPostingError) return { ok: false, error: e.message };
    throw e;
  }
}
