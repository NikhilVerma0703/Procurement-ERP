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

import type { DoctypeLayout } from "./layout";
import { LAYOUTS } from "./layouts";
import { PURCHASE_PATHS } from "../routes";

export type DocCard = "Items and Pricing" | "Stock Transactions";

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

export type DocScreenKey =
  | "itemGroups" | "productBundles" | "priceLists" | "itemPrices" | "shippingRules" | "pricingRules" | "itemAlternatives"
  | "itemManufacturers" | "customsTariffNumbers" | "materialRequests" | "stockEntries" | "deliveryNotes" | "pickLists" | "deliveryTrips"
  | "gateEntries";

export interface DocScreen {
  /** Its name in routes.ts, and its likes' kind (like-rules.ts). */
  key: DocScreenKey;
  doctype: string;
  /** The list's path (routes.ts). */
  path: string;
  card: DocCard;
  store: TableStore | GenericStore;
  /** The list's sort on the old site. */
  sort: { field: string; order: "asc" | "desc" };
  /** listview_settings.hide_name_column. */
  hideNameColumn?: boolean;
  editable: boolean;
  /** Records are entered by the screen's own form (Gate Entry's): its list offers Add and Delete. */
  ownForm?: boolean;
  /** A tree DocType: its menu link opened the tree view (frappe.utils.generate_route). */
  tree?: boolean;
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
export const GATE_ENTRY_SCREEN: DocScreen = {
  key: "gateEntries", doctype: "Gate Entry", path: PURCHASE_PATHS.gateEntries, card: "Stock Transactions",
  store: table("purchase_gate_entries", { items: { table: "purchase_gate_entry_items", fk: "gate_entry_id" } }),
  // Thiru R's list setting on the old site (21-11-2026): newest created first.
  sort: { field: "creation", order: "desc" }, editable: false, ownForm: true,
};

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
