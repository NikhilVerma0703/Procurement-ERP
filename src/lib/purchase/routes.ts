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
} as const;

/** One Purchase Order's page. */
export const orderPath = (id: string) => `${PURCHASE_PATHS.orders}/${encodeURIComponent(id)}`;

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
  /** The PO form's link fields search here (Frappe's search_link). */
  lookup: "/api/purchase/lookup",
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
