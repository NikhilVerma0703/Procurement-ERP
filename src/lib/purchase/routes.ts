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
  suppliers: "/purchase/suppliers",
  items: "/purchase/items",
  addresses: "/purchase/addresses",
  contacts: "/purchase/contacts",
  taxTemplates: "/purchase/tax-templates",
  paymentTermsTemplates: "/purchase/payment-terms-templates",
  paymentTerms: "/purchase/payment-terms",
  terms: "/purchase/terms",
  // Phase II: Stock › Stock Transactions and Stock Reports.
  receipts: "/purchase/receipts",
  stockLedger: "/purchase/stock-ledger",
  stockBalance: "/purchase/stock-balance",
  // Thiru R's Gate Entry (the add-on's DocType; owner, 23-11-2026).
  gateEntries: "/purchase/gate-entries",
  // The rest of Stock › Masters & Reports (owner, 24-11-2026: "make all these remainings"): the
  // screens drawn from the old site's own definitions (doc/screens.ts) …
  itemGroups: "/purchase/item-groups",
  productBundles: "/purchase/product-bundles",
  priceLists: "/purchase/price-lists",
  itemPrices: "/purchase/item-prices",
  shippingRules: "/purchase/shipping-rules",
  pricingRules: "/purchase/pricing-rules",
  itemAlternatives: "/purchase/item-alternatives",
  itemManufacturers: "/purchase/item-manufacturers",
  customsTariffNumbers: "/purchase/customs-tariff-numbers",
  materialRequests: "/purchase/material-requests",
  stockEntries: "/purchase/stock-entries",
  deliveryNotes: "/purchase/delivery-notes",
  pickLists: "/purchase/pick-lists",
  deliveryTrips: "/purchase/delivery-trips",
  // … and the five reports (stock/reports-more.ts).
  stockProjectedQty: "/purchase/stock-projected-qty",
  stockSummary: "/purchase/stock-summary",
  stockAgeing: "/purchase/stock-ageing",
  itemPriceStock: "/purchase/item-price-stock",
  warehouseWiseStockBalance: "/purchase/warehouse-wise-stock-balance",
} as const;

/** A record of a screen drawn from its definition (doc/screens.ts): `base` is its list's path. */
export const docRecordPath = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;
/** A new record there, with values to start from (Frappe's route options). */
export const docNewPath = (base: string, prefill: Record<string, string> = {}) => {
  const s = new URLSearchParams(prefill).toString();
  return `${base}/new${s ? `?${s}` : ""}`;
};

/** One Gate Entry's page. */
export const gateEntryPath = (id: string) => `${PURCHASE_PATHS.gateEntries}/${encodeURIComponent(id)}`;
/** A new Gate Entry; `amend` amends a cancelled one. */
export const gateEntryNewPath = (opts: { amend?: string } = {}) =>
  `${PURCHASE_PATHS.gateEntries}/new${opts.amend ? `?amend=${encodeURIComponent(opts.amend)}` : ""}`;
/** A Gate Entry's print view (the old "GATE ENTRY PRINT"). */
export const gateEntryPrintPath = (id: string) => `${gateEntryPath(id)}/print`;
/** A receipt made from a submitted Gate Entry (its Create › Purchase Receipt). */
export const receiptFromGateEntryPath = (gateEntryId: string) => `${PURCHASE_PATHS.receipts}/new?gate_entry=${encodeURIComponent(gateEntryId)}`;

/** One Purchase Order's page. */
export const orderPath = (id: string) => `${PURCHASE_PATHS.orders}/${encodeURIComponent(id)}`;

/** One Purchase Receipt's page (Phase II). */
export const receiptPath = (id: string) => `${PURCHASE_PATHS.receipts}/${encodeURIComponent(id)}`;
/** A new receipt: blank, or made from a submitted PO (its Create › Purchase Receipt). */
export const receiptNewPath = (fromOrder?: string) => `${PURCHASE_PATHS.receipts}/new${fromOrder ? `?purchase_order=${encodeURIComponent(fromOrder)}` : ""}`;

/** The masters: their lists, a record's page, and a new one's (with query parameters to prefill it). */
export type MasterKey = "suppliers" | "items" | "addresses" | "contacts" | "taxTemplates" | "paymentTermsTemplates" | "paymentTerms" | "terms";
export const masterPath = (m: MasterKey, id: string) => `${PURCHASE_PATHS[m]}/${encodeURIComponent(id)}`;
export const masterNewPath = (m: MasterKey, prefill: Record<string, string> = {}) => {
  const s = new URLSearchParams(prefill).toString();
  return `${PURCHASE_PATHS[m]}/new${s ? `?${s}` : ""}`;
};

/** The module's APIs. */
export const PURCHASE_API_PATHS = {
  ordersExport: "/api/purchase/orders/export",
  /** The list's selected rows, printed as one PDF (a form post: ids, format). */
  ordersPrint: "/api/purchase/orders/print",
  /** The PO form's link fields search here (Frappe's search_link). */
  lookup: "/api/purchase/lookup",
  /** The search box's "Search for …" (Frappe's global search). */
  search: "/api/purchase/search",
} as const;

/** A PO's print view (layout choice, PDF, Print). */
export const orderPrintPath = (id: string) => `${orderPath(id)}/print`;

/** A PO's sheet as a PDF, in a layout; `download` asks the browser to save it. */
export const orderPdfPath = (id: string, opts: { format?: string; download?: boolean } = {}) => {
  const q = new URLSearchParams();
  if (opts.format) q.set("format", opts.format);
  if (opts.download) q.set("download", "1");
  const s = q.toString();
  return `${PURCHASE_API_ROOT}/orders/${encodeURIComponent(id)}/pdf${s ? `?${s}` : ""}`;
};

/** A new PO; `from` duplicates a PO, `amend` amends a cancelled one. */
export const orderNewPath = (opts: { duplicate?: string; amend?: string } = {}) => {
  const q = new URLSearchParams();
  if (opts.duplicate) q.set("duplicate", opts.duplicate);
  if (opts.amend) q.set("amend", opts.amend);
  const s = q.toString();
  return s ? `${PURCHASE_PATHS.orderNew}?${s}` : PURCHASE_PATHS.orderNew;
};

/**
 * The sidebar rows. The original site reached the screens from Buying: Purchase Order, then the
 * masters a PO links to (Step 8), each row labelled as the page it opens.
 */
export const PURCHASE_NAV = [
  { href: PURCHASE_PATHS.orders, label: "Purchase Order" },
  { href: PURCHASE_PATHS.suppliers, label: "Supplier" },
  { href: PURCHASE_PATHS.items, label: "Item" },
  { href: PURCHASE_PATHS.addresses, label: "Address" },
  { href: PURCHASE_PATHS.contacts, label: "Contact" },
  { href: PURCHASE_PATHS.taxTemplates, label: "Purchase Taxes and Charges Template" },
  { href: PURCHASE_PATHS.paymentTermsTemplates, label: "Payment Terms Template" },
  { href: PURCHASE_PATHS.paymentTerms, label: "Payment Term" },
  { href: PURCHASE_PATHS.terms, label: "Terms and Conditions" },
] as const;

/** A sidebar row. */
export interface PurchaseNavRow {
  readonly href: string;
  readonly label: string;
}

/**
 * THE SIDEBAR'S MODULES (Phase II, owner 21-11-2026: "make Buying the main section"). As the old
 * site's workspaces: a module heading, then its cards in the old order — Buying's nine sections
 * (Althaf's), and Stock › Masters & Reports' three cards (Thiru R's; docs/12 §3), every link of
 * each card in the order the old Stock workspace listed them (captured 23-11-2026; all built since
 * 24-11-2026). Who sees a module is nav.ts. Item is in both, as on the old site: one screen, two
 * menus.
 */
export interface PurchaseNavModule {
  readonly key: "buying" | "stock";
  readonly label: string;
  readonly groups: readonly { readonly label: string | null; readonly rows: readonly PurchaseNavRow[] }[];
}

export const PURCHASE_MODULES: readonly PurchaseNavModule[] = [
  { key: "buying", label: "Buying", groups: [{ label: null, rows: PURCHASE_NAV }] },
  {
    key: "stock",
    label: "Stock",
    groups: [
      {
        label: "Items and Pricing",
        rows: [
          { href: PURCHASE_PATHS.items, label: "Item" },
          { href: PURCHASE_PATHS.itemGroups, label: "Item Group" },
          { href: PURCHASE_PATHS.productBundles, label: "Product Bundle" },
          { href: PURCHASE_PATHS.priceLists, label: "Price List" },
          { href: PURCHASE_PATHS.itemPrices, label: "Item Price" },
          { href: PURCHASE_PATHS.shippingRules, label: "Shipping Rule" },
          { href: PURCHASE_PATHS.pricingRules, label: "Pricing Rule" },
          { href: PURCHASE_PATHS.itemAlternatives, label: "Item Alternative" },
          { href: PURCHASE_PATHS.itemManufacturers, label: "Item Manufacturer" },
          { href: PURCHASE_PATHS.customsTariffNumbers, label: "Customs Tariff Number" },
        ],
      },
      // Gate Entry was the add-on's own DocType, reached by the search box ("Gate Entry List"); here it
      // stands next to the receipt it leads to (PO → Gate Entry → Purchase Receipt, docs/12 §4).
      {
        label: "Stock Transactions",
        rows: [
          { href: PURCHASE_PATHS.materialRequests, label: "Material Request" },
          { href: PURCHASE_PATHS.stockEntries, label: "Stock Entry" },
          { href: PURCHASE_PATHS.deliveryNotes, label: "Delivery Note" },
          { href: PURCHASE_PATHS.gateEntries, label: "Gate Entry" },
          { href: PURCHASE_PATHS.receipts, label: "Purchase Receipt" },
          { href: PURCHASE_PATHS.pickLists, label: "Pick List" },
          { href: PURCHASE_PATHS.deliveryTrips, label: "Delivery Trip" },
        ],
      },
      {
        label: "Stock Reports",
        rows: [
          { href: PURCHASE_PATHS.stockLedger, label: "Stock Ledger" },
          { href: PURCHASE_PATHS.stockBalance, label: "Stock Balance" },
          { href: PURCHASE_PATHS.stockProjectedQty, label: "Stock Projected Qty" },
          { href: PURCHASE_PATHS.stockSummary, label: "Stock Summary" },
          { href: PURCHASE_PATHS.stockAgeing, label: "Stock Ageing" },
          { href: PURCHASE_PATHS.itemPriceStock, label: "Item Price Stock" },
          { href: PURCHASE_PATHS.warehouseWiseStockBalance, label: "Warehouse Wise Stock Balance" },
        ],
      },
    ],
  },
];
