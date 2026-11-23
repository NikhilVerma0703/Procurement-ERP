// THE STOCK REPORTS' ARITHMETIC — Stock Balance and Stock Ledger, exactly as the old site computed
// them (ERPNext 14.92: erpnext/stock/report/stock_balance/stock_balance.py and
// stock_ledger/stock_ledger.py). Phase II, owner 21-11-2026 (docs/12 §3, Stock Reports).
//
// Pure: the caller passes the ledger entries (not cancelled, of items that exist, already in the
// ledger's order: posting instant, then creation — as ERPNext's query sorted them) and the items'
// details. The numbers are Python floats there and JS doubles here, added in the same order, and
// rounded by Frappe's flt (the site's "Banker's Rounding (legacy)", float precision 3), so the
// results equal the old site's to the last digit. Checked against the live site's own answers of
// 21-11-2026 by scripts/golden-stock.ts.

import { flt } from "../calc/pymath";

/** The old site's System Settings › Float Precision. */
export const FLOAT_PRECISION = 3;

/** One stock ledger entry, as the reports read it. */
export interface LedgerEntry {
  itemCode: string;
  warehouse: string;
  /** "YYYY-MM-DD". */
  postingDate: string;
  /** As stored, "HH:MM:SS[.ffffff]". */
  postingTime: string;
  /** ERPNext's posting_datetime as shown, "YYYY-MM-DD HH:MM:SS[.ffffff]". */
  date: string;
  company: string;
  voucherType: string;
  voucherNo: string;
  actualQty: number;
  qtyAfterTransaction: number;
  incomingRate: number;
  valuationRate: number;
  stockValue: number;
  stockValueDifference: number;
  batchNo: string | null;
  serialNo: string | null;
}

export interface ItemDetail {
  /** The item's record ID here (its page). */
  id?: string;
  itemName: string;
  itemGroup: string | null;
  stockUom: string | null;
  brand: string | null;
  description: string | null;
}

/** Opening vouchers (submitted Stock Entries marked "Is Opening", Stock Reconciliations of purpose "Opening Stock"). */
export interface OpeningVouchers {
  stockEntries: ReadonlySet<string>;
  stockReconciliations: ReadonlySet<string>;
}

export interface StockBalanceRow {
  itemCode: string;
  itemName: string;
  itemGroup: string | null;
  warehouse: string;
  stockUom: string | null;
  company: string;
  balQty: number;
  balVal: number;
  openingQty: number;
  openingVal: number;
  inQty: number;
  inVal: number;
  outQty: number;
  outVal: number;
  valRate: number;
}

/**
 * Stock Balance: per company, item and warehouse — opening, in, out and balance, quantity and value,
 * and the last entry's valuation rate (StockBalanceReport.prepare_item_warehouse_map). A
 * reconciliation without a batch sets the balance rather than adding to it; an opening voucher counts
 * as opening whatever its date. Rows that are zero everywhere (valuation rate aside) are left out.
 */
export function stockBalance(
  entries: Iterable<LedgerEntry>,
  items: ReadonlyMap<string, ItemDetail>,
  filters: { fromDate: string; toDate: string },
  opening: OpeningVouchers,
): StockBalanceRow[] {
  const map = new Map<string, StockBalanceRow>();
  for (const e of entries) {
    if (e.postingDate > filters.toDate) continue;
    const key = `${e.company}\u0000${e.itemCode}\u0000${e.warehouse}`;
    let q = map.get(key);
    if (!q) {
      const item = items.get(e.itemCode);
      q = {
        itemCode: e.itemCode, itemName: item?.itemName ?? e.itemCode, itemGroup: item?.itemGroup ?? null, warehouse: e.warehouse,
        stockUom: item?.stockUom ?? null, company: e.company, balQty: 0, balVal: 0, openingQty: 0, openingVal: 0,
        inQty: 0, inVal: 0, outQty: 0, outVal: 0, valRate: 0,
      };
      map.set(key, q);
    }
    const qtyDiff =
      e.voucherType === "Stock Reconciliation" && (!e.batchNo || e.serialNo)
        ? flt(e.qtyAfterTransaction) - flt(q.balQty)
        : flt(e.actualQty);
    const valueDiff = flt(e.stockValueDifference);
    const isOpeningVoucher =
      (e.voucherType === "Stock Entry" && opening.stockEntries.has(e.voucherNo)) ||
      (e.voucherType === "Stock Reconciliation" && opening.stockReconciliations.has(e.voucherNo));
    if (e.postingDate < filters.fromDate || isOpeningVoucher) {
      q.openingQty += qtyDiff;
      q.openingVal += valueDiff;
    } else if (e.postingDate >= filters.fromDate && e.postingDate <= filters.toDate) {
      if (flt(qtyDiff, FLOAT_PRECISION) >= 0) {
        q.inQty += qtyDiff;
        q.inVal += valueDiff;
      } else {
        q.outQty += Math.abs(qtyDiff);
        q.outVal += Math.abs(valueDiff);
      }
    }
    q.valRate = e.valuationRate;
    q.balQty += qtyDiff;
    q.balVal += valueDiff;
  }
  // filter_items_with_no_transactions: round every figure, drop the rows with none.
  const out: StockBalanceRow[] = [];
  for (const q of map.values()) {
    const keys = ["balQty", "balVal", "openingQty", "openingVal", "inQty", "inVal", "outQty", "outVal", "valRate"] as const;
    let any = false;
    for (const k of keys) {
      q[k] = flt(q[k], FLOAT_PRECISION);
      if (k !== "valRate" && q[k]) any = true;
    }
    if (any) out.push(q);
  }
  return out;
}

export interface StockLedgerRow extends LedgerEntry {
  itemName: string;
  itemGroup: string | null;
  stockUom: string | null;
  brand: string | null;
  description: string | null;
  inQty: number;
  /** Negative, as the old report showed it. */
  outQty: number;
  /** "Valuation Rate" column: value change ÷ quantity (a reconciliation without quantity: its valuation rate). */
  inOutRate: number | null;
}

/** The "'Opening'" row the Stock Ledger puts first when one item and one warehouse are chosen. */
export interface StockLedgerOpening {
  opening: true;
  qtyAfterTransaction: number;
  valuationRate: number;
  stockValue: number;
}

/**
 * Stock Ledger: the entries between the dates, each with In Qty / Out Qty and its rate
 * (stock_ledger.py execute). With a batch filter the balance is the batch's own running total.
 */
export function stockLedger(
  entries: readonly LedgerEntry[],
  items: ReadonlyMap<string, ItemDetail>,
  opts: { batchFilter?: boolean; opening?: { qtyAfterTransaction: number; valuationRate: number; stockValue: number } | null } = {},
): (StockLedgerRow | StockLedgerOpening)[] {
  const out: (StockLedgerRow | StockLedgerOpening)[] = [];
  let actualQty = 0;
  let stockValue = 0;
  if (opts.opening) {
    out.push({ opening: true, ...opts.opening });
    actualQty = opts.opening.qtyAfterTransaction;
    stockValue = opts.opening.stockValue;
  }
  for (const e of entries) {
    const item = items.get(e.itemCode);
    const row: StockLedgerRow = {
      ...e,
      itemName: item?.itemName ?? e.itemCode, itemGroup: item?.itemGroup ?? null, stockUom: item?.stockUom ?? null,
      brand: item?.brand ?? null, description: item?.description ?? null,
      inQty: Math.max(e.actualQty, 0), outQty: Math.min(e.actualQty, 0), inOutRate: null,
    };
    if (opts.batchFilter) {
      actualQty += flt(e.actualQty, FLOAT_PRECISION);
      stockValue += e.stockValueDifference;
      if (e.voucherType === "Stock Reconciliation" && !e.actualQty) {
        actualQty = e.qtyAfterTransaction;
        stockValue = e.stockValue;
      }
      row.qtyAfterTransaction = actualQty;
      row.stockValue = stockValue;
    }
    if (e.actualQty) row.inOutRate = flt(e.stockValueDifference / e.actualQty, FLOAT_PRECISION);
    else if (e.voucherType === "Stock Reconciliation") row.inOutRate = e.valuationRate;
    out.push(row);
  }
  return out;
}
