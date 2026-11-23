// The stock ledger's arithmetic for one item in one warehouse, entry by entry, as ERPNext 14.92 did it
// (erpnext/stock/stock_ledger.py update_entries_after.process_sle and its helpers). Phase II, owner
// 21-11-2026: what a receipt, a stock entry or a reconciliation writes into the ledger, and what is
// recomputed when an earlier entry changes. Pure; proven by replaying every entry of the old ledger
// (scripts/golden-ledger.ts).
//
// Per entry: the negative-stock check (the old site never allowed negative stock), then the value —
// serial numbers by their purchase rates, a batch valued batch-wise by its own running average, a
// reconciliation without a batch by the quantity and rate it sets, anything else by the FIFO queue —
// then the stock value rounded to the currency precision and its change from the previous entry.

import { flt } from "../calc/pymath";
import { FifoQueue, roundOffIfNearZero, type StockBin } from "./valuation";

export interface EngineEntry {
  voucherType: string;
  voucherNo: string;
  actualQty: number;
  incomingRate: number;
  outgoingRate: number;
  batchNo: string | null;
  serialNo: string | null;
  company: string;
  /** For a reconciliation without a batch: the quantity and rate it sets. */
  qtyAfterTransaction: number;
  valuationRate: number;
}

export interface WarehouseState {
  qty: number;
  valuationRate: number;
  stockValue: number;
  prevStockValue: number;
  queue: StockBin[];
}

export interface EngineContext {
  /** Batch › Use Batchwise Valuation. */
  batchwise: (batchNo: string) => boolean;
  /** A serial number's purchase rate and company (Serial No), for serials going out. */
  serial: (serialNo: string) => { purchaseRate: number; company: string } | null;
  /** get_valuation_rate's fallback when no rate is known (stock out with nothing in the queue). */
  fallbackRate: () => number;
  /** System float precision (3) and the ledger's stock value precision (the currency precision, 3). */
  floatPrecision: number;
  currencyPrecision: number;
}

export interface EngineResult {
  qtyAfterTransaction: number;
  valuationRate: number;
  stockValue: number;
  stockValueDifference: number;
  stockQueue: StockBin[];
  /** The stock value before rounding to the currency precision (the old site's precision varied: 2, 3, 5). */
  unroundedStockValue: number;
  /** The entry would have taken stock below zero: ERPNext refused it (only its quantity moved). */
  negative: boolean;
}

/** A batch's running totals in this warehouse (get_batch_incoming_rate sums its earlier entries). */
export type BatchTotals = Map<string, { qty: number; value: number }>;

export const newWarehouseState = (): WarehouseState => ({ qty: 0, valuationRate: 0, stockValue: 0, prevStockValue: 0, queue: [] });

const serialList = (s: string | null) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

export function processEntry(w: WarehouseState, e: EngineEntry, ctx: EngineContext, batches: BatchTotals): EngineResult {
  // validate_negative_stock
  const diff = flt(w.qty + flt(e.actualQty), ctx.floatPrecision);
  if (diff < 0 && Math.abs(diff) > 0.0001) {
    w.qty += flt(e.actualQty);
    return {
      qtyAfterTransaction: w.qty, valuationRate: w.valuationRate, stockValue: w.stockValue, stockValueDifference: 0, stockQueue: w.queue,
      unroundedStockValue: w.stockValue, negative: true,
    };
  }

  const serials = serialList(e.serialNo);
  if (serials.length) {
    // get_serialized_values
    let incomingRate = flt(e.incomingRate);
    const actualQty = flt(e.actualQty);
    if (incomingRate < 0) incomingRate = w.valuationRate;
    let change = 0;
    if (actualQty > 0) change = actualQty * incomingRate;
    else {
      let out = 0;
      for (const s of serials) {
        const sn = ctx.serial(s);
        if (sn && sn.company === e.company) out += flt(sn.purchaseRate);
      }
      change = -1 * out;
    }
    const newQty = w.qty + actualQty;
    if (newQty > 0) {
      const newValue = w.qty * w.valuationRate + change;
      if (newValue >= 0) w.valuationRate = newValue / newQty;
    }
    w.qty += actualQty;
    if (e.voucherType === "Stock Reconciliation" && !e.batchNo) w.qty = e.qtyAfterTransaction;
    w.stockValue = flt(w.qty) * flt(w.valuationRate);
  } else if (e.batchNo && ctx.batchwise(e.batchNo)) {
    // update_batched_values
    const actualQty = flt(e.actualQty);
    w.qty = roundOffIfNearZero(w.qty + actualQty);
    let change: number;
    if (actualQty > 0) change = flt(e.incomingRate) * actualQty;
    else {
      const b = batches.get(e.batchNo);
      const rate = b && b.qty ? b.value / b.qty : ctx.fallbackRate();
      change = rate * actualQty;
    }
    w.stockValue = roundOffIfNearZero(w.stockValue + change);
    if (w.qty) w.valuationRate = w.stockValue / w.qty;
  } else if (e.voucherType === "Stock Reconciliation" && !e.batchNo) {
    // A reconciliation sets the quantity and rate ("assert").
    w.valuationRate = e.valuationRate;
    w.qty = e.qtyAfterTransaction;
    w.stockValue = flt(w.qty) * flt(w.valuationRate);
    w.queue = [[w.qty, w.valuationRate]];
  } else {
    // update_queue_values (FIFO)
    const actualQty = flt(e.actualQty);
    w.qty = roundOffIfNearZero(w.qty + actualQty);
    const q = new FifoQueue(w.queue);
    const [, prevValue] = q.total();
    if (actualQty > 0) q.add(actualQty, flt(e.incomingRate));
    else q.remove(Math.abs(actualQty), flt(e.outgoingRate), ctx.fallbackRate);
    const [, value] = q.total();
    w.queue = q.queue;
    w.stockValue = roundOffIfNearZero(w.stockValue + (value - prevValue));
    if (!w.queue.length) w.queue.push([0, e.incomingRate || e.outgoingRate || w.valuationRate]);
    if (w.qty) w.valuationRate = w.stockValue / w.qty;
  }

  // Rounding as per precision; no stock, no value.
  const unroundedStockValue = w.stockValue;
  w.stockValue = flt(w.stockValue, ctx.currencyPrecision);
  if (!w.qty) w.stockValue = 0;
  const stockValueDifference = w.stockValue - w.prevStockValue;
  w.prevStockValue = w.stockValue;
  if (e.batchNo) {
    const b = batches.get(e.batchNo) ?? { qty: 0, value: 0 };
    b.qty += flt(e.actualQty);
    b.value += stockValueDifference;
    batches.set(e.batchNo, b);
  }
  return {
    qtyAfterTransaction: w.qty, valuationRate: w.valuationRate, stockValue: w.stockValue, stockValueDifference,
    stockQueue: w.queue.map((b) => [b[0], b[1]] as StockBin), unroundedStockValue, negative: false,
  };
}
