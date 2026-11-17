// Step 5: who may open the module, how figures are shown, and the list's filters.
import { describe, expect, it } from "vitest";
import { isPurchasePath, purchaseCan, purchaseTierOf, type PurchaseAction } from "@/lib/purchase/access";
import { formatCurrency, formatDate, formatDateTime, siteDayStart, timeAgoMini } from "@/lib/purchase/format";
import { DEFAULT_QUERY, allFilters, listQueryToParams, normaliseFilter, parseListQuery, quickToFilter } from "@/lib/purchase/orders/list";
import { buildOrderBy, buildWhere, filterWhere } from "@/lib/purchase/orders/list-where";

const INR = { symbol: "₹", fractionUnits: 100 };
const ci = { mode: "insensitive" };

describe("access", () => {
  it("lets the three standalone roles view, and nobody else", () => {
    expect(purchaseTierOf({ role: "APPROVER" })).toBe("APPROVER");
    expect(purchaseTierOf({ role: "STORE" })).toBeNull();
    expect(purchaseCan({ role: "PURCHASE" }, "view")).toBe(true);
    expect(purchaseCan(null, "view")).toBe(false);
    expect(purchaseCan({ role: "ADMIN" }, "constructor" as PurchaseAction)).toBe(false);
  });

  it("knows the module's own paths", () => {
    expect(isPurchasePath("/purchase/orders")).toBe(true);
    expect(isPurchasePath("/api/purchase/orders/export?x=1")).toBe(true);
    expect(isPurchasePath("/purchases")).toBe(false);
  });
});

describe("display formats (the old site's)", () => {
  it("shows money in groups of three, with 2 decimals unless the value has 3", () => {
    expect(formatCurrency("189125.680000000", INR)).toBe("₹ 189,125.68");
    expect(formatCurrency("112121.062000000", INR)).toBe("₹ 112,121.062");
    expect(formatCurrency("100905", INR)).toBe("₹ 100,905.00");
    expect(formatCurrency("14175.4", INR)).toBe("₹ 14,175.40");
    expect(formatCurrency("62308544.929", INR)).toBe("₹ 62,308,544.929");
    expect(formatCurrency(-1234.5, INR)).toBe("₹ -1,234.50");
    expect(formatCurrency(102600, { symbol: "$", fractionUnits: 100 })).toBe("$ 102,600.00");
  });

  it("shows dates as dd-mm-yyyy and moments in the site's time zone", () => {
    expect(formatDate(new Date("2026-11-13T00:00:00Z"))).toBe("13-11-2026");
    expect(formatDateTime(new Date("2026-11-16T04:34:03Z"))).toBe("16-11-2026 10:04:03");
    expect(siteDayStart("2026-11-16").toISOString()).toBe("2026-11-15T18:30:00.000Z");
  });

  it("says how long ago in ERPNext's short form", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const ago = (s: number) => timeAgoMini(new Date(now.getTime() - s * 1000), now);
    expect([ago(30), ago(300), ago(3 * 3600), ago(3 * 86400), ago(8 * 86400), ago(40 * 86400), ago(400 * 86400)]).toEqual([
      "now", "5 m", "3 h", "3 d", "1 w", "1 M", "1 y",
    ]);
  });
});

describe("the list's address-bar state", () => {
  it("reads quick filters, sort and paging, and drops what is not valid", () => {
    const q = parseListQuery(new URLSearchParams("name=02510&status=To%20Bill&company=&sort=name&order=asc&pageLength=100&limit=200"));
    expect(q.quick).toEqual({ name: "02510", status: "To Bill" });
    expect([q.sort, q.order, q.pageLength, q.limit]).toEqual(["name", "asc", 100, 200]);
    const bad = parseListQuery({ status: "Shipped", sort: "secret", order: "up", pageLength: "7", limit: "3", filters: "not json" });
    expect(bad).toEqual(DEFAULT_QUERY);
  });

  it("accepts builder conditions only with the operators their field allows", () => {
    expect(normaliseFilter("status", "like", "To%")).toBeNull();
    expect(normaliseFilter("transaction_date", "between", ["2024-11-01"])).toBeNull();
    expect(normaliseFilter("supplier", "in", "A, B,")).toEqual({ field: "supplier", op: "in", value: ["A", "B"] });
    expect(normaliseFilter("tax_category", "is", "maybe")).toBeNull();
    const q = parseListQuery({ filters: JSON.stringify([["workflow_state", "=", "Approved"], ["nope", "=", "x"], ["grand_total", ">", "1000"]]) });
    expect(q.filters).toEqual([{ field: "workflow_state", op: "=", value: "Approved" }, { field: "grand_total", op: ">", value: "1000" }]);
  });

  it("writes the state back without the defaults, and round-trips", () => {
    expect(listQueryToParams(DEFAULT_QUERY).toString()).toBe("");
    const q = parseListQuery({ supplier_name: "jeon", filters: JSON.stringify([["transaction_date", "between", ["2024-11-01", "2024-11-20"]]]), sort: "name" });
    expect(parseListQuery(listQueryToParams(q))).toEqual(q);
  });

  it("applies quick filters as ERPNext did: text anywhere, links exactly", () => {
    expect(quickToFilter("supplier_name", "jeon")).toEqual({ field: "supplier_name", op: "like", value: "%jeon%" });
    expect(quickToFilter("supplier", "A & A Silicates")).toEqual({ field: "supplier", op: "=", value: "A & A Silicates" });
    expect(allFilters(parseListQuery({ name: "025" })).length).toBe(1);
  });
});

describe("the list's conditions as a query", () => {
  it("matches text without regard to case, with % wildcards", () => {
    expect(filterWhere({ field: "supplier_name", op: "like", value: "%jeon%" })).toEqual({ supplierName: { contains: "jeon", ...ci } });
    expect(filterWhere({ field: "name", op: "like", value: "PUR-ORD/25-26/%" })).toEqual({ number: { startsWith: "PUR-ORD/25-26/", ...ci } });
    expect(filterWhere({ field: "supplier", op: "=", value: "X" })).toEqual({ supplier: { code: { equals: "X", ...ci } } });
  });

  it("lets 'not equals' and 'is not set' include empty links, as Frappe's ifnull did", () => {
    expect(filterWhere({ field: "tax_category", op: "is", value: "not set" })).toEqual({ taxCategory: { is: null } });
    expect(filterWhere({ field: "tax_category", op: "!=", value: "In-State" })).toEqual({
      OR: [{ taxCategory: { is: null } }, { OR: [{ taxCategory: { code: { equals: "" } } }, { NOT: { taxCategory: { code: { equals: "In-State", ...ci } } } }] }],
    });
  });

  it("maps selects to stored keys and dates to days", () => {
    expect(filterWhere({ field: "workflow_state", op: "=", value: "Approved" })).toEqual({ workflowState: { equals: "APPROVED" } });
    expect(filterWhere({ field: "transaction_date", op: "between", value: ["2024-11-20", "2024-11-01"] })).toEqual({
      transactionDate: { gte: new Date("2024-11-01T00:00:00Z"), lte: new Date("2024-11-20T00:00:00Z") },
    });
    // A day on a timestamp is that day in Asia/Kolkata.
    expect(filterWhere({ field: "creation", op: "=", value: "2026-11-07" })).toEqual({
      createdAt: { gte: new Date("2026-11-06T18:30:00Z"), lt: new Date("2026-11-07T18:30:00Z") },
    });
  });

  it("matches item-row fields on any row, and refuses unknown fields", () => {
    expect(filterWhere({ field: "item_code", op: "=", value: "N95 Mask" })).toEqual({ items: { some: { itemCode: { equals: "N95 Mask", ...ci } } } });
    expect(filterWhere({ field: "secret", op: "=", value: "x" })).toEqual({ id: { in: [] } });
    expect(buildWhere([])).toEqual({});
  });

  it("sorts with the ID as tie-breaker", () => {
    expect(buildOrderBy("modified", "desc")).toEqual([{ updatedAt: "desc" }, { number: "desc" }]);
    expect(buildOrderBy("name", "asc")).toEqual([{ number: "asc" }]);
  });
});
