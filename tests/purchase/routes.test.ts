import { describe, expect, it } from "vitest";
import { PURCHASE_API_PATHS, PURCHASE_API_ROOT, PURCHASE_NAV, PURCHASE_PATHS, PURCHASE_ROOT, orderPath } from "@/lib/purchase/routes";

// The module's paths are the merge boundary: everything the Main ERP takes
// over must live under /purchase (pages) and /api/purchase (APIs).
describe("purchase routes", () => {
  it("keeps every page under the module root", () => {
    for (const path of Object.values(PURCHASE_PATHS)) {
      expect(path.startsWith(`${PURCHASE_ROOT}/`)).toBe(true);
    }
    expect(PURCHASE_API_ROOT).toBe(`/api${PURCHASE_ROOT}`);
    for (const path of Object.values(PURCHASE_API_PATHS)) {
      expect(path.startsWith(`${PURCHASE_API_ROOT}/`)).toBe(true);
    }
    expect(orderPath("po_x/1")).toBe("/purchase/orders/po_x%2F1");
  });

  it("builds the sidebar only from known module paths, once each", () => {
    const known = new Set<string>(Object.values(PURCHASE_PATHS));
    const hrefs = PURCHASE_NAV.map((row) => row.href);
    expect(hrefs.every((h) => known.has(h))).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("opens on the Purchase Order list, labelled as in the original", () => {
    expect(PURCHASE_NAV[0]).toEqual({ href: PURCHASE_PATHS.orders, label: "Purchase Order" });
  });
});
