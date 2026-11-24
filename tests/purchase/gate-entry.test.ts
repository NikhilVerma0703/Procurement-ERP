// Gate Entry and the receipt's submission: the rules derived from the old site (its add-on's form
// script, the live po_items answers of 23-11-2026, and its own records), kept as tests.
import { describe, expect, it } from "vitest";
import { processEntry, type WarehouseState } from "@/lib/purchase/stock/ledger-engine";
import { fiscalYearOf, queueText } from "@/lib/purchase/stock/ledger-format";
import {
  amendedName, balQty, financialYears, gateEntryIndicator, gateEntrySeriesKey, listCountLabel, poItemsOf, rowsFromPoItems,
} from "@/lib/purchase/stock/gate-entry-meta";
import { receiptStockEntries, receiptValuation } from "@/lib/purchase/stock/receipt-doc";

describe("po_items (the old site's answers, 23-11-2026)", () => {
  // PUR-ORD/25-26/02373 as the live site held it, and what its po_items returned.
  const lines = [
    { name: "3bg08oh21k", itemCode: "Quartz grits 0.1-0.4mm (M) Supreme", itemName: "x", description: "Quartz grits 0.1-0.4mm (M) Supreme", uom: "Tonne", qty: 350, receivedQty: 348.27 },
    { name: "3bg0v9v7a1", itemCode: "Quartz Powder 400 # 38 Mic  - Premium Filler", itemName: "x", description: "Q", uom: "Tonne", qty: 400, receivedQty: 0 },
    { name: "3bg01fpqok", itemCode: "QUARTZ GRITS 0.6-1.2MM PREMIUM", itemName: "x", description: "Q6", uom: "Tonne", qty: 100, receivedQty: 73.48 },
  ];

  it("is each line's quantity still to receive, in the line's ID order", () => {
    expect(poItemsOf(lines).map((l) => [l.name, l.qty])).toEqual([["3bg01fpqok", 26.52], ["3bg08oh21k", 1.73], ["3bg0v9v7a1", 400]]);
  });

  it("fills a new entry's rows, leaving out lines with nothing left (PUR-ORD/25-26/02522: all received)", () => {
    const rows = rowsFromPoItems(
      { number: "PUR-ORD/25-26/02548", transactionDate: "2026-11-20" },
      [
        { name: "rnhkild455", item_code: "LPG Cylinder", description: "LPG Cylinder", uom: "Kg", qty: 850 },
        { name: "done", item_code: "X", description: "X", uom: "Nos", qty: 0 },
      ],
      () => "row1",
    );
    expect(rows).toEqual([
      {
        __islocal: 1, name: "row1", idx: 1, po_no: "PUR-ORD/25-26/02548", po_date: "2026-11-20", item_code: "LPG Cylinder", item_description: "LPG Cylinder",
        uom: "Kg", po_qty: 850, item_qty: 0, bal_qty: 850, po_item_name: "rnhkild455",
      },
    ]);
  });

  it("Bal Qty = Po Qty − Item Qty (GE-25-26-03509: 1,700 − 1 = 1,699)", () => {
    expect(balQty(1700, 1)).toBe(1699);
    expect(balQty(4, 4)).toBe(0);
  });
});

describe("naming and the list", () => {
  it("numbers from the series, with its {financial_year} part", () => {
    expect(gateEntrySeriesKey("GE-25-26-.#####", {})).toEqual({ prefix: "GE-25-26-", digits: 5 });
    expect(gateEntrySeriesKey("GE-.{financial_year}.-.#####", { financial_year: "2026-2027" })).toEqual({ prefix: "GE-2026-2027-", digits: 5 });
  });

  it("names an amendment as Frappe did (GE-25-26-03332 → GE-25-26-03332-1 → …-2)", () => {
    expect(amendedName("GE-25-26-03332", false)).toBe("GE-25-26-03332-1");
    expect(amendedName("GE-25-26-03332-1", true)).toBe("GE-25-26-03332-2");
  });

  it("shows Frappe's indicator and count", () => {
    expect(gateEntryIndicator("SUBMITTED")).toEqual({ label: "Submitted", colour: "blue" });
    expect(gateEntryIndicator("CANCELLED")).toEqual({ label: "Cancelled", colour: "red" });
    expect(gateEntryIndicator("DRAFT")).toEqual({ label: "Draft", colour: "red" });
    expect(listCountLabel(20)).toBe("20");
    expect(listCountLabel(1000)).toBe("1,000");
    expect(listCountLabel(4693)).toBe("1,000+");
  });

  it("offers the company's financial years up to the current one", () => {
    expect(financialYears("2026-11-24")).toEqual(["2026-2027", "2025-2026", "2024-2025", "2023-2024"]);
    expect(financialYears("2026-03-31")[0]).toBe("2025-2026");
  });
});

describe("a receipt's submission", () => {
  it("values each stock row at its net rate when no tax counts in valuation (PR/25-26/MM-03457: 280.000000)", () => {
    const doc = receiptValuation(
      { items: [{ item_code: "Paint", qty: 36, conversion_factor: 1, base_net_amount: 10080 }, { item_code: "Service", qty: 1, conversion_factor: 1, base_net_amount: 500 }], taxes: [{ category: "Total", base_tax_amount_after_discount_amount: 1814.4 }] },
      (c) => c === "Paint",
      3,
    );
    expect((doc.items as Record<string, unknown>[]).map((r) => [r.valuation_rate, r.item_tax_amount])).toEqual([[280, 0], [0, 0]]);
  });

  it("spreads a valuation tax over the stock rows by amount, the last row taking what is left", () => {
    const doc = receiptValuation(
      {
        items: [
          { item_code: "A", qty: 10, conversion_factor: 1, base_net_amount: 1000 },
          { item_code: "B", qty: 5, conversion_factor: 2, base_net_amount: 2000 },
        ],
        taxes: [{ category: "Valuation and Total", base_tax_amount_after_discount_amount: 100 }],
      },
      () => true,
      3,
    );
    const rows = doc.items as Record<string, number>[];
    expect(rows.map((r) => r.item_tax_amount)).toEqual([33.333, 66.667]);
    expect(rows[0].valuation_rate).toBe(103.3333);
    expect(rows[1].valuation_rate).toBe(206.6667);
  });

  it("posts accepted stock at its valuation rate and rejected stock at 0, in stock units", () => {
    const entries = receiptStockEntries(
      {
        name: "PR/1", company: "C", posting_date: "2026-11-24", posting_time: "10:00:00",
        items: [
          { name: "r1", item_code: "A", qty: 2, rejected_qty: 1, conversion_factor: 1000, warehouse: "Stores - PESPL", rejected_warehouse: "Rejected - PESPL", valuation_rate: 0.5, stock_uom: "Kg" },
          { name: "r2", item_code: "S", qty: 1, conversion_factor: 1, warehouse: "Stores - PESPL", valuation_rate: 100 },
        ],
      },
      (c) => c === "A",
    );
    expect(entries.map((e) => [e.warehouse, e.actualQty, e.incomingRate, e.voucherDetailNo])).toEqual([
      ["Stores - PESPL", 2000, 0.5, "r1"],
      ["Rejected - PESPL", 1000, 0, "r1"],
    ]);
  });

  it("values the entry from the last one's state as the old ledger did (LPG Cylinder, 24-11-2026 run)", () => {
    // MAT-SLE-2026-03640 (PR/25-26/MM-03448): 5,950 Kg worth 5,52,457.50, then 425 Kg at 92.39.
    const w: WarehouseState = { qty: 5950, valuationRate: 92.85, stockValue: 552457.5, prevStockValue: 552457.5, queue: [[1700, 93], [1700, 91.5], [1700, 94.28], [850, 92.39]] };
    const r = processEntry(
      w,
      { voucherType: "Purchase Receipt", voucherNo: "PR/x", actualQty: 425, incomingRate: 92.39, outgoingRate: 0, batchNo: null, serialNo: null, company: "C", qtyAfterTransaction: 0, valuationRate: 0 },
      { batchwise: () => false, serial: () => null, fallbackRate: () => w.valuationRate, floatPrecision: 3, currencyPrecision: 3 },
      new Map(),
    );
    expect([r.qtyAfterTransaction, r.stockValue, r.stockValueDifference]).toEqual([6375, 591723.25, 39265.75]);
    expect(queueText(r.stockQueue)).toBe("[[1700.0, 93.0], [1700.0, 91.5], [1700.0, 94.28], [1275.0, 92.39]]");
  });

  it("writes the fiscal year and queue as the old site did", () => {
    expect(fiscalYearOf("2026-11-23")).toBe("2026-2027");
    expect(fiscalYearOf("2026-03-31")).toBe("2025-2026");
    expect(queueText([[40, 250], [36, 280]])).toBe("[[40.0, 250.0], [36.0, 280.0]]");
  });
});
