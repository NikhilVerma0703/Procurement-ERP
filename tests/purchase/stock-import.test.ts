import { describe, expect, it } from "vitest";
import { INSERT_ORDER, SOURCE_TABLES } from "@/lib/purchase/migrate/build";
import { importId } from "@/lib/purchase/migrate/convert";
import type { DumpTable, Row } from "@/lib/purchase/migrate/dump";
import { buildStock, STOCK_INSERT_ORDER, STOCK_SOURCE_TABLES, type KnownMasters } from "@/lib/purchase/migrate/stock-build";

// Phase II (owner, 21-11-2026): the Stock module's documents come across with the POs. Made-up
// records only — nothing here is the company's data.

const table = (rows: Row[]): DumpTable => ({ columns: [], rows, scanned: rows.length });
const known: KnownMasters = {
  items: new Set(["RM-RESIN"]),
  warehouses: new Set(["Stores - X"]),
  suppliers: new Set(["Acme Supplies"]),
  customers: new Set(),
  orders: new Set(["PO-1"]),
  orderItems: new Set(["poline1"]),
  priceLists: new Set(["Standard Buying"]),
};

describe("what the stock import reads", () => {
  it("reads each table once — the reader keeps one spec per table", () => {
    const names = SOURCE_TABLES.map((s) => s.table);
    expect(new Set(names).size).toBe(names.length);
  });

  it("reads the stock documents whole, so no field is lost", () => {
    // Shared child tables are narrowed to the rows of a stock document (by parenttype), nothing else.
    const shared = new Set(["tabSales Taxes and Charges", "tabSales Team", "tabSample Item"]);
    for (const spec of STOCK_SOURCE_TABLES) {
      expect(spec.columns, spec.table).toBeUndefined();
      if (!shared.has(spec.table)) expect(spec.where, spec.table).toBeUndefined();
      else expect(spec.where?.({ parenttype: "Sales Order" }), spec.table).toBe(false);
    }
    // Phase I's narrowed reads of these tables were replaced by the whole ones.
    for (const t of ["tabPurchase Receipt", "tabPurchase Receipt Item", "tabMaterial Request"]) {
      expect(SOURCE_TABLES.find((s) => s.table === t)?.columns, t).toBeUndefined();
    }
  });

  it("inserts every stock table once, after the POs and masters it points at", () => {
    const order = INSERT_ORDER as readonly string[];
    for (const key of STOCK_INSERT_ORDER) {
      expect(order.filter((k) => k === key)).toHaveLength(1);
      expect(order.indexOf(key)).toBeGreaterThan(order.indexOf("orderItems"));
      expect(order.indexOf(key)).toBeGreaterThan(order.indexOf("items"));
    }
    expect(order.indexOf("gateEntries")).toBeLessThan(order.indexOf("receipts"));
    expect(order.indexOf("receipts")).toBeLessThan(order.indexOf("landedCostReceipts"));
    expect(order.indexOf("deliveryNotes")).toBeLessThan(order.indexOf("packingSlips"));
  });
});

describe("building the stock rows", () => {
  const tables = new Map<string, DumpTable>([
    ["tabGate Entry", table([{ name: "GE-1", naming_series: "GE-.YY.-", docstatus: "1", po_no: "PO-1", supplier: "Acme Supplies", vehicle_no: "KA01", gate_entry_date: "2026-01-05", inward_no: "PR-1", creation: "2026-01-05 10:00:00" }])],
    ["tabGate Entry Item", table([
      { name: "gei1", parent: "GE-1", idx: "1", po_no: "PO-1", item_code: "RM-RESIN", po_qty: "10", item_qty: "10", po_item_name: "poline1" },
      { name: "gei2", parent: "GE-404", idx: "1", item_code: "RM-RESIN" },
    ])],
    ["tabPurchase Receipt", table([
      { name: "PR-1", naming_series: "PR-", docstatus: "1", status: "To Bill", supplier: "Acme Supplies", posting_date: "2026-01-05", posting_time: "10:30:00.123456", company: "X", currency: "INR", grand_total: "1180.5", gate_entry: "GE-1", creation: "2026-01-05 10:30:00" },
      { name: "PR-1-1", naming_series: "PR-", docstatus: "0", status: "Draft", supplier: "Gone Ltd", posting_date: "2026-01-06", posting_time: "09:00:00", company: "X", currency: "INR", amended_from: "PR-1", creation: "2026-01-06 09:00:00" },
    ])],
    ["tabPurchase Receipt Item", table([{ name: "pri1", parent: "PR-1", idx: "1", item_code: "RM-RESIN", qty: "10", received_qty: "10", uom: "Kg", stock_uom: "Kg", warehouse: "Stores - X", purchase_order: "PO-1", purchase_order_item: "poline1", rate: "100", amount: "1000" }])],
    ["tabPurchase Taxes and Charges", table([
      { name: "prt1", parent: "PR-1", parenttype: "Purchase Receipt", idx: "1", account_head: "GST - X", tax_amount: "180.5" },
      { name: "pot1", parent: "PO-1", parenttype: "Purchase Order", idx: "1", account_head: "GST - X" },
    ])],
    ["tabStock Ledger Entry", table([{ name: "SLE-1", item_code: "RM-RESIN", warehouse: "Stores - X", posting_date: "2026-01-05", posting_time: "10:30:00.123456", posting_datetime: "2026-01-05 10:30:00.123456", voucher_type: "Purchase Receipt", voucher_no: "PR-1", actual_qty: "10", qty_after_transaction: "10", stock_value_difference: "1000", stock_queue: "[[10, 100.0]]", company: "X", is_cancelled: "0", creation: "2026-01-05 10:30:01" }])],
    ["tabBin", table([{ name: "BIN-1", item_code: "RM-RESIN", warehouse: "Elsewhere - X", actual_qty: "10" }])],
  ]);
  const built = buildStock(tables, known);

  it("keeps the ERPNext names, links what the import has, and the whole source row", () => {
    const [ge] = built.gateEntries;
    expect(ge).toMatchObject({ number: "GE-1", docStatus: "SUBMITTED", orderId: importId("po", "PO-1"), supplierId: importId("su", "Acme Supplies"), receiptNumber: "PR-1" });
    expect(built.gateEntryItems[0]).toMatchObject({ orderItemId: importId("poi", "poline1"), itemId: importId("it", "RM-RESIN"), poQty: "10" });
    const [pr] = built.receipts;
    expect(pr).toMatchObject({ number: "PR-1", status: "To Bill", gateEntryId: importId("ge", "GE-1"), grandTotal: "1180.5", postingTime: "10:30:00.123456" });
    expect(pr.legacy).toMatchObject({ name: "PR-1", gate_entry: "GE-1" });
    expect(built.receiptItems[0]).toMatchObject({ orderId: importId("po", "PO-1"), orderItemId: importId("poi", "poline1"), warehouseId: importId("wh", "Stores - X") });
  });

  it("takes only the receipt's own tax rows from the shared tax table", () => {
    expect(built.receiptTaxes.map((t) => t.erpnextName)).toEqual(["prt1"]);
  });

  it("inserts an amendment after its original, and links them", () => {
    expect(built.receipts.map((r) => r.number)).toEqual(["PR-1", "PR-1-1"]);
    expect(built.receipts[1].amendedFromId).toBe(importId("pr", "PR-1"));
  });

  it("keeps an unresolvable link as text and reports it, never guessing", () => {
    const amended = built.receipts[1];
    expect(amended).toMatchObject({ supplierCode: "Gone Ltd", supplierId: null });
    expect(built.bins[0]).toMatchObject({ warehouseCode: "Elsewhere - X", warehouseId: null });
    expect(built.issues.some((i) => i.includes('supplier "Gone Ltd"'))).toBe(true);
    expect(built.issues.some((i) => i.includes('warehouse "Elsewhere - X"'))).toBe(true);
  });

  it("reports an orphan child row and leaves it out", () => {
    expect(built.gateEntryItems.map((i) => i.erpnextName)).toEqual(["gei1"]);
    expect(built.issues.some((i) => i.includes("gei2") && i.includes("GE-404"))).toBe(true);
  });

  it("keeps the ledger's exact figures, its FIFO queue and its posting instant", () => {
    const [sle] = built.stockLedgerEntries;
    expect(sle).toMatchObject({ actualQty: "10", stockValueDifference: "1000", stockQueue: "[[10, 100.0]]", isCancelled: false });
    // 10:30 in Asia/Kolkata is 05:00 UTC.
    expect((sle.postingDateTime as Date).toISOString()).toBe("2026-01-05T05:00:00.123Z");
  });
});
