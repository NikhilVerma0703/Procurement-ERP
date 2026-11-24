// The masters of Stock › Items and Pricing in their form (owner, 24-11-2026): what the browser's form
// and the server's save share — a new record's defaults (Frappe's set_default_values), the form
// scripts' toggles (captured from the old site, live-meta-20261121.json: item_group.js,
// shipping_rule.js, pricing_rule.js, product_bundle.js, item_price.js …), which fields may be typed,
// what each link searches (their set_query), and what choosing a link fetches (add_fetch, fetch_from).
// Pure.

import { siteToday } from "../format";
import { isTable, LAYOUT_TYPES, type DoctypeLayout, type LayoutField } from "./layout";
import { dependsOn } from "./depends-on";

type Doc = Record<string, unknown>;

const NO_VALUE = new Set([...LAYOUT_TYPES, "HTML", "Button", "Image", "Fold", "Heading"]);
const NUMERIC = new Set(["Check", "Int", "Float", "Currency", "Percent", "Rating"]);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

/** The company the old site defaulted every "company" field to (its only company). */
export const DEFAULT_COMPANY = "Pacific Engineered Surfaces Private Limited";

/** A field's default for a new record (get_default_value; a Select's first option). */
export function defaultOf(f: LayoutField): unknown {
  const d = f.default;
  if (d !== undefined && d !== null && d !== "") {
    if (d === "Today") return siteToday();
    if (NUMERIC.has(f.fieldtype)) return num(d);
    return d;
  }
  if (f.fieldtype === "Select" && f.options) return f.options.split("\n")[0];
  if (f.fieldname === "company" && f.fieldtype === "Link") return DEFAULT_COMPANY;
  return NUMERIC.has(f.fieldtype) ? 0 : undefined;
}

/** Frappe's row name: ten characters of [0-9a-z]. */
function rowName(): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");
}

/** A new child row with its defaults (a grid's Add Row). */
export function newChildRow(l: DoctypeLayout, idx: number): Doc {
  const row: Doc = { __islocal: 1, name: rowName(), idx, docstatus: 0 };
  for (const f of l.fields) {
    if (NO_VALUE.has(f.fieldtype) || isTable(f)) continue;
    const v = defaultOf(f);
    if (v !== undefined) row[f.fieldname] = v;
  }
  return row;
}

/** The form scripts' toggles for this record: mandatory on/off, fields locked, the form read only. */
export function formRules(doctype: string, doc: Doc, isNew: boolean) {
  const reqd = new Set<string>();
  const notReqd = new Set<string>();
  const locked = new Set<string>();
  const options: Record<string, string> = {};
  let readOnly = false;
  if (doctype === "Shipping Rule") {
    // toggle_reqd: a Fixed rule needs its amount, the others their conditions.
    (doc.calculate_based_on === "Fixed" ? reqd : notReqd).add("shipping_amount");
    (doc.calculate_based_on !== "Fixed" ? reqd : notReqd).add("conditions");
  }
  if (doctype === "Pricing Rule") {
    // toggle_reqd_apply_on, and set_options_for_applicable_for (by selling / buying).
    for (const [on, table] of [["Item Code", "items"], ["Item Group", "item_groups"], ["Brand", "brands"]] as const) (doc.apply_on === on ? reqd : notReqd).add(table);
    options.applicable_for = ["", ...(num(doc.selling) ? ["Customer", "Customer Group", "Territory", "Sales Partner", "Campaign"] : []), ...(num(doc.buying) ? ["Supplier", "Supplier Group"] : [])].join("\n");
  }
  // product_bundle.js: the parent item is chosen once.
  if (doctype === "Product Bundle" && !isNew) locked.add("new_item_code");
  // item_group.js set_root_readonly: "This is a root item group and cannot be edited."
  if (doctype === "Item Group" && !isNew && !str(doc.parent_item_group)) readOnly = true;
  return { reqd, notReqd, locked, options, readOnly };
}

/** The layout with the form script's toggles applied (mandatory marks, a Select's options). */
export function effectiveLayout(l: DoctypeLayout, doc: Doc, isNew: boolean): DoctypeLayout {
  const r = formRules(l.doctype, doc, isNew);
  if (!r.reqd.size && !r.notReqd.size && !Object.keys(r.options).length) return l;
  return {
    ...l,
    fields: l.fields.map((f) => {
      let g = f;
      if (r.reqd.has(f.fieldname)) g = { ...g, reqd: true };
      else if (r.notReqd.has(f.fieldname)) g = { ...g, reqd: false };
      if (r.options[f.fieldname] !== undefined) g = { ...g, options: r.options[f.fieldname] };
      return g;
    }),
  };
}

/** May the user set this field (not read only, not hidden, not made read only by a condition)? */
export function mayType(f: LayoutField, doc: Doc, parent?: Doc): boolean {
  if (NO_VALUE.has(f.fieldtype) || f.hidden || f.readOnly || f.fieldtype === "Read Only") return false;
  if (f.readOnlyDependsOn && dependsOn(f.readOnlyDependsOn, { doc, parent })) return false;
  return true;
}

/** The lookup (api/purchase/lookup) a Link to this DocType searches when no set_query narrows it. */
export const LINK_LOOKUP: Readonly<Record<string, string>> = {
  Item: "stdItem",
  "Item Group": "itemGroup",
  Warehouse: "warehouse",
  Company: "company",
  Customer: "customer",
  Supplier: "supplier",
  "Price List": "anyPriceList",
  Currency: "currency",
  UOM: "uom",
  Country: "country",
  "Supplier Group": "supplierGroup",
  "GST HSN Code": "hsnCode",
  "Item Tax Template": "itemTaxTemplate",
  "Tax Category": "taxCategory",
  "Cost Center": "costCenter",
  Account: "account",
  Batch: "batch",
  "Purchase Order": "purchaseOrder",
  "Stock Entry Type": "stockEntryType",
};

export interface LinkLookup {
  type: string;
  params?: Record<string, string | null>;
}

/** What a Link searches on this form (the form scripts' set_query, then the DocType's own search). */
export function lookupFor(doctype: string, table: string | null, f: LayoutField, doc: Doc, row?: Doc): LinkLookup | null {
  if (f.fieldtype !== "Link" || !f.options) return null;
  if (doctype === "Item Group" && table === null && f.fieldname === "parent_item_group") return { type: "parentItemGroup", params: { exclude: str(doc.item_group_name) || null } };
  if (doctype === "Item Price" && f.fieldname === "item_code") return { type: "stdItem", params: { variants: "0" } };
  if (doctype === "Item Price" && f.fieldname === "batch_no") return { type: "batch", params: { item: str(doc.item_code) || null } };
  if (doctype === "Item Alternative" && f.fieldname === "item_code") return { type: "alternativeItem" };
  if (doctype === "Product Bundle" && table === null && f.fieldname === "new_item_code") return { type: "bundleItem" };
  if (doctype === "Pricing Rule" && f.fieldname === "for_price_list") {
    return { type: "anyPriceList", params: { buying: num(doc.buying) ? "1" : null, selling: num(doc.selling) ? "1" : null, currency: str(doc.currency) || null } };
  }
  if (doctype === "Shipping Rule" && f.fieldname === "account") return { type: "account", params: { company: str(doc.company) || null } };
  const type = LINK_LOOKUP[f.options];
  if (!type) return null;
  const company = str((row ?? doc).company) || str(doc.company) || null;
  return type === "warehouse" || type === "costCenter" || type === "account" ? { type, params: { company } } : { type };
}

/** What choosing a link fills: fetch_from fields, and the form script's add_fetch (target ← source). */
export function fetchesFor(doctype: string, l: DoctypeLayout, linkField: string): { target: string; source: string }[] {
  const out = l.fields.filter((f) => f.fetchFrom?.startsWith(`${linkField}.`)).map((f) => ({ target: f.fieldname, source: f.fetchFrom!.slice(linkField.length + 1) }));
  if (doctype === "Item Price" && linkField === "price_list") out.push({ target: "buying", source: "buying" }, { target: "selling", source: "selling" }, { target: "currency", source: "currency" });
  if (doctype === "Item Price" && linkField === "item_code") out.push({ target: "item_name", source: "item_name" }, { target: "item_description", source: "description" }, { target: "uom", source: "stock_uom" });
  return out;
}

/** A Select's reaction in a form script (pricing_rule.js rate_or_discount, set_options_for_applicable_for). */
export function afterChange(doctype: string, doc: Doc, fieldname: string): Doc {
  if (doctype !== "Pricing Rule") return doc;
  const next = { ...doc };
  if (fieldname === "rate_or_discount" && next.rate_or_discount === "Rate") next.for_price_list = "";
  if (fieldname === "selling" || fieldname === "buying") {
    const allowed = formRules(doctype, next, false).options.applicable_for.split("\n");
    if (!allowed.includes(str(next.applicable_for))) next.applicable_for = "";
  }
  return next;
}

/** The custom buttons of the form (item_group.js, price_list.js): label and where it goes. */
export function formButtons(doctype: string, name: string | null, paths: { itemGroups: string; items: string; itemPrices: string }): { label: string; href: string }[] {
  if (doctype === "Item Group") {
    return [{ label: "Item Group Tree", href: paths.itemGroups }, ...(name ? [{ label: "Items", href: `${paths.items}?item_group=${encodeURIComponent(name)}` }] : [])];
  }
  if (doctype === "Price List" && name) return [{ label: "Add / Edit Prices", href: `${paths.itemPrices}?price_list=${encodeURIComponent(name)}` }];
  return [];
}
