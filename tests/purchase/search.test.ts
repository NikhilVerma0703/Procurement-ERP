// The top search box against the old site's own answers (captured 23-11-2026, as stores@:
// data/erpnext-live/live-search-results-20261123.json). The scores are the old site's to the digit;
// the lists are the old lists less the screens this ERP does not have (list report views, the
// "Gate Entry Reciept wise" report, other modules' DocTypes).
import { describe, expect, it } from "vitest";
import { deduplicate, searchOptions, searchScope, visitedPage, type SearchContext } from "@/lib/purchase/search/awesome";
import { evaluate } from "@/lib/purchase/search/calc";
import { boldenMatchPart, fuzzySearch } from "@/lib/purchase/search/fuzzy";

const store = { role: "STORE" };
const ctx = (over: Partial<SearchContext> = {}): SearchContext => ({ ...searchScope(store), currentList: null, recent: [], frequent: [], ...over });
const values = (input: string, c = ctx()) => searchOptions(input, c).map((o) => o.value);

describe("fuzzy match: the old site's scores", () => {
  it.each([
    ["ga", "Gate Entry", 132],
    ["gate", "Gate Entry", 189],
    ["gate entry", "Gate Entry", 370],
    ["purchase receipt", "Purchase Receipt", 520],
    ["receipt", "Purchase Receipt", 256],
    ["purchase order", "Purchase Order", 470],
    ["po", "Purchase Order", 133],
    ["supplier", "Supplier", 290],
    ["item", "Item", 190],
    ["stock balance", "Stock Balance", 445],
  ])("%s → %s = %i", (q, name, score) => {
    expect(fuzzySearch(q, name)).toBe(score);
  });

  it("does not match when letters are missing or out of order", () => {
    expect(fuzzySearch("gate entry list", "Gate Entry")).toBe(0);
    expect(fuzzySearch("", "Gate Entry")).toBe(0);
    expect(fuzzySearch("zq", "Gate Entry")).toBe(0);
  });

  it("marks the matched letters as the old box did", () => {
    expect(boldenMatchPart("Gate Entry", "Gate")).toBe("<mark>Gate</mark> Entry");
    expect(boldenMatchPart("Gate Entry", "gate entry")).toBe("<mark>G</mark><mark>a</mark><mark>t</mark><mark>e</mark><mark> </mark><mark>E</mark><mark>n</mark><mark>t</mark><mark>r</mark><mark>y</mark>");
    expect(boldenMatchPart("Gate Entry", "xyz")).toBe("Gate Entry");
  });
});

describe("the box's list", () => {
  it("'gate entry': the list, the new one, global search, help", () => {
    expect(values("gate entry")).toEqual(["Gate Entry List", "New Gate Entry", "Search for gate entry", "Help on Search"]);
    const o = searchOptions("gate entry", ctx());
    expect(o.map((x) => x.index)).toEqual([370.05, 370.015, 100, -10]);
  });

  it("'gate entry list' (set_specifics): the list first", () => {
    expect(values("gate entry list")).toEqual(["Gate Entry List", "Search for gate entry list", "Help on Search"]);
    expect(values("Gate Entry List")).toEqual(["Gate Entry List", "Search for Gate Entry List", "Help on Search"]);
  });

  it("'new gate entry': the New entry ranks above the search", () => {
    const o = searchOptions("new gate entry", ctx());
    expect(o.map((x) => [x.value, x.index])).toEqual([["New Gate Entry", 371], ["Search for new gate entry", 100], ["Help on Search", -10]]);
    expect(o[0].href).toBe("/purchase/gate-entries/new");
  });

  it("'receipt' and 'purchase order'", () => {
    expect(values("receipt")).toEqual(["Purchase Receipt List", "New Purchase Receipt", "Search for receipt", "Help on Search"]);
    expect(values("purchase order")).toEqual(["Purchase Order List", "New Purchase Order", "Search for purchase order", "Help on Search"]);
  });

  it("'stock balance': the report", () => {
    const o = searchOptions("stock balance", ctx());
    expect(o[0]).toMatchObject({ value: "Report Stock Balance", index: 445, href: "/purchase/stock-balance" });
  });

  it("'cement in supplier': find in the Supplier list", () => {
    const o = searchOptions("cement in supplier", ctx());
    expect(o[0]).toMatchObject({ value: "Find cement in Supplier", index: 291, href: `/purchase/suppliers?${new URLSearchParams({ name: '["like","%cement%"]' })}` });
  });

  it("a sum is worked out; =… too", () => {
    expect(values("2+3*4")).toEqual(["Search for 2+3*4", "2+3*4 = 14", "Help on Search"]);
    expect(values("=2*5")).toEqual(["Search for =2*5", "2*5 = 10", "Help on Search"]);
    expect(evaluate("(55 + 434) / 4")).toBe(122.25);
    expect(evaluate("Math.sin(Math.PI/2)")).toBe(1);
    expect(evaluate("alert(1)")).toBeNull();
    // strict-mode eval: a leading zero is not a number (a document number is not a sum)
    expect(evaluate("03517")).toBeNull();
    expect(values("03517")).toEqual(["Search for 03517", "Help on Search"]);
    expect(evaluate("0.5*4")).toBe(2);
    expect(evaluate("2+")).toBeNull();
  });

  it("'random' offers a password", () => {
    expect(values("random")).toContain("Generate Random Password");
  });

  it("a document number goes to the global search", () => {
    expect(values("PUR-ORD/25-26/02558")).toEqual(["Search for PUR-ORD/25-26/02558", "Help on Search"]);
  });

  it("escapes what was typed", () => {
    const o = searchOptions("<img src=x> in supplier", ctx());
    expect(o.every((x) => !x.label.includes("<img"))).toBe(true);
  });

  it("nothing typed: the pages visited most, then help", () => {
    const list = { path: "/purchase/orders", kind: "List" as const, name: "Purchase Order" };
    const ge = { path: "/purchase/gate-entries", kind: "List" as const, name: "Gate Entry" };
    const c = ctx({ frequent: [{ page: list, count: 2612 }, { page: ge, count: 800 }] });
    expect(values("", c)).toEqual(["Purchase Order List", "Gate Entry List", "Help on Search"]);
    expect(values("g", c)).toEqual(["Purchase Order List", "Gate Entry List", "Help on Search"]);
  });

  it("on a list: find the text in that list", () => {
    const geList = searchScope(store).doctypes.find((d) => d.doctype === "Gate Entry")!;
    const o = searchOptions("03517", ctx({ currentList: geList }));
    expect(o.find((x) => x.type === "Current")).toMatchObject({ value: "Find 03517 in Gate Entry", index: 90, href: `/purchase/gate-entries?${new URLSearchParams({ name: '["like","%03517%"]' })}` });
  });

  it("a buyer (Purchase) sees no stock screens", () => {
    const buyer = { ...searchScope({ role: "PURCHASE" }), currentList: null, recent: [], frequent: [] };
    expect(values("gate entry", buyer)).toEqual(["Search for gate entry", "Help on Search"]);
    expect(values("purchase order", buyer)).toContain("New Purchase Order");
  });

  it("an approver may list but not create POs", () => {
    const approver = { ...searchScope({ role: "APPROVER" }), currentList: null, recent: [], frequent: [] };
    expect(values("purchase order", approver)).toEqual(["Purchase Order List", "Search for purchase order", "Help on Search"]);
  });

  it("one entry per page", () => {
    expect(deduplicate([{ label: "a", value: "a", index: 1, href: "/x" }, { label: "b", value: "b", index: 5, href: "/x" }])).toEqual([{ label: "b", value: "b", index: 5, href: "/x" }]);
  });
});

describe("visited pages", () => {
  const scope = searchScope(store);
  it("names lists, forms and reports", () => {
    expect(visitedPage("/purchase/gate-entries", "Gate Entry · Procurement ERP", scope)).toEqual({ path: "/purchase/gate-entries", kind: "List", name: "Gate Entry" });
    expect(visitedPage("/purchase/receipts/abc", "TMC ENGINEERING - PR/25-26/MM-03455 · Procurement ERP", scope)).toMatchObject({ kind: "Form", name: "Purchase Receipt", doc: "PR/25-26/MM-03455" });
    expect(visitedPage("/purchase/stock-ledger", null, scope)).toMatchObject({ kind: "Report", name: "Stock Ledger" });
    expect(visitedPage("/purchase/gate-entries/new", "New Gate Entry", scope)).toBeNull();
  });
});
