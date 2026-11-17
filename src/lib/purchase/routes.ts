// Where the Purchase module lives.
//
// Every page is under /purchase and every API under /api/purchase — the shape
// the Main ERP gives a ported module (lib/pigment/routes.ts: /pigment and
// /api/pigment), so the merge moves these paths without renaming any. One
// list, so the sidebar, the pages' revalidatePath calls and the links between
// pages cannot disagree (tests/purchase/routes.test.ts holds the nav to it).
// Pure and import-free.

export const PURCHASE_ROOT = "/purchase";
export const PURCHASE_API_ROOT = "/api/purchase";

/** The module's paths. */
export const PURCHASE_PATHS = {
  orders: "/purchase/orders",
  orderNew: "/purchase/orders/new",
} as const;

/** One Purchase Order's page. */
export const orderPath = (id: string) => `${PURCHASE_PATHS.orders}/${encodeURIComponent(id)}`;

/** The module's APIs. */
export const PURCHASE_API_PATHS = {
  ordersExport: "/api/purchase/orders/export",
} as const;

/**
 * The sidebar rows. The original site reached the screen as Buying →
 * Purchase Order; the row and the page it opens carry the same label.
 * Masters the PO screen links to (Supplier, Item, …) join this list with
 * their screens (build plan Step 8).
 */
export const PURCHASE_NAV = [{ href: PURCHASE_PATHS.orders, label: "Purchase Order" }] as const;
