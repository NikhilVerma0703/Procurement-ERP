// Posting to the stock ledger, as ERPNext 14.92 did when a stock document was submitted or cancelled
// (erpnext/stock/stock_ledger.py make_sl_entries, update_entries_after, repost; stock/doctype/bin)
// — Phase II, owner 23-11-2026: "the Receipt section … completely".
//
//   * Each entry is placed in its item's and warehouse's ledger by its posting date and time, then its
//     creation time, and valued by the FIFO engine (stock/ledger-engine.ts, proven against every entry
//     of the old ledger) from the previous entry's stored state (get_previous_sle). Entries already
//     after it (a back-dated posting) are valued again, as ERPNext's repost did; one that would take
//     stock below zero stops the whole posting (the old site never allowed negative stock).
//   * Cancelling marks the document's entries cancelled and adds the reversing ones, cancelled too
//     (the old site's own pattern, e.g. PR/25-26/MM-01008), then values again every later entry.
//   * Each touched Bin is refreshed: actual qty, value and rate from the ledger, ordered qty from the
//     open Purchase Orders, and the projected qty.
// Entries are named MAT-SLE-<year>-##### (the old series), their fiscal year April–March. Server-only;
// runs inside the caller's transaction.
import "server-only";
import { Prisma } from "@prisma/client";
import { dbDecimal, flt } from "../calc/pymath";
import { newRowName, siteDateTime } from "../doc/store";
import { importId, localDateTime } from "../migrate/convert";
import { binColumns, stockLedgerColumns } from "../migrate/stock-build";
import { fiscalYearOf, queueText, type PostEntry } from "./ledger-format";
import { newWarehouseState, processEntry, type EngineContext, type WarehouseState } from "./ledger-engine";

export type { PostEntry } from "./ledger-format";
import type { StockBin } from "./valuation";

type Tx = Prisma.TransactionClient;

/** A refusal for the user (negative stock, a back-dated posting the module cannot value). */
export class StockPostingError extends Error {}

interface LedgerRow {
  id: string;
  name: string;
  at: Date;
  createdAt: Date;
  voucherType: string;
  voucherNo: string;
  actualQty: number;
  qtyAfter: number;
  incomingRate: number;
  outgoingRate: number;
  valuationRate: number;
  stockValue: number;
  stockValueDifference: number;
  stockQueue: string | null;
  batchNo: string | null;
  serialNo: string | null;
  company: string;
  recalculateRate: boolean;
  dependant: string | null;
  legacy: Record<string, unknown>;
  /** A new entry of this posting (not yet stored). */
  fresh?: PostEntry & { name: string };
}

const parseQueue = (s: string | null): StockBin[] => {
  try {
    const v = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(v) ? (v as [number, number][]).map(([a, b]) => [Number(a), Number(b)]) : [];
  } catch {
    return [];
  }
};

async function ledgerOf(tx: Tx, itemCode: string, warehouse: string): Promise<LedgerRow[]> {
  const rows = await tx.$queryRaw<
    {
      id: string; name: string; at: Date; created_at: Date; voucher_type: string; voucher_no: string; actual_qty: number; qty_after: number;
      incoming_rate: number; outgoing_rate: number; valuation_rate: number; stock_value: number; svd: number; stock_queue: string | null;
      batch_no: string | null; serial_no: string | null; company: string; recalculate_rate: boolean; dependant: string | null; legacy: Prisma.JsonValue;
    }[]
  >`
    SELECT id, erpnext_name AS name, posting_date_time AS at, created_at, voucher_type, voucher_no, actual_qty::float8 AS actual_qty,
           qty_after_transaction::float8 AS qty_after, incoming_rate::float8 AS incoming_rate, outgoing_rate::float8 AS outgoing_rate,
           valuation_rate::float8 AS valuation_rate, stock_value::float8 AS stock_value, stock_value_difference::float8 AS svd, stock_queue,
           batch_no, serial_no, company_code AS company, recalculate_rate, dependant_sle_voucher_detail_no AS dependant, legacy
    FROM purchase_stock_ledger_entries
    WHERE item_code = ${itemCode} AND warehouse_code = ${warehouse} AND NOT is_cancelled AND doc_status <> 'Cancelled'
    ORDER BY posting_date_time, created_at, erpnext_name`;
  return rows.map((r) => ({
    id: r.id, name: r.name, at: r.at, createdAt: r.created_at, voucherType: r.voucher_type, voucherNo: r.voucher_no, actualQty: r.actual_qty,
    qtyAfter: r.qty_after, incomingRate: r.incoming_rate, outgoingRate: r.outgoing_rate, valuationRate: r.valuation_rate, stockValue: r.stock_value,
    stockValueDifference: r.svd, stockQueue: r.stock_queue, batchNo: r.batch_no, serialNo: r.serial_no, company: r.company,
    recalculateRate: r.recalculate_rate, dependant: r.dependant, legacy: (r.legacy ?? {}) as Record<string, unknown>,
  }));
}

/** The next MAT-SLE-<year>-##### (the counter starts from the old ledger's last name of that year). */
async function nextSleName(tx: Tx, on: Date): Promise<string> {
  const year = siteDateTime(on).slice(0, 4);
  const prefix = `MAT-SLE-${year}-`;
  await tx.$executeRaw`
    INSERT INTO purchase_naming_series (prefix, current)
    SELECT ${prefix}, COALESCE(MAX(NULLIF(regexp_replace(erpnext_name, '^.*-', ''), '')::int), 0)
    FROM purchase_stock_ledger_entries WHERE erpnext_name LIKE ${`${prefix}%`}
    ON CONFLICT (prefix) DO NOTHING`;
  const [{ current }] = await tx.$queryRaw<{ current: number }[]>`
    UPDATE purchase_naming_series SET current = current + 1 WHERE prefix = ${prefix} RETURNING current`;
  return `${prefix}${String(current).padStart(5, "0")}`;
}

const ctxFor = (w: () => WarehouseState): EngineContext => ({
  batchwise: () => false,
  serial: () => null,
  fallbackRate: () => w().valuationRate,
  floatPrecision: 3,
  currencyPrecision: 3,
});

/** The state after an entry, as ERPNext's get_previous_sle read it. */
const stateAfter = (r: LedgerRow | undefined): WarehouseState =>
  r ? { qty: r.qtyAfter, valuationRate: r.valuationRate, stockValue: r.stockValue, prevStockValue: r.stockValue, queue: parseQueue(r.stockQueue) } : newWarehouseState();

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

/**
 * Value the ledger of one item in one warehouse from `from` on (the rows are in ledger order; rows
 * before `from` keep their stored state). Returns the rows whose figures changed, and the new ones.
 */
function revalue(rows: LedgerRow[], from: number, itemCode: string, warehouse: string): LedgerRow[] {
  let w = stateAfter(rows[from - 1]);
  const ctx = ctxFor(() => w);
  const changed: LedgerRow[] = [];
  for (let i = from; i < rows.length; i++) {
    const r = rows[i];
    if (!r.fresh && (r.batchNo || r.serialNo || r.recalculateRate || r.dependant)) {
      throw new StockPostingError(
        `${r.voucherType} ${r.voucherNo} of ${itemCode} in ${warehouse}, posted later, carries batches, serial numbers or dependent rates: post this document at its own date and time, after it.`,
      );
    }
    const res = processEntry(
      w,
      {
        voucherType: r.voucherType, voucherNo: r.voucherNo, actualQty: r.actualQty, incomingRate: r.incomingRate, outgoingRate: r.outgoingRate,
        batchNo: null, serialNo: null, company: r.company, qtyAfterTransaction: r.qtyAfter, valuationRate: r.valuationRate,
      },
      ctx,
      new Map(),
    );
    if (res.negative) {
      throw new StockPostingError(
        `${fmt(Math.abs(w.qty))} units of Item ${itemCode} needed in Warehouse ${warehouse} on ${siteDateTime(r.at).slice(0, 19)} for ${r.voucherType} ${r.voucherNo} to complete this transaction.`,
      );
    }
    const next = { ...r, qtyAfter: res.qtyAfterTransaction, valuationRate: res.valuationRate, stockValue: res.stockValue, stockValueDifference: res.stockValueDifference, stockQueue: queueText(res.stockQueue) };
    const moved = r.fresh || Math.abs(next.qtyAfter - r.qtyAfter) > 1e-9 || Math.abs(next.valuationRate - r.valuationRate) > 1e-9 || Math.abs(next.stockValue - r.stockValue) > 1e-9 || Math.abs(next.stockValueDifference - r.stockValueDifference) > 1e-9;
    rows[i] = next;
    if (moved) changed.push(next);
  }
  return changed;
}

async function writeChanged(tx: Tx, changed: LedgerRow[], who: { email: string; stamp: string }, ids: { itemId: string | null; warehouseId: string | null }) {
  for (const r of changed) {
    const legacy: Record<string, string | null> = {
      ...(r.legacy as Record<string, string | null>),
      qty_after_transaction: dbDecimal(r.qtyAfter), valuation_rate: dbDecimal(r.valuationRate), stock_value: dbDecimal(r.stockValue),
      stock_value_difference: dbDecimal(r.stockValueDifference), stock_queue: r.stockQueue, modified: who.stamp, modified_by: who.email,
    };
    if (r.fresh) {
      await tx.purchaseStockLedgerEntry.create({ data: { id: importId("sle", r.name), ...stockLedgerColumns(legacy, ids) } });
    } else {
      await tx.purchaseStockLedgerEntry.update({
        where: { id: r.id },
        data: {
          qtyAfterTransaction: legacy.qty_after_transaction!, valuationRate: legacy.valuation_rate!, stockValue: legacy.stock_value!,
          stockValueDifference: legacy.stock_value_difference!, stockQueue: r.stockQueue, legacy: legacy as Prisma.InputJsonObject,
        },
      });
    }
  }
}

async function refs(tx: Tx, itemCode: string, warehouse: string) {
  const [item, wh] = await Promise.all([
    tx.purchaseItem.findUnique({ where: { code: itemCode }, select: { id: true } }),
    tx.purchaseWarehouse.findUnique({ where: { code: warehouse }, select: { id: true } }),
  ]);
  return { itemId: item?.id ?? null, warehouseId: wh?.id ?? null };
}

/** The legacy row of a new entry, as the old site wrote one (MAT-SLE-2026-03648, captured). */
function freshLegacy(e: PostEntry & { name: string }, who: { email: string; stamp: string }, cancelled: boolean): Record<string, string | null> {
  const time = e.postingTime.includes(".") ? e.postingTime : `${e.postingTime}.000000`;
  return {
    name: e.name, owner: who.email, creation: who.stamp, modified: who.stamp, modified_by: who.email, docstatus: "1", idx: "0",
    item_code: e.itemCode, warehouse: e.warehouse, posting_date: e.postingDate, posting_time: time, posting_datetime: `${e.postingDate} ${time}`,
    voucher_type: e.voucherType, voucher_no: e.voucherNo, voucher_detail_no: e.voucherDetailNo, dependant_sle_voucher_detail_no: null,
    recalculate_rate: "0", actual_qty: dbDecimal(e.actualQty), qty_after_transaction: dbDecimal(0), incoming_rate: dbDecimal(e.incomingRate),
    outgoing_rate: dbDecimal(e.outgoingRate ?? 0), valuation_rate: dbDecimal(0), stock_value: dbDecimal(0), stock_value_difference: dbDecimal(0),
    stock_queue: "[]", company: e.company, stock_uom: e.stockUom, batch_no: "", serial_no: "", project: null, fiscal_year: fiscalYearOf(e.postingDate),
    is_cancelled: cancelled ? "1" : "0", is_adjustment_entry: "0", to_rename: "0", _user_tags: null, _comments: null, _assign: null, _liked_by: null,
  };
}

/**
 * One posting at a time: two receipts submitted together must not both value from the same previous
 * entry (ERPNext locked the item's rows for update). Held until the caller's transaction ends.
 */
async function lockLedger(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('purchase_stock_ledger'))`;
}

const pairKey = (e: { itemCode: string; warehouse: string }) => `${e.itemCode}\u0000${e.warehouse}`;

/** Post new entries (a submission), in the order given, each pair's later entries valued again. */
export async function postEntries(tx: Tx, entries: PostEntry[], who: { email: string; now: Date }): Promise<void> {
  await lockLedger(tx);
  const stamp = siteDateTime(who.now);
  const groups = new Map<string, PostEntry[]>();
  for (const e of entries) groups.set(pairKey(e), [...(groups.get(pairKey(e)) ?? []), e]);
  let tick = 0;
  for (const [, list] of groups) {
    const { itemCode, warehouse } = list[0];
    const rows = await ledgerOf(tx, itemCode, warehouse);
    let first = rows.length;
    for (const e of list) {
      const name = await nextSleName(tx, who.now);
      const at = localDateTime(`${e.postingDate} ${e.postingTime.slice(0, 15)}`)!;
      const createdAt = new Date(who.now.getTime() + tick++);
      const legacy = freshLegacy({ ...e, name }, { email: who.email, stamp }, false);
      const row: LedgerRow = {
        id: "", name, at, createdAt, voucherType: e.voucherType, voucherNo: e.voucherNo, actualQty: e.actualQty, qtyAfter: 0, incomingRate: e.incomingRate,
        outgoingRate: e.outgoingRate ?? 0, valuationRate: 0, stockValue: 0, stockValueDifference: 0, stockQueue: null, batchNo: null, serialNo: null,
        company: e.company, recalculateRate: false, dependant: null, legacy, fresh: { ...e, name },
      };
      // after every entry at or before its posting instant (and, at the same instant, created before it)
      let at_ = rows.findIndex((r) => r.at.getTime() > at.getTime() || (r.at.getTime() === at.getTime() && r.createdAt.getTime() > createdAt.getTime()));
      if (at_ === -1) at_ = rows.length;
      rows.splice(at_, 0, row);
      first = Math.min(first, at_);
    }
    const changed = revalue(rows, first, itemCode, warehouse);
    await writeChanged(tx, changed, { email: who.email, stamp }, await refs(tx, itemCode, warehouse));
    await refreshBin(tx, itemCode, warehouse, { email: who.email, stamp });
  }
}

/** Cancel a document's entries: marked cancelled, reversed (cancelled too), later entries valued again. */
export async function cancelEntries(tx: Tx, voucherType: string, voucherNo: string, who: { email: string; now: Date }): Promise<void> {
  await lockLedger(tx);
  const stamp = siteDateTime(who.now);
  const originals = await tx.purchaseStockLedgerEntry.findMany({
    where: { voucherType, voucherNo, isCancelled: false },
    orderBy: [{ postingDateTime: "asc" }, { createdAt: "asc" }],
  });
  if (!originals.length) return;
  const pairs = new Map<string, { itemCode: string; warehouse: string }>();
  for (const o of originals) pairs.set(pairKey({ itemCode: o.itemCode, warehouse: o.warehouseCode }), { itemCode: o.itemCode, warehouse: o.warehouseCode });
  // The state just before each original, for its reversing entry (read before anything moves).
  const before = new Map<string, LedgerRow | undefined>();
  for (const { itemCode, warehouse } of pairs.values()) {
    const rows = await ledgerOf(tx, itemCode, warehouse);
    for (const o of originals.filter((x) => x.itemCode === itemCode && x.warehouseCode === warehouse)) {
      const i = rows.findIndex((r) => r.id === o.id);
      before.set(o.id, i > 0 ? rows[i - 1] : undefined);
    }
  }
  for (const o of originals) {
    const legacy = { ...((o.legacy ?? {}) as Record<string, unknown>), is_cancelled: "1", modified: stamp, modified_by: who.email };
    await tx.purchaseStockLedgerEntry.update({ where: { id: o.id }, data: { isCancelled: true, legacy: legacy as Prisma.InputJsonObject } });
  }
  let tick = 0;
  for (const o of originals) {
    const prev = stateAfter(before.get(o.id));
    const name = await nextSleName(tx, who.now);
    const e: PostEntry & { name: string } = {
      name, itemCode: o.itemCode, warehouse: o.warehouseCode, company: o.companyCode, stockUom: o.stockUom, actualQty: -Number(o.actualQty),
      incomingRate: 0, outgoingRate: Number(o.incomingRate), voucherType, voucherNo, voucherDetailNo: o.voucherDetailNo,
      postingDate: o.postingDate.toISOString().slice(0, 10), postingTime: o.postingTime,
    };
    const created = siteDateTime(new Date(who.now.getTime() + tick++));
    const legacy = {
      ...freshLegacy(e, { email: who.email, stamp: created }, true),
      qty_after_transaction: dbDecimal(prev.qty), valuation_rate: dbDecimal(prev.valuationRate), stock_value: dbDecimal(prev.stockValue),
      stock_queue: queueText(prev.queue),
    };
    await tx.purchaseStockLedgerEntry.create({ data: { id: importId("sle", name), ...stockLedgerColumns(legacy, await refs(tx, o.itemCode, o.warehouseCode)) } });
  }
  for (const { itemCode, warehouse } of pairs.values()) {
    const rows = await ledgerOf(tx, itemCode, warehouse);
    const firstAt = Math.min(...originals.filter((o) => o.itemCode === itemCode && o.warehouseCode === warehouse).map((o) => o.postingDateTime.getTime()));
    let from = rows.findIndex((r) => r.at.getTime() >= firstAt);
    if (from === -1) from = rows.length;
    const changed = revalue(rows, from, itemCode, warehouse);
    await writeChanged(tx, changed, { email: who.email, stamp }, await refs(tx, itemCode, warehouse));
    await refreshBin(tx, itemCode, warehouse, { email: who.email, stamp });
  }
}

/**
 * A Bin as ERPNext kept it: actual qty, value and rate from the last ledger entry; ordered qty from the
 * open Purchase Orders' lines for this warehouse (get_ordered_qty); projected qty from them all.
 */
export async function refreshBin(tx: Tx, itemCode: string, warehouse: string, who: { email: string; stamp: string }): Promise<void> {
  const [last] = await tx.$queryRaw<{ qty: number; rate: number; value: number }[]>`
    SELECT qty_after_transaction::float8 AS qty, valuation_rate::float8 AS rate, stock_value::float8 AS value
    FROM purchase_stock_ledger_entries
    WHERE item_code = ${itemCode} AND warehouse_code = ${warehouse} AND NOT is_cancelled AND doc_status <> 'Cancelled'
    ORDER BY posting_date_time DESC, created_at DESC, erpnext_name DESC LIMIT 1`;
  const [{ ordered }] = await tx.$queryRaw<{ ordered: number | null }[]>`
    SELECT SUM((i.qty - i.received_qty) * i.conversion_factor)::float8 AS ordered
    FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.order_id JOIN purchase_warehouses w ON w.id = i.warehouse_id
    WHERE i.item_code = ${itemCode} AND w.code = ${warehouse} AND i.qty > i.received_qty AND o.doc_status = 'Submitted'
      AND o.status NOT IN ('Closed', 'Delivered') AND NOT i.delivered_by_supplier`;
  const bin = await tx.purchaseBin.findFirst({ where: { itemCode, warehouseCode: warehouse } });
  const old = ((bin?.legacy ?? {}) as Record<string, string | null>);
  const n = (k: string) => Number(old[k] ?? 0) || 0;
  const actual = last?.qty ?? 0;
  const orderedQty = flt(ordered ?? 0, 9);
  const projected = actual + orderedQty + n("indented_qty") + n("planned_qty") - n("reserved_qty") - n("reserved_qty_for_production") - n("reserved_qty_for_sub_contract") - n("reserved_qty_for_production_plan");
  const name = bin?.erpnextName ?? newRowName();
  const legacy: Record<string, string | null> = {
    planned_qty: dbDecimal(0), indented_qty: dbDecimal(0), reserved_qty: dbDecimal(0), reserved_qty_for_production: dbDecimal(0),
    reserved_qty_for_sub_contract: dbDecimal(0), reserved_qty_for_production_plan: dbDecimal(0), docstatus: "0", idx: "0", owner: who.email, creation: who.stamp,
    _user_tags: null, _comments: null, _assign: null, _liked_by: null,
    ...old,
    name, item_code: itemCode, warehouse, actual_qty: dbDecimal(actual), ordered_qty: dbDecimal(orderedQty), projected_qty: dbDecimal(projected),
    valuation_rate: dbDecimal(last?.rate ?? 0), stock_value: dbDecimal(last?.value ?? 0), modified: who.stamp, modified_by: who.email,
  };
  if (!legacy.stock_uom) legacy.stock_uom = (await tx.purchaseItem.findUnique({ where: { code: itemCode }, select: { stockUom: true } }))?.stockUom ?? null;
  const data = binColumns(legacy, await refs(tx, itemCode, warehouse));
  if (bin) await tx.purchaseBin.update({ where: { id: bin.id }, data });
  else await tx.purchaseBin.create({ data: { id: importId("bin", name), ...data } });
}
