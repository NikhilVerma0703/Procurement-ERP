import { describe, expect, it } from "vitest";
import { purchaseCan, PURCHASE_ACTIONS } from "@/lib/purchase/access";
import { MODULE_ACTION, navModulesFor } from "@/lib/purchase/nav";
import { PURCHASE_MODULES, PURCHASE_NAV, PURCHASE_PATHS } from "@/lib/purchase/routes";

// Phase II (owner, 21-11-2026): Buying is the main module over its nine sections; Stock › Masters &
// Reports is the storekeeper's. Althaf (PURCHASE) sees Buying, Thiru R (STORE) the whole ERP.
const modules = (role: string) => navModulesFor({ role }).map((m) => m.label);

describe("sidebar modules", () => {
  it("puts the nine Buying sections, in the old order, under Buying", () => {
    const buying = PURCHASE_MODULES.find((m) => m.key === "buying")!;
    expect(buying.label).toBe("Buying");
    expect(buying.groups.flatMap((g) => g.rows.map((r) => r.label))).toEqual([
      "Purchase Order", "Supplier", "Item", "Address", "Contact", "Purchase Taxes and Charges Template",
      "Payment Terms Template", "Payment Term", "Terms and Conditions",
    ]);
    expect(buying.groups[0].rows).toBe(PURCHASE_NAV);
  });

  it("names the Stock cards as the old site's Masters & Reports, in its order", () => {
    const stock = PURCHASE_MODULES.find((m) => m.key === "stock")!;
    expect(stock.groups.map((g) => g.label)).toEqual(["Items and Pricing", "Stock Transactions", "Stock Reports"]);
  });

  it("shows Althaf's role Buying only, and the storekeeper Buying and Stock", () => {
    expect(modules("PURCHASE")).toEqual(["Buying"]);
    expect(modules("APPROVER")).toEqual(["Buying"]);
    expect(modules("STORE")).toEqual(["Buying", "Stock"]);
    expect(modules("ADMIN")).toEqual(["Buying", "Stock"]);
    expect(modules("OPERATOR")).toEqual([]);
    expect(navModulesFor(null)).toEqual([]);
  });

  it("draws no empty card, and only known pages", () => {
    const known = new Set<string>(Object.values(PURCHASE_PATHS));
    for (const m of navModulesFor({ role: "ADMIN" })) {
      for (const g of m.groups) {
        expect(g.rows.length).toBeGreaterThan(0);
        for (const r of g.rows) expect(known.has(r.href)).toBe(true);
      }
    }
  });

  it("asks each module's own permission", () => {
    expect(MODULE_ACTION).toEqual({ buying: "view", stock: "stock" });
  });
});

describe("the storekeeper's access", () => {
  it("does on Buying what a buyer does — the PO screens are shared — but does not approve", () => {
    for (const action of PURCHASE_ACTIONS) {
      if (action === "stock") continue;
      expect(purchaseCan({ role: "STORE" }, action), action).toBe(purchaseCan({ role: "PURCHASE" }, action));
    }
    expect(purchaseCan({ role: "STORE" }, "approve")).toBe(false);
  });

  it("keeps the Stock module from buyers and approvers", () => {
    expect(purchaseCan({ role: "STORE" }, "stock")).toBe(true);
    expect(purchaseCan({ role: "ADMIN" }, "stock")).toBe(true);
    expect(purchaseCan({ role: "PURCHASE" }, "stock")).toBe(false);
    expect(purchaseCan({ role: "APPROVER" }, "stock")).toBe(false);
  });
});
