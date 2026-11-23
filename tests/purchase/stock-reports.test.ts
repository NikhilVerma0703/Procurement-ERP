import { describe, expect, it } from "vitest";
import { formatFloat } from "@/lib/purchase/format";
import { addMonths, parseStockFilters } from "@/lib/purchase/stock/report-filters";
import { stockBalance, stockLedger, type LedgerEntry } from "@/lib/purchase/stock/reports";

// Phase II (owner, 21-11-2026): the Stock Balance and Stock Ledger arithmetic of ERPNext 14.92. The
// real proof is npm run golden:stock (every row of the old site's own answers); these pin the rules
// on made-up entries.

const items = new Map([["RESIN", { itemName: "Resin", itemGroup: "Raw Material", stockUom: "Kg", brand: null, description: null }]]);
let n = 0;
const e = (over: Partial<LedgerEntry>): LedgerEntry => ({
  itemCode: "RESIN", warehouse: "Stores - X", postingDate: "2026-01-10", postingTime: "10:00:00", date: "2026-01-10 10:00:00",
  company: "X", voucherType: "Purchase Receipt", voucherNo: `PR-${++n}`, actualQty: 0, qtyAfterTransaction: 0, incomingRate: 0,
  valuationRate: 0, stockValue: 0, stockValueDifference: 0, batchNo: null, serialNo: null, ...over,
});
const none = { stockEntries: new Set<string>(), stockReconciliations: new Set<string>() };

describe("Stock Balance", () => {
  it("splits opening, in and out by the dates, and keeps the last valuation rate", () => {
    const rows = stockBalance([
      e({ postingDate: "2025-12-01", actualQty: 100, stockValueDifference: 1000, valuationRate: 10 }),
      e({ actualQty: 50, stockValueDifference: 600, valuationRate: 10.667 }),
      e({ voucherType: "Stock Entry", actualQty: -30, stockValueDifference: -320, valuationRate: 10.667 }),
    ], items, { fromDate: "2026-01-01", toDate: "2026-01-31" }, none);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ openingQty: 100, openingVal: 1000, inQty: 50, inVal: 600, outQty: 30, outVal: 320, balQty: 120, balVal: 1280, valRate: 10.667, itemGroup: "Raw Material" });
  });

  it("lets a reconciliation without a batch set the balance, not add to it", () => {
    const [row] = stockBalance([
      e({ actualQty: 100, stockValueDifference: 1000 }),
      e({ voucherType: "Stock Reconciliation", actualQty: 0, qtyAfterTransaction: 90, stockValueDifference: -100 }),
    ], items, { fromDate: "2026-01-01", toDate: "2026-01-31" }, none);
    expect(row).toMatchObject({ inQty: 100, outQty: 10, balQty: 90, balVal: 900 });
  });

  it("counts an opening voucher as opening whatever its date", () => {
    const [row] = stockBalance([e({ voucherType: "Stock Reconciliation", voucherNo: "RECO-OPEN", actualQty: 5, qtyAfterTransaction: 5, stockValueDifference: 50 })],
      items, { fromDate: "2026-01-01", toDate: "2026-01-31" }, { stockEntries: new Set(), stockReconciliations: new Set(["RECO-OPEN"]) });
    expect(row).toMatchObject({ openingQty: 5, inQty: 0, balQty: 5 });
  });

  it("drops a row that is zero everywhere (its valuation rate aside), and rounds as the site did", () => {
    expect(stockBalance([e({ actualQty: 0.0001, valuationRate: 3 })], items, { fromDate: "2026-01-01", toDate: "2026-01-31" }, none)).toEqual([]);
    const [row] = stockBalance([e({ actualQty: 1.0005, stockValueDifference: 2.0015 })], items, { fromDate: "2026-01-01", toDate: "2026-01-31" }, none);
    expect(row.balQty).toBe(1.001); // Banker's Rounding (legacy) takes .5 up when precision > 0
  });
});

describe("Stock Ledger", () => {
  it("shows In and Out quantities and the movement's own rate", () => {
    const [inRow, outRow, reco] = stockLedger([
      e({ actualQty: 3, stockValueDifference: 100 }),
      e({ actualQty: -1, stockValueDifference: -33.3333 }),
      e({ voucherType: "Stock Reconciliation", actualQty: 0, valuationRate: 34 }),
    ], items) as { inQty: number; outQty: number; inOutRate: number | null; itemName: string }[];
    expect(inRow).toMatchObject({ inQty: 3, outQty: 0, inOutRate: 33.333, itemName: "Resin" });
    expect(outRow).toMatchObject({ inQty: 0, outQty: -1, inOutRate: 33.333 });
    expect(reco.inOutRate).toBe(34);
  });

  it("starts from the Opening row, and with a batch filter runs the batch's own balance", () => {
    const rows = stockLedger([e({ actualQty: 2, stockValueDifference: 20, qtyAfterTransaction: 999, stockValue: 9999 })], items,
      { batchFilter: true, opening: { qtyAfterTransaction: 5, valuationRate: 10, stockValue: 50 } });
    expect(rows[0]).toEqual({ opening: true, qtyAfterTransaction: 5, valuationRate: 10, stockValue: 50 });
    expect(rows[1]).toMatchObject({ qtyAfterTransaction: 7, stockValue: 70 });
  });
});

describe("the reports' filters and figures", () => {
  it("defaults to the last month, as the old filter bar did", () => {
    expect(addMonths("2026-11-21", -1)).toBe("2026-10-21");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    const f = parseStockFilters({}, "2026-11-21", "Acme");
    expect(f).toMatchObject({ company: "Acme", fromDate: "2026-10-21", toDate: "2026-11-21", itemCode: null });
    expect(parseStockFilters({ from_date: "21-11-2026", item_code: " RESIN " }, "2026-11-21", "Acme")).toMatchObject({ fromDate: "2026-10-21", itemCode: "RESIN" });
  });

  it("shows a Float as Frappe did: no decimals on a whole number, three otherwise", () => {
    expect(formatFloat(541)).toBe("541");
    expect(formatFloat(1022.927)).toBe("1,022.927");
    expect(formatFloat(0.5)).toBe("0.500");
    expect(formatFloat(-30)).toBe("-30");
    expect(formatFloat(null)).toBe("");
  });
});
