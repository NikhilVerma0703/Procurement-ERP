// The Stock screens drawn from their definitions, and the five further Stock Reports (owner,
// 24-11-2026: "make all these remainings"; the Gate Entry List "looking different … some extra
// columns and icons"). The list rules are held to the old site's own list screens (captured
// 23–24-11-2026: their headings, standard filters and sort selectors); the reports' arithmetic to
// ERPNext 14.92's (the full check against the old answers is npm run golden:stock).
import { describe, expect, it } from "vitest";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import {
  countLabel, docIndicator, docListParams, filtersFromDataFilter, guessColour, isEstimatedCount, listCell, listColumns, parseDocListQuery, sortOptions,
  standardFilters, withFilters,
} from "@/lib/purchase/doc/list-view";
import { afterChange, effectiveLayout, fetchesFor, formRules, lookupFor, mayType } from "@/lib/purchase/doc/master-form";
import { DOC_SCREENS, GATE_ENTRY_SCREEN, screenBySegment } from "@/lib/purchase/doc/screens";
import { PURCHASE_MODULES, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { oldDbCompare } from "@/lib/purchase/stock/collation";
import {
  dateDiff, itemPriceStock, stockAgeing, stockProjectedQty, summaryRows, totalRow, warehouseWiseStockBalance, type AgeingEntry, type AgeingItem,
} from "@/lib/purchase/stock/reports-more";

const L = (doctype: string) => LAYOUTS[doctype]!;
const screen = (doctype: string) => DOC_SCREENS.find((s) => s.doctype === doctype) ?? GATE_ENTRY_SCREEN;

describe("the sidebar", () => {
  it("lists every section of Stock › Masters & Reports, in the old workspace's order", () => {
    const stock = PURCHASE_MODULES.find((m) => m.key === "stock")!;
    expect(stock.groups.map((g) => [g.label, g.rows.map((r) => r.label)])).toEqual([
      ["Items and Pricing", ["Item", "Item Group", "Product Bundle", "Price List", "Item Price", "Shipping Rule", "Pricing Rule", "Item Alternative", "Item Manufacturer", "Customs Tariff Number"]],
      ["Stock Transactions", ["Material Request", "Stock Entry", "Delivery Note", "Gate Entry", "Purchase Receipt", "Pick List", "Delivery Trip"]],
      ["Stock Reports", ["Stock Ledger", "Stock Balance", "Stock Projected Qty", "Stock Summary", "Stock Ageing", "Item Price Stock", "Warehouse Wise Stock Balance"]],
    ]);
    const known = new Set<string>(Object.values(PURCHASE_PATHS));
    for (const g of stock.groups) for (const r of g.rows) expect(known.has(r.href), r.label).toBe(true);
  });

  it("finds each screen by its path, and nothing else", () => {
    for (const s of DOC_SCREENS) expect(screenBySegment(s.path.slice("/purchase/".length))).toBe(s);
    expect(screenBySegment("orders")).toBeUndefined();
    expect(screenBySegment("anything")).toBeUndefined();
  });
});

describe("the list view, from the DocType's definition", () => {
  // The old lists' headings in a window up to 1366 px (captured 23–24-11-2026), the Tag column left out.
  const NARROW: Record<string, string[]> = {
    "Material Request": ["Title", "Status", "Purpose", "ID"],
    "Stock Entry": ["Stock Entry Type", "Status", "Purpose", "ID"],
    "Delivery Note": ["Title", "Status", "Grand Total", "ID"],
    "Price List": ["ID", "Status", "Currency"],
    "Item Price": ["Item Name", "Item Code", "Brand"],
    "Product Bundle": ["ID", "Status", "Parent Item"],
    "Shipping Rule": ["ID", "Status", "Calculate Based On"],
    "Pricing Rule": ["Title", "Apply On", "ID"],
    "Item Alternative": ["Item Code", "Alternative Item Code", "ID"],
    "Item Manufacturer": ["Item Code", "Manufacturer", "Manufacturer Part Number", "ID"],
    "Customs Tariff Number": ["ID", "Tariff Number", "Description"],
    "Pick List": ["ID", "Status", "Company"],
    "Delivery Trip": ["Driver Name", "Status", "Departure Time", "ID"],
    "Gate Entry": ["ID", "Status", "Po No"],
  };

  it.each(Object.entries(NARROW))("draws %s's columns as the old list did", (doctype, heading) => {
    const cols = listColumns(L(doctype), { hideNameColumn: screen(doctype).hideNameColumn });
    expect(cols.filter((c) => c.from === 0).map((c) => c.label)).toEqual(heading);
  });

  it("adds columns as the window widens: the Gate Entry List of the owner's screen (1920 px)", () => {
    const cols = listColumns(L("Gate Entry"));
    expect(cols.map((c) => [c.label, c.from])).toEqual([["ID", 0], ["Status", 0], ["Po No", 0], ["Inward No", 1367], ["Supplier", 1367], ["Inward Date", 1920]]);
  });

  it("offers the old standard filters", () => {
    const names = (d: string) => standardFilters(L(d)).map((f) => f.fieldname);
    expect(names("Material Request")).toEqual(["name", "title", "material_request_type", "company", "status"]);
    expect(names("Item Price")).toEqual(["name", "item_code", "item_name", "price_list", "reference"]);
    expect(names("Stock Entry")).toEqual(["name", "stock_entry_type", "from_warehouse", "to_warehouse"]);
    expect(names("Delivery Note")).toEqual(["name", "title", "customer", "company", "set_target_warehouse", "status"]);
    expect(names("Delivery Trip")).toEqual(["name", "driver_name", "status"]);
    expect(names("Gate Entry")).toEqual(["name"]);
    const purpose = standardFilters(L("Material Request")).find((f) => f.fieldname === "material_request_type")!;
    expect([purpose.condition, purpose.options?.split("\n")[0]]).toEqual(["=", ""]);
    expect(standardFilters(L("Material Request")).find((f) => f.fieldname === "title")!.condition).toBe("like");
  });

  // The sort selectors' options as captured from the old lists.
  const SORTS: Record<string, string[]> = {
    "Material Request": ["Last Updated On", "Title", "ID", "Created On", "Most Used", "Series", "Purpose", "Company", "Transaction Date", "Required By", "Set Target Warehouse"],
    "Item Price": ["Last Updated On", "Item Name", "ID", "Created On", "Most Used", "Item Code", "Brand", "Price List", "Customer", "Currency", "Rate", "Reference"],
    "Stock Entry": ["Last Updated On", "Stock Entry Type", "ID", "Created On", "Most Used", "Series", "Purpose", "Company", "Default Source Warehouse", "Default Target Warehouse", "Supplier Name", "Per Transferred", "Is Return"],
    "Gate Entry": ["Last Updated On", "ID", "Created On", "Most Used", "Naming Series", "Po No", "Inward No", "Supplier", "Inward Date", "Vehicle No"],
    "Price List": ["Last Updated On", "ID", "Created On", "Most Used", "Price List Name", "Currency", "Buying", "Selling"],
    "Pricing Rule": ["Last Updated On", "Title", "ID", "Created On", "Most Used", "Apply On", "Price or Product Discount", "Currency"],
    "Customs Tariff Number": ["Last Updated On", "ID", "Created On", "Most Used", "Tariff Number", "Description"],
    "Delivery Trip": ["Last Updated On", "Driver Name", "ID", "Created On", "Most Used", "Company", "Vehicle", "Departure Time"],
    "Product Bundle": ["Last Updated On", "ID", "Created On", "Most Used", "Parent Item", "Description"],
    "Shipping Rule": ["Last Updated On", "ID", "Created On", "Most Used", "Shipping Rule Label", "Company", "Shipping Account", "Cost Center", "Calculate Based On"],
    "Pick List": ["Last Updated On", "ID", "Created On", "Most Used", "Series", "Company", "Customer", "Status"],
  };

  it.each(Object.entries(SORTS))("sorts %s by the old selector's fields", (doctype, options) => {
    expect(sortOptions(L(doctype)).map((s) => s.label)).toEqual(options);
  });

  it("colours each status as the old lists did", () => {
    const mr = L("Material Request");
    expect(docIndicator(mr, { docstatus: 1, per_ordered: 0, material_request_type: "Material Issue" })?.label).toBe("Pending");
    expect(docIndicator(mr, { docstatus: 1, per_ordered: 40 })).toMatchObject({ label: "Partially ordered", colour: "yellow" });
    expect(docIndicator(mr, { docstatus: 1, per_ordered: 100, material_request_type: "Material Issue" })).toMatchObject({ label: "Issued", colour: "green" });
    expect(docIndicator(mr, { docstatus: 1, per_ordered: 100, per_received: 50, material_request_type: "Purchase" })?.label).toBe("Partially Received");
    expect(docIndicator(mr, { docstatus: 0 })).toMatchObject({ label: "Draft", colour: "red" });
    const se = L("Stock Entry");
    expect(docIndicator(se, { docstatus: 1, purpose: "Material Receipt" })).toMatchObject({ label: "Submitted", colour: "blue" });
    expect(docIndicator(se, { docstatus: 2 })?.label).toBe("Cancelled");
    const dn = L("Delivery Note");
    expect(docIndicator(dn, { docstatus: 1, per_billed: 0 })).toMatchObject({ label: "To Bill", colour: "orange" });
    expect(docIndicator(dn, { docstatus: 1, is_return: 1 })?.label).toBe("Return");
    expect(docIndicator(L("Price List"), { enabled: 1 })).toMatchObject({ label: "Enabled", colour: "blue" });
    expect(docIndicator(L("Price List"), { enabled: 0 })).toMatchObject({ label: "Disabled", colour: "gray" });
    expect(docIndicator(L("Item Price"), {})).toBeNull();
    expect(docIndicator(L("Gate Entry"), { docstatus: 1 })?.filter).toBe("docstatus,=,1");
    expect([guessColour("Pending"), guessColour("Open"), guessColour("Completed"), guessColour("Submitted"), guessColour("Draft")]).toEqual(["orange", "red", "green", "blue", "gray"]);
  });

  it("counts as Frappe did: to 1,001, then the exact count on a click", () => {
    expect(countLabel(20, 77, false)).toBe("20 of 77");
    expect(countLabel(20, 1001, false)).toBe("20 of 1,000+");
    expect(isEstimatedCount(1001, false)).toBe(true);
    expect(countLabel(20, 4693, true)).toBe("20 of 4,693");
  });

  it("keeps its state in the address as Frappe's route options", () => {
    const l = L("Material Request");
    const q = parseDocListQuery(l, new URLSearchParams('status=Pending&name=["like","%252555%25"]&_sort=creation&_page_length=100&nonsense=1'), { sort: "creation", order: "desc" });
    expect(q.filters).toEqual([{ field: "status", op: "=", value: "Pending" }, { field: "name", op: "like", value: "%2555%" }]);
    expect([q.sort, q.order, q.pageLength, q.limit, q.exact]).toEqual(["creation", "desc", 100, 100, false]);
    expect(docListParams(q, { sort: "creation", order: "desc" }).toString()).toBe("status=Pending&name=%5B%22like%22%2C%22%252555%25%22%5D&_page_length=100");
  });

  it("filters by a clicked value or pill, replacing the condition on that field", () => {
    const now = withFilters([{ field: "status", op: "=", value: "Pending" }], filtersFromDataFilter("status,=,Stopped|per_ordered,<,100"));
    expect(now).toEqual([{ field: "status", op: "=", value: "Stopped" }, { field: "per_ordered", op: "<", value: "100" }]);
  });

  it("draws a cell as get_column_html did: Selects as pills, Links filterable, Percent as a bar", () => {
    const l = L("Stock Entry");
    const f = (n: string) => l.fields.find((x) => x.fieldname === n)!;
    const fmt = () => "";
    expect(listCell(f("purpose"), { purpose: "Material Issue" }, fmt)).toMatchObject({ kind: "pill", colour: "gray", filter: "purpose,=,Material Issue" });
    expect(listCell(f("from_warehouse"), { from_warehouse: "Stores - PESPL" }, fmt)).toMatchObject({ kind: "link", text: "Stores - PESPL" });
    expect(listCell(f("per_transferred"), { per_transferred: 40 }, fmt)).toMatchObject({ kind: "percent", percent: 40 });
  });
});

describe("the masters' forms (their form scripts)", () => {
  it("toggles what is mandatory, as shipping_rule.js and pricing_rule.js did", () => {
    const fixed = effectiveLayout(L("Shipping Rule"), { calculate_based_on: "Fixed" }, true);
    expect(fixed.fields.find((f) => f.fieldname === "shipping_amount")?.reqd).toBe(true);
    expect(fixed.fields.find((f) => f.fieldname === "conditions")?.reqd).toBe(false);
    const byItem = effectiveLayout(L("Pricing Rule"), { apply_on: "Item Code", buying: 1 }, true);
    expect(byItem.fields.find((f) => f.fieldname === "items")?.reqd).toBe(true);
    expect(byItem.fields.find((f) => f.fieldname === "applicable_for")?.options).toBe("\nSupplier\nSupplier Group");
  });

  it("locks what the old forms locked", () => {
    expect(formRules("Item Group", { parent_item_group: "" }, false).readOnly).toBe(true);
    expect(formRules("Item Group", { parent_item_group: "All Item Groups" }, false).readOnly).toBe(false);
    expect(formRules("Product Bundle", {}, false).locked.has("new_item_code")).toBe(true);
    expect(formRules("Product Bundle", {}, true).locked.has("new_item_code")).toBe(false);
    const ip = L("Item Price");
    expect(mayType(ip.fields.find((f) => f.fieldname === "item_name")!, {})).toBe(false);
    expect(mayType(ip.fields.find((f) => f.fieldname === "price_list_rate")!, {})).toBe(true);
  });

  it("searches and fetches as the form scripts set them", () => {
    const ip = L("Item Price");
    expect(lookupFor("Item Price", null, ip.fields.find((f) => f.fieldname === "item_code")!, {})).toEqual({ type: "stdItem", params: { variants: "0" } });
    expect(lookupFor("Item Price", null, ip.fields.find((f) => f.fieldname === "batch_no")!, { item_code: "X" })).toEqual({ type: "batch", params: { item: "X" } });
    expect(lookupFor("Item Group", null, L("Item Group").fields.find((f) => f.fieldname === "parent_item_group")!, { item_group_name: "Steel" })).toEqual({ type: "parentItemGroup", params: { exclude: "Steel" } });
    expect(fetchesFor("Item Price", ip, "item_code").map((x) => `${x.target}←${x.source}`)).toEqual(["brand←brand", "item_name←item_name", "item_description←description", "uom←stock_uom"]);
    expect(fetchesFor("Item Price", ip, "price_list").map((x) => x.target)).toEqual(["buying", "selling", "currency"]);
  });

  it("reacts to a choice as pricing_rule.js did", () => {
    expect(afterChange("Pricing Rule", { rate_or_discount: "Rate", for_price_list: "Standard Buying" }, "rate_or_discount").for_price_list).toBe("");
    expect(afterChange("Pricing Rule", { buying: 0, selling: 1, applicable_for: "Supplier" }, "buying").applicable_for).toBe("");
  });
});

describe("the five further Stock Reports (ERPNext 14.92's arithmetic)", () => {
  const items = new Map<string, AgeingItem>([["A", { itemName: "A", description: null, itemGroup: "G", brand: null, stockUom: "Nos", hasSerialNo: false }]]);
  const e = (postingDate: string, actualQty: number, qtyAfterTransaction: number, voucherNo = `V${postingDate}`, voucherType = "Purchase Receipt", warehouse = "W"): AgeingEntry => ({
    itemCode: "A", warehouse, postingDate, voucherType, voucherNo, actualQty, qtyAfterTransaction, serialNo: null,
  });

  it("ages stock in FIFO slots: what goes out leaves the oldest first", () => {
    const { rows } = stockAgeing([e("2026-01-01", 10, 10), e("2026-10-01", 5, 15), e("2026-11-01", -12, 3)], items, { toDate: "2026-11-24", range1: 30, range2: 60, range3: 90, showWarehouseWise: false });
    // 3 left, from the October slot (54 days).
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 3, averageAge: 54, range1: 0, range2: 3, range3: 0, range4: 0, earliest: 54, latest: 54 });
  });

  it("gives back to the same slots what went out and came in on one voucher (a transfer within a warehouse)", () => {
    const { rows } = stockAgeing([e("2026-01-01", 10, 10), e("2026-11-20", -4, 6, "REPACK"), e("2026-11-20", 4, 10, "REPACK")], items, { toDate: "2026-11-24", range1: 30, range2: 60, range3: 90, showWarehouseWise: false });
    expect(rows[0]).toMatchObject({ qty: 10, earliest: dateDiff("2026-11-24", "2026-01-01"), range4: 10 });
  });

  it("takes a reconciliation's change from the balance it set", () => {
    const { rows } = stockAgeing([e("2026-11-01", 10, 10), e("2026-11-10", 0, 7, "RECO", "Stock Reconciliation")], items, { toDate: "2026-11-24", range1: 30, range2: 60, range3: 90, showWarehouseWise: false });
    expect(rows[0]).toMatchObject({ qty: 7, range1: 7 });
  });

  it("sorts the rows by Average Age, oldest first, and charts the ten oldest", () => {
    const many = new Map<string, AgeingItem>([...items, ["B", { ...items.get("A")!, itemName: "B" }]]);
    const { rows, chart } = stockAgeing(
      [{ ...e("2026-11-20", 1, 1), itemCode: "B" }, e("2026-01-01", 2, 2)],
      many,
      { toDate: "2026-11-24", range1: 30, range2: 60, range3: 90, showWarehouseWise: false },
    );
    expect(rows.map((r) => r.itemCode)).toEqual(["A", "B"]);
    expect(chart).toEqual({ labels: ["A", "B"], values: [327, 4] });
  });

  it("projects each Bin, with the shortage under its reorder level", () => {
    const bin = { itemCode: "A", warehouse: "W", company: "C", actualQty: 5, plannedQty: 0, indentedQty: 0, orderedQty: 2, reservedQty: 0, reservedQtyForProduction: 0, reservedQtyForProductionPlan: 0, reservedQtyForSubContract: 0, projectedQty: 7 };
    const item = { name: "A", itemName: "A", description: null, itemGroup: "G", brand: null, stockUom: "Nos", reorderLevels: [{ warehouse: "W", level: 10, qty: 5 }] };
    const rows = stockProjectedQty([bin, { ...bin, itemCode: "GONE" }], new Map([["A", item]]), { company: "C" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reOrderLevel: 10, reOrderQty: 5, shortageQty: 3, reservedQtyForPos: 0 });
    expect(stockProjectedQty([bin], new Map([["A", item]]), { company: "Other" })).toHaveLength(0);
  });

  it("totals as the query report did: non-zero cells only, blank where none", () => {
    expect(totalRow(["a", "b"], [{ a: 1.5, b: 0 }, { a: 2, b: 0 }])).toEqual({ a: 3.5, b: "" });
  });

  it("lists each Item Price with every Bin of its item, in the prices' own order", () => {
    const prices = [
      { name: "b1", itemCode: "X", itemName: "X", brand: null, priceList: "Standard Selling", rate: 9, buying: false, selling: true },
      { name: "a1", itemCode: "X", itemName: "X", brand: null, priceList: "Standard Buying", rate: 5, buying: true, selling: false },
    ];
    const rows = itemPriceStock(prices, new Map([["X", [{ warehouse: "Stores", actualQty: 4 }, { warehouse: "WIP", actualQty: 1 }]]]), {});
    expect(rows.map((r) => [r.buyingPriceList, r.buyingRate, r.sellingPriceList, r.warehouse, r.stockAvailable])).toEqual([
      ["Standard Buying", 5, "", "Stores", 4], ["Standard Buying", 5, "", "WIP", 1], ["", 0, "Standard Selling", "Stores", 4], ["", 0, "Standard Selling", "WIP", 1],
    ]);
    expect(itemPriceStock(prices.slice(0, 1), new Map(), {})[0]).toMatchObject({ warehouse: null, stockAvailable: 0 });
  });

  it("rolls warehouse values into their groups as the old code did (a group inside a group passes on only its own)", () => {
    const rows = warehouseWiseStockBalance(
      [
        { name: "All", parent: null, isGroup: true, disabled: false },
        { name: "Sub", parent: "All", isGroup: true, disabled: false },
        { name: "S1", parent: "Sub", isGroup: false, disabled: false },
        { name: "W1", parent: "All", isGroup: false, disabled: false },
      ],
      new Map([["S1", 10], ["W1", 5]]),
    );
    expect(rows.map((r) => [r.name, r.stockBalance, r.indent])).toEqual([["All", 5, 0], ["Sub", 10, 1], ["S1", 10, 2], ["W1", 5, 1]]);
  });

  it("scales the Stock Summary's bars to the page's largest figure", () => {
    const { rows, maxCount } = summaryRows([
      { itemCode: "A", itemName: "A", warehouse: "W", projectedQty: -4053.726, reservedQty: 4107.726, reservedQtyForProduction: 0, reservedQtyForSubContract: 0, actualQty: 54 },
      { itemCode: "B", itemName: "B", warehouse: "W", projectedQty: 20, reservedQty: 0, reservedQtyForProduction: 0, reservedQtyForSubContract: 0, actualQty: 5 },
    ]);
    expect(maxCount).toBe(4107.726);
    expect(rows.map((r) => [r.totalReserved, r.pendingQty])).toEqual([[4107.726, 0], [0, 15]]);
  });
});

describe("the old database's text order (utf8mb4_unicode_ci)", () => {
  it("puts curly quotes after the straight ones, and counts no case", () => {
    const list = ['1” PVC Flexible Hose', '1" Threaded Coupling', '1" PVC JUNCTION BOX', '1" SPRIT LEVEL'];
    expect([...list].sort(oldDbCompare)).toEqual(['1" PVC JUNCTION BOX', '1" SPRIT LEVEL', '1" Threaded Coupling', '1” PVC Flexible Hose']);
    expect(oldDbCompare("apple", "APPLE ")).toBeGreaterThan(0); // equal keys (case, trailing space), then the plain text
    expect(Math.sign(oldDbCompare("abc", "ABD"))).toBe(-1);
  });

  it("reads ½ as 1⁄2 and skips invisible characters", () => {
    expect(['½” RATCHAT', '0.1 mm', '2 x'].sort(oldDbCompare)).toEqual(['0.1 mm', '½” RATCHAT', '2 x']);
    expect(['⁠Sticker', 'Rubber', 'Tape'].sort(oldDbCompare)).toEqual(['Rubber', '⁠Sticker', 'Tape']);
  });
});
