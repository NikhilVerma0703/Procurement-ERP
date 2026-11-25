// The Stock screens drawn from the old site's own DocType definitions (owner, 24-11-2026: "there are
// too many sections inside each: Items and Pricing, Stock Transactions, Stock Reports … make all
// these remainings"). One entry per screen: where its records are kept, the list's sort as Thiru R
// had it on the old site (his list settings, captured 21-11-2026; the DocType's own when he had
// none), and whether records are entered here.
//
// Entered here: the masters of Items and Pricing (Item Group — the storekeeper added one on
// 20-11-2026 —, Price List, Item Price, and the six the old site never used). Shown read-only: the
// transactions Material Request, Stock Entry, Delivery Note, Pick List and Delivery Trip — the first
// three stopped on the old site in 2024–2026 and the store may keep them in the Main ERP after the
// merge (docs/12 §8, decision 5); entering them waits for that answer.
// Pure.

import type { PurchaseAction } from "../access";
import type { DoctypeLayout } from "./layout";
import type { ListViewSettings } from "./list-view";
import { LAYOUTS } from "./layouts";
import { PURCHASE_PATHS, type MasterKey } from "../routes";

export type DocCard = "Items and Pricing" | "Stock Transactions" | "Buying";

/** A table of its own (purchase_*), each record's old row in `legacy`, its child rows in child tables. */
export interface TableStore {
  kind: "table";
  table: string;
  /** Child tables by the parent's table fieldname: the table and its parent key. */
  children: Readonly<Record<string, { table: string; fk: string }>>;
}

/** purchase_documents: the record and its child rows in one `legacy` JSON (DocTypes never used before). */
export interface GenericStore {
  kind: "generic";
}

/**
 * A master kept in typed columns (Step 8: saving one does not rewrite its old row): a query giving
 * each record's id and its old row overlaid with the current column values, under the old fieldnames.
 */
export interface OverlayStore {
  kind: "overlay";
  sql: string;
}

export type DocScreenKey =
  | "itemGroups" | "productBundles" | "priceLists" | "itemPrices" | "shippingRules" | "pricingRules" | "itemAlternatives"
  | "itemManufacturers" | "customsTariffNumbers" | "materialRequests" | "stockEntries" | "deliveryNotes" | "pickLists" | "deliveryTrips"
  | "gateEntries" | "receipts" | MasterKey;

export interface DocScreen {
  /** Its name in routes.ts, and its likes' kind (like-rules.ts). */
  key: DocScreenKey;
  doctype: string;
  /** The list's path (routes.ts). */
  path: string;
  card: DocCard;
  store: TableStore | GenericStore | OverlayStore;
  /** The list's sort on the old site. */
  sort: { field: string; order: "asc" | "desc" };
  /** listview_settings.hide_name_column. */
  hideNameColumn?: boolean;
  editable: boolean;
  /** Records are entered by the screen's own form (Gate Entry's): its list offers Add and Delete. */
  ownForm?: boolean;
  /** A tree DocType: its menu link opened the tree view (frappe.utils.generate_route). */
  tree?: boolean;
  /** Who may open the list (its page gate; "stock" when absent) and who may add or delete. */
  gate?: PurchaseAction;
  write?: PurchaseAction;
  /** "+ Add" opens the quick entry dialog (Frappe's quick entry), as on the old Supplier list. */
  quickEntry?: MasterKey;
  /** The DocType's List View Settings on the old site: its columns in order, and how many at most. */
  listSettings?: ListViewSettings;
  /** false: the list's Actions offer no Delete (its records are not deleted from the list here). */
  deletable?: boolean;
}

const table = (name: string, children: TableStore["children"] = {}): TableStore => ({ kind: "table", table: name, children });
const generic: GenericStore = { kind: "generic" };

export const DOC_SCREENS: readonly DocScreen[] = [
  { key: "itemGroups", doctype: "Item Group", path: PURCHASE_PATHS.itemGroups, card: "Items and Pricing", store: table("purchase_item_groups"), sort: { field: "modified", order: "desc" }, editable: true, tree: true },
  { key: "productBundles", doctype: "Product Bundle", path: PURCHASE_PATHS.productBundles, card: "Items and Pricing", store: generic, sort: { field: "modified", order: "asc" }, editable: true },
  { key: "priceLists", doctype: "Price List", path: PURCHASE_PATHS.priceLists, card: "Items and Pricing", store: table("purchase_price_lists"), sort: { field: "modified", order: "asc" }, editable: true },
  {
    key: "itemPrices", doctype: "Item Price", path: PURCHASE_PATHS.itemPrices, card: "Items and Pricing", store: table("purchase_item_prices"),
    sort: { field: "modified", order: "asc" }, hideNameColumn: true, editable: true,
  },
  { key: "shippingRules", doctype: "Shipping Rule", path: PURCHASE_PATHS.shippingRules, card: "Items and Pricing", store: generic, sort: { field: "modified", order: "asc" }, editable: true },
  { key: "pricingRules", doctype: "Pricing Rule", path: PURCHASE_PATHS.pricingRules, card: "Items and Pricing", store: generic, sort: { field: "modified", order: "desc" }, editable: true },
  { key: "itemAlternatives", doctype: "Item Alternative", path: PURCHASE_PATHS.itemAlternatives, card: "Items and Pricing", store: generic, sort: { field: "modified", order: "desc" }, editable: true },
  { key: "itemManufacturers", doctype: "Item Manufacturer", path: PURCHASE_PATHS.itemManufacturers, card: "Items and Pricing", store: generic, sort: { field: "modified", order: "asc" }, editable: true },
  { key: "customsTariffNumbers", doctype: "Customs Tariff Number", path: PURCHASE_PATHS.customsTariffNumbers, card: "Items and Pricing", store: generic, sort: { field: "modified", order: "desc" }, editable: true },
  {
    key: "materialRequests", doctype: "Material Request", path: PURCHASE_PATHS.materialRequests, card: "Stock Transactions",
    store: table("purchase_material_requests", { items: { table: "purchase_material_request_items", fk: "request_id" } }),
    sort: { field: "creation", order: "desc" }, editable: false,
  },
  {
    key: "stockEntries", doctype: "Stock Entry", path: PURCHASE_PATHS.stockEntries, card: "Stock Transactions",
    store: table("purchase_stock_entries", { items: { table: "purchase_stock_entry_details", fk: "entry_id" } }),
    sort: { field: "modified", order: "desc" }, editable: false,
  },
  {
    key: "deliveryNotes", doctype: "Delivery Note", path: PURCHASE_PATHS.deliveryNotes, card: "Stock Transactions",
    store: table("purchase_delivery_notes", {
      items: { table: "purchase_delivery_note_items", fk: "delivery_note_id" },
      taxes: { table: "purchase_delivery_note_taxes", fk: "delivery_note_id" },
      sales_team: { table: "purchase_delivery_note_sales_team", fk: "delivery_note_id" },
    }),
    sort: { field: "modified", order: "desc" }, editable: false,
  },
  { key: "pickLists", doctype: "Pick List", path: PURCHASE_PATHS.pickLists, card: "Stock Transactions", store: generic, sort: { field: "modified", order: "desc" }, editable: false },
  { key: "deliveryTrips", doctype: "Delivery Trip", path: PURCHASE_PATHS.deliveryTrips, card: "Stock Transactions", store: generic, sort: { field: "modified", order: "desc" }, editable: false },
];

/**
 * The Gate Entry List in the old list view (owner, 24-11-2026: "in original website it is looking
 * different … some extra columns and icons"): the add-on's DocType, listed like the others; its
 * records keep their own form, print and rules (stock/gate-entry-save.ts). Not in DOC_SCREENS: its
 * pages are its own (app/purchase/gate-entries).
 */
/**
 * Purchase Receipt's list (owner, 25-11-2026: "all these built sections should look like original
 * website"), as Thiru R had it: its List View Settings (Title, Status, Date, Grand Total, Gate Entry, at
 * most 10 columns, read from the old site that day) and his sort, Date newest first. The form is its own
 * (app/purchase/receipts/[id]); a draft is not deleted from the list (no receipt Delete here yet).
 */
export const RECEIPT_SCREEN: DocScreen = {
  key: "receipts", doctype: "Purchase Receipt", path: PURCHASE_PATHS.receipts, card: "Stock Transactions",
  store: table("purchase_receipts", { items: { table: "purchase_receipt_items", fk: "receipt_id" }, taxes: { table: "purchase_receipt_taxes", fk: "receipt_id" } }),
  sort: { field: "posting_date", order: "desc" }, editable: false, ownForm: true, deletable: false,
  listSettings: { fields: ["title", "status_field", "posting_date", "grand_total", "gate_entry"], totalFields: 10 },
};

export const GATE_ENTRY_SCREEN: DocScreen = {
  key: "gateEntries", doctype: "Gate Entry", path: PURCHASE_PATHS.gateEntries, card: "Stock Transactions",
  store: table("purchase_gate_entries", { items: { table: "purchase_gate_entry_items", fk: "gate_entry_id" } }),
  // Thiru R's list setting on the old site (21-11-2026): newest created first.
  sort: { field: "creation", order: "desc" }, editable: false, ownForm: true,
};

// ---------------------------------------------------------------------------------------------
// The Buying masters in the same list view (owner, 25-11-2026: "the Item section … should look
// exactly same as website. Similarly all these built sections"). Their records live in typed columns,
// so each list reads the old row overlaid with the current values (OverlayStore); their forms stay
// their own (app/purchase/<master>/[id], docs/09). Sorts as Thiru R had them on the old site (Item:
// Default Unit of Measure, ascending, as on the owner's screenshot of 25-11-2026).

/** A timestamp column as the old site wrote one ("2026-11-17 17:06:13.516000", Asia/Kolkata). */
const stamp = (col: string) => `to_char((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS.US')`;
const check = (col: string) => `CASE WHEN ${col} THEN '1' ELSE '0' END`;
const std = (t: string) =>
  `'name', ${t}.code, 'creation', ${stamp(`${t}.created_at`)}, 'modified', ${stamp(`${t}.updated_at`)}, 'owner', COALESCE(${t}.created_by, ${t}.legacy->>'owner'), 'modified_by', COALESCE(${t}.updated_by, ${t}.legacy->>'modified_by')`;
const overlay = (sql: string): OverlayStore => ({ kind: "overlay", sql });
const master = (key: MasterKey, doctype: string, sql: string, sort: DocScreen["sort"], extra: Partial<DocScreen> = {}): DocScreen => ({
  key, doctype, path: PURCHASE_PATHS[key], card: "Buying", store: overlay(sql), sort, editable: false, ownForm: true, gate: "view", write: "masters", ...extra,
});

export const MASTER_SCREENS: readonly DocScreen[] = [
  master("items", "Item", `
    SELECT i.id, COALESCE(i.legacy, '{}'::jsonb) || jsonb_build_object(${std("i")}, 'item_code', i.code, 'item_name', i.item_name,
      'item_group', g.code, 'stock_uom', i.stock_uom, 'description', i.description, 'brand', i.brand, 'disabled', ${check("i.disabled")},
      'is_stock_item', ${check("i.is_stock_item")}, 'has_variants', ${check("i.has_variants")}, 'variant_of', v.code,
      'end_of_life', to_char(i.end_of_life, 'YYYY-MM-DD'), 'gst_hsn_code', i.gst_hsn_code, 'standard_rate', i.standard_rate::text) AS legacy
    FROM purchase_items i LEFT JOIN purchase_item_groups g ON g.id = i.item_group_id LEFT JOIN purchase_items v ON v.id = i.variant_of_id`,
    { field: "stock_uom", order: "asc" }),
  master("suppliers", "Supplier", `
    SELECT s.id, COALESCE(s.legacy, '{}'::jsonb) || jsonb_build_object(${std("s")}, 'supplier_name', s.supplier_name, 'supplier_group', g.code,
      'supplier_type', s.supplier_type, 'gst_category', s.gst_category, 'gstin', s.gstin, 'country', s.country, 'disabled', ${check("s.disabled")},
      'on_hold', ${check("s.on_hold")}, 'mobile_no', s.mobile_no, 'email_id', s.email_id) AS legacy
    FROM purchase_suppliers s LEFT JOIN purchase_supplier_groups g ON g.id = s.supplier_group_id`,
    { field: "modified", order: "asc" }, { quickEntry: "suppliers" }),
  master("addresses", "Address", `
    SELECT a.id, COALESCE(a.legacy, '{}'::jsonb) || jsonb_build_object(${std("a")}, 'address_title', a.address_title, 'address_type', a.address_type,
      'address_line1', a.address_line1, 'city', a.city, 'state', a.state, 'country', a.country, 'pincode', a.pincode, 'gstin', a.gstin,
      'gst_category', a.gst_category, 'disabled', ${check("a.disabled")}) AS legacy
    FROM purchase_addresses a`,
    { field: "modified", order: "desc" }),
  master("contacts", "Contact", `
    SELECT c.id, COALESCE(c.legacy, '{}'::jsonb) || jsonb_build_object(${std("c")}, 'first_name', c.first_name, 'last_name', c.last_name,
      'email_id', c.email_id, 'phone', c.phone, 'mobile_no', c.mobile_no, 'status', c.status, 'company_name', c.company_name) AS legacy
    FROM purchase_contacts c`,
    { field: "modified", order: "asc" }),
  master("taxTemplates", "Purchase Taxes and Charges Template", `
    SELECT t.id, COALESCE(t.legacy, '{}'::jsonb) || jsonb_build_object(${std("t")}, 'title', t.title, 'is_default', ${check("t.is_default")},
      'disabled', ${check("t.disabled")}, 'company', co.code) AS legacy
    FROM purchase_tax_templates t LEFT JOIN purchase_companies co ON co.id = t.company_id`,
    { field: "modified", order: "desc" }),
  master("paymentTermsTemplates", "Payment Terms Template", `
    SELECT p.id, COALESCE(p.legacy, '{}'::jsonb) || jsonb_build_object(${std("p")}, 'template_name', p.code,
      'allocate_payment_based_on_payment_terms', ${check("p.allocate_payment_based_on_payment_terms")}) AS legacy
    FROM purchase_payment_terms_templates p`,
    { field: "modified", order: "desc" }),
  master("paymentTerms", "Payment Term", `
    SELECT p.id, COALESCE(p.legacy, '{}'::jsonb) || jsonb_build_object(${std("p")}, 'payment_term_name', p.code, 'invoice_portion', p.invoice_portion::text,
      'due_date_based_on', p.due_date_based_on, 'credit_days', p.credit_days::text, 'description', p.description) AS legacy
    FROM purchase_payment_terms p`,
    { field: "modified", order: "desc" }),
  master("terms", "Terms and Conditions", `
    SELECT t.id, jsonb_build_object('name', t.code, 'creation', ${stamp("t.created_at")}, 'modified', ${stamp("t.updated_at")}, 'owner', t.created_by,
      'modified_by', t.updated_by, 'title', t.title, 'terms', t.terms, 'disabled', ${check("t.disabled")}, 'buying', ${check("t.buying")},
      'selling', ${check("t.selling")}) AS legacy
    FROM purchase_terms_templates t`,
    { field: "modified", order: "asc" }),
];

export const masterScreen = (key: MasterKey): DocScreen => MASTER_SCREENS.find((s) => s.key === key)!;

/** The screen whose list is at this path segment ("material-requests"); undefined for any other. */
export function screenBySegment(segment: string): DocScreen | undefined {
  return DOC_SCREENS.find((s) => s.path === `/purchase/${segment}`);
}

export function screenOf(doctype: string): DocScreen | undefined {
  return DOC_SCREENS.find((s) => s.doctype === doctype);
}

/** The screen's captured form definition. */
export function layoutOf(s: DocScreen): DoctypeLayout {
  const l = LAYOUTS[s.doctype];
  if (!l) throw new Error(`No captured layout for ${s.doctype}`);
  return l;
}

/** The child-table layouts a screen's form needs, by child DocType. */
export function childLayoutsOf(s: DocScreen): Record<string, DoctypeLayout | undefined> {
  const out: Record<string, DoctypeLayout | undefined> = {};
  for (const f of layoutOf(s).fields) if ((f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect") && f.options) out[f.options] = LAYOUTS[f.options];
  return out;
}
