import { describe, expect, it } from "vitest";
import { newWarehouseState, processEntry, type BatchTotals, type EngineContext, type EngineEntry } from "@/lib/purchase/stock/ledger-engine";
import { FifoQueue, roundOffIfNearZero } from "@/lib/purchase/stock/valuation";

// Phase II (owner, 21-11-2026): ERPNext 14.92's FIFO valuation and ledger arithmetic. The proof is
// npm run golden:ledger (every entry of the old ledger); these pin the rules on made-up figures.

describe("the FIFO queue", () => {
  it("adds to the last bin at the same rate, opens a new bin at a new rate", () => {
    const q = new FifoQueue();
    q.add(10, 100);
    q.add(5, 100);
    q.add(4, 110);
    expect(q.queue).toEqual([[15, 100], [4, 110]]);
    expect(q.total()).toEqual([19, 1940]);
  });

  it("takes stock out first-in first-out, or from the bin at the outgoing rate", () => {
    const q = new FifoQueue([[10, 100], [5, 120]]);
    expect(q.remove(12)).toEqual([[10, 100], [2, 120]]);
    expect(q.queue).toEqual([[3, 120]]);
    const r = new FifoQueue([[10, 100], [5, 120]]);
    r.remove(2, 120);
    expect(r.queue).toEqual([[10, 100], [3, 120]]);
  });

  it("keeps a negative bin when stock runs out, and fills it first when stock comes in", () => {
    const q = new FifoQueue([[2, 50]]);
    q.remove(5);
    expect(q.queue).toEqual([[-3, 50]]);
    q.add(10, 60);
    expect(q.queue).toEqual([[7, 60]]);
  });

  it("rounds a near-zero figure to zero, as ERPNext did", () => {
    expect(roundOffIfNearZero(1e-8)).toBe(0);
    expect(roundOffIfNearZero(1e-6)).toBe(1e-6);
  });
});

describe("a ledger entry's figures", () => {
  const ctx: EngineContext = {
    batchwise: (b) => b === "B-AVG",
    serial: (s) => (s === "SL-1" ? { purchaseRate: 337.5, company: "X" } : null),
    fallbackRate: () => 0,
    floatPrecision: 3,
    currencyPrecision: 3,
  };
  const e = (o: Partial<EngineEntry>): EngineEntry => ({
    voucherType: "Purchase Receipt", voucherNo: "PR-1", actualQty: 0, incomingRate: 0, outgoingRate: 0, batchNo: null, serialNo: null,
    company: "X", qtyAfterTransaction: 0, valuationRate: 0, ...o,
  });

  it("values receipts and issues through the FIFO queue", () => {
    const w = newWarehouseState();
    const b: BatchTotals = new Map();
    const r1 = processEntry(w, e({ actualQty: 10, incomingRate: 100 }), ctx, b);
    const r2 = processEntry(w, e({ actualQty: 10, incomingRate: 130 }), ctx, b);
    const r3 = processEntry(w, e({ voucherType: "Stock Entry", actualQty: -15 }), ctx, b);
    expect([r1.stockValue, r1.stockValueDifference, r1.valuationRate]).toEqual([1000, 1000, 100]);
    expect([r2.stockValue, r2.valuationRate]).toEqual([2300, 115]);
    expect([r3.qtyAfterTransaction, r3.stockValue, r3.stockValueDifference, r3.stockQueue]).toEqual([5, 650, -1650, [[5, 130]]]);
  });

  it("lets a reconciliation set the quantity and rate", () => {
    const w = newWarehouseState();
    processEntry(w, e({ actualQty: 10, incomingRate: 100 }), ctx, new Map());
    const r = processEntry(w, e({ voucherType: "Stock Reconciliation", actualQty: -2, qtyAfterTransaction: 8, valuationRate: 90 }), ctx, new Map());
    expect([r.qtyAfterTransaction, r.valuationRate, r.stockValue, r.stockValueDifference, r.stockQueue]).toEqual([8, 90, 720, -280, [[8, 90]]]);
  });

  it("values a batch-wise batch by its own running average", () => {
    const w = newWarehouseState();
    const b: BatchTotals = new Map();
    processEntry(w, e({ actualQty: 10, incomingRate: 100, batchNo: "B-AVG" }), ctx, b);
    processEntry(w, e({ actualQty: 10, incomingRate: 200, batchNo: "B-AVG" }), ctx, b);
    const out = processEntry(w, e({ voucherType: "Stock Entry", actualQty: -5, batchNo: "B-AVG" }), ctx, b);
    expect(out.stockValueDifference).toBe(-750); // 5 × (3000 / 20)
  });

  it("refuses an entry that would take stock below zero (only its quantity moves)", () => {
    const w = newWarehouseState();
    const r = processEntry(w, e({ voucherType: "Stock Entry", actualQty: -1 }), ctx, new Map());
    expect(r.negative).toBe(true);
    expect(r.qtyAfterTransaction).toBe(-1);
  });

  it("rounds the stock value to the currency precision", () => {
    const w = newWarehouseState();
    const r = processEntry(w, e({ actualQty: 3, incomingRate: 0.3333333 }), ctx, new Map());
    expect(r.stockValue).toBe(1);
    expect(r.unroundedStockValue).toBeCloseTo(0.9999999, 9);
  });
});
