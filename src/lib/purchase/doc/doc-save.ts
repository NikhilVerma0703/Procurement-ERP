// Saving and deleting the masters of Stock › Items and Pricing (owner, 24-11-2026: "make all these
// remainings"): Item Group, Price List, Item Price, and the six the old site never used — Product
// Bundle, Shipping Rule, Pricing Rule, Item Alternative, Item Manufacturer, Customs Tariff Number.
//
// As CLAUDE.md asks: the form sends its document; the server checks it with the layout's schema,
// keeps only what the user may type (the stored record supplies the rest), fetches the linked values
// again, applies the DocType's own rules (ERPNext 14.92's validate / on_update / on_trash, below),
// Frappe's mandatory and link checks, names a new record as the DocType did, and writes it in one
// transaction — the record's old row in `legacy`, as the importer stores one. Edits of the DocTypes
// that tracked changes are recorded as Versions (the timeline), deletions as Deleted Documents.
// Server only.

import "server-only";
import { Prisma } from "@prisma/client";
import { flt } from "../calc/pymath";
import { COUNTRIES } from "../countries";
import { fieldErrorsOf, type ActionResult } from "../orders/form-schema";
import { versionDiff } from "../orders/version";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import { seriesKey } from "../stock/receipt-meta";
import { isTable, LAYOUT_TYPES, type DoctypeLayout } from "./layout";
import { linkExists, linkedRow } from "./links";
import { childLayoutsOf, layoutOf, type DocScreen } from "./screens";
import { LAYOUTS } from "./layouts";
import { defaultOf, effectiveLayout, formRules, mayType, newChildRow } from "./master-form";
import { docSchema, docSnapshot, legacyRow, missingFields, newRowName, siteDateTime, type Doc } from "./store";
import { typedDoc } from "./values";

type Tx = Prisma.TransactionClient;

class UserError extends Error {
  constructor(message: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}
const refuse = (message: string, field?: string): never => {
  throw new UserError(message, field ? { [field]: message } : undefined);
};

const NO_VALUE = new Set([...LAYOUT_TYPES, "HTML", "Button", "Image", "Fold", "Heading"]);
const NUMERIC = new Set(["Check", "Int", "Float", "Currency", "Percent", "Rating"]);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const rowsOf = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);

/** The DocTypes whose edits the old site kept as Versions (track_changes, captured 21-11-2026). */
const TRACK_CHANGES = new Set(["Item Price", "Item Alternative", "Item Manufacturer", "Customs Tariff Number"]);

// ---------------------------------------------------------------------------------------------
// A new document: Frappe's set_default_values (a field's default, "Today", the first option of a
// Select, the user's default company), then the form script's own onload.

export function newDoc(s: DocScreen, prefill: Record<string, string> = {}): Doc {
  const l = layoutOf(s);
  const doc: Doc = { __islocal: 1, docstatus: 0 };
  for (const f of l.fields) {
    if (NO_VALUE.has(f.fieldtype)) continue;
    if (isTable(f)) {
      doc[f.fieldname] = [];
      continue;
    }
    const v = defaultOf(f);
    if (v !== undefined) doc[f.fieldname] = v;
  }
  // Values the page was opened with (Frappe's route options: "Items" of an Item Group, a filter).
  for (const [k, v] of Object.entries(prefill)) {
    const f = l.fields.find((x) => x.fieldname === k);
    if (f && !NO_VALUE.has(f.fieldtype) && !isTable(f)) doc[k] = NUMERIC.has(f.fieldtype) ? num(v) : v;
  }
  // Pricing Rule's onload: a customer or supplier given makes it "Applicable For" that, selling or buying.
  if (s.doctype === "Pricing Rule" && !doc.applicable_for && (doc.customer || doc.supplier)) {
    if (doc.customer) Object.assign(doc, { applicable_for: "Customer", selling: 1 });
    else Object.assign(doc, { applicable_for: "Supplier", buying: 1 });
  }
  if (s.doctype === "Item Group" && !doc.parent_item_group) doc.parent_item_group = "All Item Groups";
  return doc;
}

// ---------------------------------------------------------------------------------------------
// What the user may type. The rest comes from the stored record, or the new record's defaults.

function mergeDoc(s: DocScreen, base: Doc, incoming: Doc, isNew: boolean): Doc {
  const l = layoutOf(s);
  const children = childLayoutsOf(s);
  const rules = formRules(s.doctype, base, isNew);
  const out: Doc = { ...base };
  if (rules.readOnly) return out;
  for (const f of l.fields) {
    if (isTable(f)) {
      const child = children[f.options ?? ""];
      if (!child) continue;
      const before = new Map(rowsOf(base[f.fieldname]).map((r) => [str(r.name), r]));
      out[f.fieldname] = rowsOf(incoming[f.fieldname]).map((r, i) => {
        const prev = before.get(str(r.name)) ?? newChildRow(child, i + 1);
        const row: Doc = { ...prev, name: str(prev.name) || newRowName(), idx: i + 1 };
        for (const c of child.fields) if (mayType(c, row, out) && c.fieldname in r) row[c.fieldname] = r[c.fieldname];
        return row;
      });
      continue;
    }
    if (rules.locked.has(f.fieldname)) continue;
    // The field a "field:" name came from is set once (the saved form hides it; renaming is not offered).
    if (!isNew && l.autoname?.startsWith("field:") && f.fieldname === l.autoname.slice(6)) continue;
    if (mayType(f, out) && f.fieldname in incoming) out[f.fieldname] = incoming[f.fieldname];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fetches (fetch_from), and Frappe's link check.

async function applyFetches(tx: Tx, l: DoctypeLayout, doc: Doc, children: Record<string, DoctypeLayout | undefined>): Promise<void> {
  const fill = async (layout: DoctypeLayout, row: Doc) => {
    for (const f of layout.fields) {
      if (!f.fetchFrom) continue;
      const [linkField, source] = f.fetchFrom.split(".");
      const link = layout.fields.find((x) => x.fieldname === linkField);
      if (!link || link.fieldtype !== "Link" || !link.options) continue;
      const value = str(row[linkField]);
      if (!value) {
        row[f.fieldname] = NUMERIC.has(f.fieldtype) ? 0 : "";
        continue;
      }
      const linked = await linkedRow(tx, link.options, value);
      if (linked && source in linked) row[f.fieldname] = NUMERIC.has(f.fieldtype) ? num(linked[source]) : linked[source] ?? "";
    }
  };
  await fill(l, doc);
  for (const f of l.fields) {
    const child = isTable(f) ? children[f.options ?? ""] : undefined;
    if (child) for (const r of rowsOf(doc[f.fieldname])) await fill(child, r);
  }
}

async function validateLinks(tx: Tx, l: DoctypeLayout, doc: Doc, children: Record<string, DoctypeLayout | undefined>): Promise<void> {
  const missing: string[] = [];
  const errors: Record<string, string> = {};
  const check = async (layout: DoctypeLayout, row: Doc, prefix: string, key: (f: string) => string) => {
    for (const f of layout.fields) {
      if (f.fieldtype !== "Link" || !f.options || f.hidden) continue;
      const v = str(row[f.fieldname]);
      if (!v) continue;
      const found = await linkExists(tx, f.options, v);
      if (found === false) {
        const what = `${prefix}${f.label ?? f.fieldname}: ${v}`;
        missing.push(what);
        errors[key(f.fieldname)] = `Could not find ${f.label ?? f.fieldname}: ${v}`;
      }
    }
  };
  await check(l, doc, "", (f) => f);
  for (const f of l.fields) {
    const child = isTable(f) ? children[f.options ?? ""] : undefined;
    if (child) {
      const rows = rowsOf(doc[f.fieldname]);
      for (let i = 0; i < rows.length; i++) await check(child, rows[i], `Row #${i + 1}: `, (c) => `${f.fieldname}.${i}.${c}`);
    }
  }
  if (missing.length) throw new UserError(`Could not find ${missing.join(", ")}`, errors);
}

// ---------------------------------------------------------------------------------------------
// Each DocType's own rules (ERPNext 14.92: <doctype>.py validate, and what its on_update did).

type Rule = (tx: Tx, doc: Doc, ctx: { isNew: boolean; name: string | null }) => Promise<void>;

const APPLY_ON_TABLE: Record<string, string> = { "Item Code": "items", "Item Group": "item_groups", Brand: "brands" };
const OTHER_FIELDS = ["other_item_code", "other_item_group", "other_brand"];
const scrub = (s: string) => s.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");

const RULES: Record<string, Rule> = {
  // item_group.py: the parent defaults to All Item Groups; a name an item has is refused; NestedSet:
  // a group with children stays a group, one root only; old_parent follows the parent.
  "Item Group": async (tx, doc, { isNew, name }) => {
    if (!str(doc.parent_item_group)) {
      const root = await tx.purchaseItemGroup.findUnique({ where: { code: "All Item Groups" }, select: { code: true } });
      if (root && (isNew || name !== "All Item Groups")) doc.parent_item_group = "All Item Groups";
    }
    const self = isNew ? str(doc.item_group_name) : name;
    if (self && str(doc.parent_item_group) === self) refuse("Item cannot be added to its own descendants", "parent_item_group");
    if (str(doc.parent_item_group)) {
      const parent = await tx.purchaseItemGroup.findUnique({ where: { code: str(doc.parent_item_group) }, select: { isGroup: true, parentCode: true } });
      if (parent && !parent.isGroup) refuse(`Parent Item Group ${str(doc.parent_item_group)} is not a group (its "Is Group" is off)`, "parent_item_group");
      // validate_loop: the parent may not be one of its own descendants.
      if (!isNew && self) {
        let at = str(doc.parent_item_group);
        for (let hops = 0; at && hops < 100; hops++) {
          if (at === self) refuse("Item cannot be added to its own descendants", "parent_item_group");
          at = (await tx.purchaseItemGroup.findUnique({ where: { code: at }, select: { parentCode: true } }))?.parentCode ?? "";
        }
      }
    }
    if (!isNew && self && !num(doc.is_group)) {
      const child = await tx.purchaseItemGroup.findFirst({ where: { parentCode: self }, select: { code: true } });
      if (child) refuse(`Item Group ${self} cannot be a leaf node as it has children`, "is_group");
    }
    if (self && (await tx.purchaseItem.findUnique({ where: { code: self }, select: { id: true } }))) {
      refuse(`An item exists with same name (${self}), please change the item group name or rename the item`, "item_group_name");
    }
    doc.old_parent = str(doc.parent_item_group);
  },

  // price_list.py: "Price List must be applicable for Buying or Selling".
  "Price List": async (_tx, doc) => {
    if (!num(doc.buying) && !num(doc.selling)) refuse("Price List must be applicable for Buying or Selling");
  },

  // item_price.py.
  "Item Price": async (tx, doc, { name }) => {
    const item = await linkedRow(tx, "Item", str(doc.item_code));
    if (!item) refuse(`Item ${str(doc.item_code)} not found.`, "item_code");
    if (doc.valid_from && doc.valid_upto && str(doc.valid_from) > str(doc.valid_upto)) refuse("Valid From Date must be lesser than Valid Up To Date.", "valid_upto");
    // update_price_list_details: the price list must be enabled; its buying, selling and currency.
    const pl = await tx.purchasePriceList.findUnique({ where: { code: str(doc.price_list) }, select: { enabled: true, buying: true, selling: true, currency: true } });
    if (!pl || !pl.enabled) refuse(`The price list ${str(doc.price_list)} does not exist or is disabled`, "price_list");
    Object.assign(doc, { buying: pl!.buying ? 1 : 0, selling: pl!.selling ? 1 : 0, currency: pl!.currency });
    // update_item_details.
    doc.item_name = item!.item_name ?? "";
    doc.item_description = item!.description ?? "";
    // check_duplicates: the same item, price list, UOM, dates, packing unit, customer, supplier and batch.
    const same = (f: string) => {
      const v = doc[f];
      const empty = v === null || v === undefined || v === "" || v === 0;
      return empty
        ? Prisma.sql`COALESCE(NULLIF(NULLIF(legacy->>${f}, ''), '0'), '') = ''`
        : Prisma.sql`legacy->>${f} = ${f === "packing_unit" ? String(Math.trunc(num(v))) : str(v)}`;
    };
    const dup = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM purchase_item_prices
      WHERE item_code = ${str(doc.item_code)} AND price_list_code = ${str(doc.price_list)} AND erpnext_name <> ${name ?? ""}
        AND ${same("uom")} AND ${same("valid_from")} AND ${same("valid_upto")} AND ${same("packing_unit")}
        AND ${same("customer")} AND ${same("supplier")} AND ${same("batch_no")}
      LIMIT 1`;
    if (dup.length) refuse("Item Price appears multiple times based on Price List, Supplier/Customer, Currency, Item, Batch, UOM, Qty, and Dates.");
    if (num(item!.has_variants)) refuse(`Item Price cannot be created for the template item ${str(doc.item_code)}`, "item_code");
    // before_save: the reference is the customer (selling) or supplier (buying).
    if (num(doc.selling)) doc.reference = doc.customer ?? "";
    if (num(doc.buying)) doc.reference = doc.supplier ?? "";
    if (num(doc.selling) && num(doc.buying)) doc.reference = str(doc.customer) || str(doc.supplier);
  },

  // product_bundle.py.
  "Product Bundle": async (tx, doc, { isNew }) => {
    const parent = await linkedRow(tx, "Item", str(doc.new_item_code));
    if (parent && num(parent.is_stock_item)) refuse(`Parent Item ${str(doc.new_item_code)} must not be a Stock Item`, "new_item_code");
    for (const r of rowsOf(doc.items)) {
      const bundled = await tx.purchaseDocument.findUnique({ where: { doctype_erpnextName: { doctype: "Product Bundle", erpnextName: str(r.item_code) } }, select: { id: true } });
      if (bundled) refuse(`Row #${num(r.idx)}: Child Item should not be a Product Bundle. Please remove Item ${str(r.item_code)} and Save`);
    }
    if (isNew) {
      const taken = await tx.purchaseDocument.findUnique({ where: { doctype_erpnextName: { doctype: "Product Bundle", erpnextName: str(doc.new_item_code) } }, select: { id: true } });
      if (taken) refuse(`Product Bundle ${str(doc.new_item_code)} already exists`, "new_item_code");
    }
  },

  // shipping_rule.py: from < to, one open-ended row, rows sorted by From Value, no overlaps.
  "Shipping Rule": async (_tx, doc) => {
    const rows = rowsOf(doc.conditions);
    let open = 0;
    for (const d of rows) {
      d.from_value = flt(num(d.from_value), 3);
      d.to_value = flt(num(d.to_value), 3);
      if (num(d.from_value) < 0) refuse(`Row #${num(d.idx)}: From Value cannot be less than 0`);
      if (num(d.to_value) < 0) refuse(`Row #${num(d.idx)}: To Value cannot be less than 0`);
      if (!num(d.to_value)) open += 1;
      else if (num(d.from_value) >= num(d.to_value)) refuse(`From value must be less than to value in row ${num(d.idx)}`);
    }
    if (open >= 2) refuse('There can only be one Shipping Rule Condition with 0 or blank value for "To Value"');
    rows.sort((a, b) => num(a.from_value) - num(b.from_value)).forEach((d, i) => (d.idx = i + 1));
    doc.conditions = rows;
    const overlaps: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const [x1, x2] = [num(rows[i].from_value), num(rows[i].to_value) || num(rows[i].from_value)];
        const [y1, y2] = [num(rows[j].from_value), num(rows[j].to_value) || num(rows[j].from_value)];
        const separate = (x1 <= x2 && x2 <= y1 && y1 <= y2) || (y1 <= y2 && y2 <= x1 && x1 <= x2);
        if (!separate) overlaps.push(`${x1}-${num(rows[i].to_value)} = ${num(rows[i].shipping_amount)} and ${y1}-${num(rows[j].to_value)} = ${num(rows[j].shipping_amount)}`);
      }
    }
    if (overlaps.length) refuse(`Overlapping conditions found between: ${overlaps.join("; ")}`);
  },

  // pricing_rule.py validate.
  "Pricing Rule": async (tx, doc) => {
    // validate_mandatory
    const table = APPLY_ON_TABLE[str(doc.apply_on)];
    if (table && rowsOf(doc[table]).length < 1) refuse(`${str(doc.apply_on)} is not added in the table`, table);
    const tocheck = scrub(str(doc.applicable_for));
    if (tocheck && !str(doc[tocheck])) refuse(`${str(doc.applicable_for)} is required`, tocheck);
    if (doc.apply_rule_on_other) {
      const o = `other_${scrub(str(doc.apply_rule_on_other))}`;
      if (OTHER_FIELDS.includes(o) && !str(doc[o])) refuse(`For the 'Apply Rule On Other' condition the field ${str(doc.apply_rule_on_other)} is mandatory`, o);
    }
    if (doc.price_or_product_discount === "Price" && !str(doc.rate_or_discount)) refuse("Rate or Discount is required for the price discount.", "rate_or_discount");
    if (num(doc.apply_discount_on_rate)) {
      if (!str(doc.priority)) refuse("As the field Apply Discount on Discounted Rate is enabled, the field Priority is mandatory.", "priority");
      if (num(doc.priority) === 1) refuse("As the field Apply Discount on Discounted Rate is enabled, the value of the field Priority should be more than 1.", "priority");
    }
    // validate_duplicate_apply_on
    if (table && doc.apply_on !== "Transaction") {
      const field = scrub(str(doc.apply_on));
      const values = rowsOf(doc[table]).map((r) => str(r[field])).filter(Boolean);
      if (values.length !== new Set(values).size) refuse(`Duplicate ${str(doc.apply_on)} found in the table`);
    }
    // validate_applicable_for_selling_or_buying
    if (!num(doc.selling) && !num(doc.buying)) refuse("Atleast one of the Selling or Buying must be selected");
    if (!num(doc.selling) && ["Customer", "Customer Group", "Territory", "Sales Partner", "Campaign"].includes(str(doc.applicable_for))) {
      refuse(`Selling must be checked, if Applicable For is selected as ${str(doc.applicable_for)}`, "selling");
    }
    if (!num(doc.buying) && ["Supplier", "Supplier Group"].includes(str(doc.applicable_for))) refuse(`Buying must be checked, if Applicable For is selected as ${str(doc.applicable_for)}`, "buying");
    // validate_min_max_amt / qty
    if (num(doc.min_amt) && num(doc.max_amt) && num(doc.min_amt) > num(doc.max_amt)) refuse("Min Amt can not be greater than Max Amt", "max_amt");
    if (num(doc.min_qty) && num(doc.max_qty) && num(doc.min_qty) > num(doc.max_qty)) refuse("Min Qty can not be greater than Max Qty", "max_qty");
    // cleanup_fields_value: only the chosen option's values are kept.
    const options: Record<string, string[]> = {
      apply_on: ["Item Code", "Item Group", "Brand", "Transaction"],
      applicable_for: ["Customer", "Customer Group", "Territory", "Sales Partner", "Campaign", "Supplier", "Supplier Group"],
      rate_or_discount: ["Rate", "Discount Percentage", "Discount Amount"],
    };
    const pr = LAYOUTS["Pricing Rule"];
    for (const [logic, list] of Object.entries(options)) {
      const chosen = scrub(str(doc[logic]));
      for (const o of list) {
        const field = logic === "apply_on" ? APPLY_ON_TABLE[o] ?? scrub(o) : scrub(o);
        const f = pr.fields.find((x) => x.fieldname === field);
        if (!f || scrub(o) === chosen) continue;
        doc[field] = isTable(f) ? [] : NUMERIC.has(f.fieldtype) ? 0 : "";
      }
    }
    if (num(doc.mixed_conditions) && num(doc.same_item)) doc.same_item = 0;
    const keep = doc.apply_rule_on_other ? `other_${scrub(str(doc.apply_rule_on_other))}` : null;
    for (const o of OTHER_FIELDS) if (o !== keep) doc[o] = "";
    // validate_rate_or_discount
    if (num(doc.rate) < 0) refuse("Rate can not be negative", "rate");
    if (doc.price_or_product_discount === "Product" && !str(doc.free_item)) {
      if (num(doc.mixed_conditions)) refuse("Free item code is not selected", "free_item");
      doc.same_item = 1;
    }
    // validate_max_discount
    if (doc.rate_or_discount === "Discount Percentage") {
      for (const r of rowsOf(doc.items)) {
        const it = await linkedRow(tx, "Item", str(r.item_code));
        const max = num(it?.max_discount);
        if (max && num(doc.discount_percentage) > max) refuse(`Max discount allowed for item: ${str(r.item_code)} is ${max}%`, "discount_percentage");
      }
    }
    // validate_price_list_with_currency
    if (str(doc.currency) && str(doc.for_price_list)) {
      const pl = await tx.purchasePriceList.findUnique({ where: { code: str(doc.for_price_list) }, select: { currency: true } });
      if (pl && pl.currency !== str(doc.currency)) refuse(`Currency should be same as Price List Currency: ${pl.currency}`, "currency");
    }
    // validate_dates
    if (num(doc.is_cumulative) && !(doc.valid_from && doc.valid_upto)) refuse("Valid from and valid upto fields are mandatory for the cumulative");
    if (doc.valid_from && doc.valid_upto && str(doc.valid_from) > str(doc.valid_upto)) refuse("Valid from date must be less than valid upto date", "valid_upto");
    // validate_condition
    const cond = str(doc.condition);
    if (cond && cond.includes("=") && /^[\w.:_]+\s*={1}\s*[\w.@'"]+/.test(cond)) refuse("Invalid condition expression", "condition");
    if (!str(doc.margin_type)) doc.margin_rate_or_amount = 0;
  },

  // item_alternative.py.
  "Item Alternative": async (tx, doc, { name }) => {
    const item = await linkedRow(tx, "Item", str(doc.item_code));
    if (str(doc.item_code) && !num(item?.allow_alternative_item)) refuse(`Not allow to set alternative item for the item ${str(doc.item_code)}`, "item_code");
    if (str(doc.item_code) === str(doc.alternative_item_code)) refuse("Alternative item must not be same as item code", "alternative_item_code");
    const alt = await linkedRow(tx, "Item", str(doc.alternative_item_code));
    if (item && alt && num(item.is_stock_item) !== num(alt.is_stock_item)) {
      refuse(`The value of Maintain Stock differs between Items ${str(doc.alternative_item_code)} and ${str(doc.item_code)}`);
    }
    if (num(doc.two_way) && !num(alt?.allow_alternative_item)) refuse(`Allow Alternative Item must be checked on Item ${str(doc.alternative_item_code)}`);
    const dup = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM purchase_documents WHERE doctype = 'Item Alternative' AND erpnext_name <> ${name ?? ""}
        AND legacy->>'item_code' = ${str(doc.item_code)} AND legacy->>'alternative_item_code' = ${str(doc.alternative_item_code)} LIMIT 1`;
    if (dup.length) refuse(`Already record exists for the item ${str(doc.item_code)}`);
  },

  // item_manufacturer.py: no duplicate on a new one.
  "Item Manufacturer": async (tx, doc, { isNew }) => {
    if (!isNew) return;
    const part = str(doc.manufacturer_part_no);
    const dup = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM purchase_documents WHERE doctype = 'Item Manufacturer'
        AND legacy->>'item_code' = ${str(doc.item_code)} AND legacy->>'manufacturer' = ${str(doc.manufacturer)}
        ${part ? Prisma.sql`AND legacy->>'manufacturer_part_no' = ${part}` : Prisma.empty} LIMIT 1`;
    if (dup.length) refuse(`Duplicate entry against the item code ${str(doc.item_code)} and manufacturer ${str(doc.manufacturer)}`);
  },
};

// ---------------------------------------------------------------------------------------------
// Names.

const SPECIAL = /[<>]/;

async function nextInSeries(tx: Tx, series: string): Promise<string> {
  const { prefix, digits } = seriesKey(series, new Date());
  const rows = await tx.$queryRaw<{ current: number }[]>`
    INSERT INTO purchase_naming_series (prefix, current) VALUES (${prefix}, 1)
    ON CONFLICT (prefix) DO UPDATE SET current = purchase_naming_series.current + 1
    RETURNING current`;
  return `${prefix}${String(rows[0].current).padStart(digits, "0")}`;
}

/** A new record's name, as the DocType's naming rule made it. */
async function nameOf(tx: Tx, s: DocScreen, doc: Doc): Promise<string> {
  const l = layoutOf(s);
  let name = "";
  if (s.doctype === "Product Bundle") name = str(doc.new_item_code);
  else if (l.autoname?.startsWith("field:")) name = str(doc[l.autoname.slice(6)]);
  else if (l.autoname === "naming_series:") name = await nextInSeries(tx, str(doc.naming_series) || (l.fields.find((f) => f.fieldname === "naming_series")?.options ?? "").split("\n")[0]);
  else name = newRowName();
  if (!name) refuse(`No Name Specified for ${s.doctype}`);
  if (SPECIAL.test(name)) refuse("Name cannot contain special characters like '<', '>'");
  return name;
}

// ---------------------------------------------------------------------------------------------
// The stored record.

interface Stored {
  id: string;
  name: string;
  legacy: Doc;
  doc: Doc;
}

async function loadStored(tx: Tx, s: DocScreen, id: string): Promise<Stored | null> {
  const l = layoutOf(s);
  const rows =
    s.store.kind === "table"
      ? await tx.$queryRaw<{ id: string; legacy: Doc | null }[]>`SELECT id, legacy FROM ${Prisma.raw(`"${s.store.table}"`)} WHERE id = ${id} FOR UPDATE`
      : await tx.$queryRaw<{ id: string; legacy: Doc | null }[]>`SELECT id, legacy FROM purchase_documents WHERE id = ${id} AND doctype = ${s.doctype} FOR UPDATE`;
  const r = rows[0];
  if (!r) return null;
  const legacy = r.legacy ?? {};
  const doc = typedDoc(l, legacy);
  const children = childLayoutsOf(s);
  for (const f of l.fields) {
    if (!isTable(f)) continue;
    const child = children[f.options ?? ""];
    doc[f.fieldname] = rowsOf(legacy[f.fieldname]).map((row) => (child ? typedDoc(child, row) : row));
  }
  return { id: r.id, name: str(legacy.name), legacy, doc };
}

/** The record as stored: the old row in text, its child rows inside it. */
function storedLegacy(s: DocScreen, doc: Doc, std: Record<string, string | null>): Doc {
  const l = layoutOf(s);
  const children = childLayoutsOf(s);
  const out: Doc = legacyRow(l, doc, std);
  for (const f of l.fields) {
    if (!isTable(f)) continue;
    const child = children[f.options ?? ""];
    out[f.fieldname] = rowsOf(doc[f.fieldname]).map((r, i) =>
      child
        ? legacyRow(child, r, {
            name: str(r.name) || newRowName(), idx: String(i + 1), parent: std.name, parentfield: f.fieldname, parenttype: s.doctype,
            docstatus: "0", owner: std.owner, creation: std.creation, modified: std.modified, modified_by: std.modified_by,
          })
        : r,
    );
  }
  return out;
}

const json = (v: Doc) => v as unknown as Prisma.InputJsonValue;
const bool = (v: unknown) => num(v) === 1;
const textOrNull = (v: unknown) => (str(v) ? str(v) : null);
const dateOrNull = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? new Date(`${str(v)}T00:00:00Z`) : null);

/** Writes the record (and its table's own columns). */
async function writeRecord(tx: Tx, s: DocScreen, id: string | null, name: string, legacy: Doc, user: PurchaseUser): Promise<string> {
  const doc = legacy;
  switch (s.doctype) {
    case "Item Group": {
      const data = { code: name, parentCode: textOrNull(doc.parent_item_group), isGroup: str(doc.is_group) === "1", legacy: json(doc) };
      return id ? (await tx.purchaseItemGroup.update({ where: { id }, data, select: { id: true } })).id : (await tx.purchaseItemGroup.create({ data, select: { id: true } })).id;
    }
    case "Price List": {
      const data = { code: name, currency: str(doc.currency), buying: str(doc.buying) === "1", selling: str(doc.selling) === "1", enabled: str(doc.enabled) === "1", legacy: json(doc) };
      return id ? (await tx.purchasePriceList.update({ where: { id }, data, select: { id: true } })).id : (await tx.purchasePriceList.create({ data, select: { id: true } })).id;
    }
    case "Item Price": {
      const [item, pl, supplier] = await Promise.all([
        tx.purchaseItem.findUnique({ where: { code: str(doc.item_code) }, select: { id: true } }),
        tx.purchasePriceList.findUnique({ where: { code: str(doc.price_list) }, select: { id: true } }),
        str(doc.supplier) ? tx.purchaseSupplier.findUnique({ where: { code: str(doc.supplier) }, select: { id: true } }) : null,
      ]);
      const data = {
        erpnextName: name, itemCode: str(doc.item_code), itemId: item?.id ?? null, uom: textOrNull(doc.uom), itemName: textOrNull(doc.item_name),
        itemDescription: textOrNull(doc.item_description), priceListCode: str(doc.price_list), priceListId: pl?.id ?? null,
        customerCode: textOrNull(doc.customer), supplierCode: textOrNull(doc.supplier), supplierId: supplier?.id ?? null,
        buying: bool(doc.buying), selling: bool(doc.selling), currency: textOrNull(doc.currency), priceListRate: new Prisma.Decimal(str(doc.price_list_rate) || "0"),
        validFrom: dateOrNull(doc.valid_from), validUpto: dateOrNull(doc.valid_upto), reference: textOrNull(doc.reference), uomFactor: textOrNull(doc.uom_factor),
        legacy: json(doc), updatedBy: user.email,
      };
      return id
        ? (await tx.purchaseItemPrice.update({ where: { id }, data, select: { id: true } })).id
        : (await tx.purchaseItemPrice.create({ data: { ...data, createdBy: user.email }, select: { id: true } })).id;
    }
    default: {
      const data = { doctype: s.doctype, erpnextName: name, docStatus: Number(doc.docstatus ?? 0) || 0, legacy: json(doc), updatedBy: user.email };
      return id
        ? (await tx.purchaseDocument.update({ where: { id }, data, select: { id: true } })).id
        : (await tx.purchaseDocument.create({ data: { ...data, createdBy: user.email }, select: { id: true } })).id;
    }
  }
}

/** What a save did to other records (price_list.py on_update, item_manufacturer.py). */
async function afterSave(tx: Tx, s: DocScreen, name: string, doc: Doc, stamp: string, isNew: boolean): Promise<void> {
  if (s.doctype === "Price List" && !isNew) {
    // update_item_price: the list's Item Prices take its currency, buying and selling (modified = now).
    const buying = num(doc.buying) ? "1" : "0";
    const selling = num(doc.selling) ? "1" : "0";
    await tx.$executeRaw`
      UPDATE purchase_item_prices SET currency = ${str(doc.currency)}, buying = ${buying === "1"}, selling = ${selling === "1"}, updated_at = now(),
        legacy = COALESCE(legacy, '{}'::jsonb) || jsonb_build_object('currency', ${str(doc.currency)}::text, 'buying', ${buying}::text, 'selling', ${selling}::text, 'modified', ${stamp}::text)
      WHERE price_list_code = ${name}`;
  }
  if (s.doctype === "Item Manufacturer") {
    const item = str(doc.item_code);
    const row = await linkedRow(tx, "Item", item);
    if (!row) return;
    const set = async (manufacturer: string | null, part: string | null) =>
      tx.$executeRaw`UPDATE purchase_items SET legacy = COALESCE(legacy, '{}'::jsonb) || jsonb_build_object('default_item_manufacturer', ${manufacturer}::text, 'default_manufacturer_part_no', ${part}::text) WHERE code = ${item}`;
    if (!num(doc.is_default)) {
      if (row.default_item_manufacturer === doc.manufacturer && row.default_manufacturer_part_no === doc.manufacturer_part_no) await set(null, null);
    } else {
      // set_default: this one is the item's only default manufacturer.
      await tx.$executeRaw`
        UPDATE purchase_documents SET legacy = legacy || '{"is_default": "0"}'::jsonb
        WHERE doctype = 'Item Manufacturer' AND erpnext_name <> ${name} AND legacy->>'item_code' = ${item}`;
      await set(str(doc.manufacturer) || null, str(doc.manufacturer_part_no) || null);
    }
  }
}

// ---------------------------------------------------------------------------------------------

export interface SaveDocRequest {
  id: string | null;
  doc: unknown;
  /** The stored record's "modified" when the form opened it (Frappe's stale-document check). */
  modified: string | null;
}

export async function saveDoc(user: PurchaseUser, s: DocScreen, req: SaveDocRequest): Promise<ActionResult<{ id: string; name: string; modified: string }>> {
  if (!s.editable) return { ok: false, error: `${s.doctype} is not entered here.` };
  const l = layoutOf(s);
  const children = childLayoutsOf(s);
  const parsed = docSchema(l, children).safeParse(req.doc);
  if (!parsed.success) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  const incoming = parsed.data;
  try {
    const out = await db.$transaction(async (tx) => {
      const stored = req.id ? await loadStored(tx, s, req.id) : null;
      if (req.id && !stored) refuse(`This ${s.doctype} no longer exists.`);
      if (stored && req.modified && str(stored.legacy.modified) !== req.modified) {
        refuse(`Document has been modified after you have opened it (${req.modified}, ${str(stored.legacy.modified)}). Please refresh to get the latest document.`);
      }
      const isNew = !stored;
      if (stored && formRules(s.doctype, stored.doc, false).readOnly) refuse("This is a root item group and cannot be edited.");
      const doc = mergeDoc(s, stored?.doc ?? newDoc(s), incoming, isNew);
      await applyFetches(tx, l, doc, children);
      await RULES[s.doctype]?.(tx, doc, { isNew, name: stored?.name ?? null });
      const missing = missingFields(effectiveLayout(l, doc, isNew), children, doc);
      if (missing.summary) throw new UserError(missing.summary, missing.errors);
      await validateLinks(tx, l, doc, children);

      const name = stored?.name ?? (await nameOf(tx, s, doc));
      if (isNew && (await linkExists(tx, s.doctype, name))) refuse(`${s.doctype} ${name} already exists`);
      const now = new Date();
      const stamp = siteDateTime(now);
      const std = {
        name, owner: str(stored?.legacy.owner) || user.email, creation: str(stored?.legacy.creation) || stamp,
        modified: stamp, modified_by: user.email, docstatus: "0", idx: str(stored?.legacy.idx) || "0",
      };
      const legacy = storedLegacy(s, doc, std);
      // Columns the old row kept that this form does not hold (lft, rgt, _comments, _liked_by…) stay.
      const kept = stored ? Object.fromEntries(Object.entries(stored.legacy).filter(([k]) => !(k in legacy))) : {};
      const id = await writeRecord(tx, s, stored?.id ?? null, name, { ...kept, ...legacy }, user);
      await afterSave(tx, s, name, doc, stamp, isNew);
      if (stored && TRACK_CHANGES.has(s.doctype)) {
        const diff = versionDiff(docSnapshot(l, children, stored.doc, "INR"), docSnapshot(l, children, { ...doc, name }, "INR"));
        if (diff) {
          await tx.purchaseDocEvent.create({ data: { source: "app", doctype: s.doctype, docName: name, kind: "VERSION", at: now, byEmail: user.email, data: diff as unknown as Prisma.InputJsonValue } });
        }
      }
      return { id, name, modified: stamp };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: `${s.doctype} already exists` };
    throw e;
  }
}

/** Why the record may not be deleted (Frappe's on_trash and its linked-document check), or null. */
async function deleteRefusal(tx: Tx, s: DocScreen, stored: Stored): Promise<string | null> {
  const name = stored.name;
  const linked = (doctype: string, other: string) => `Cannot delete or cancel because ${s.doctype} ${name} is linked with ${doctype} ${other}`;
  switch (s.doctype) {
    case "Item Group": {
      if (!str(stored.doc.parent_item_group)) return `Root ${s.doctype} cannot be deleted`;
      const child = await tx.purchaseItemGroup.findFirst({ where: { parentCode: name }, select: { code: true } });
      if (child) return `Cannot delete ${name} as it has child nodes`;
      const item = await tx.purchaseItem.findFirst({ where: { itemGroup: { code: name } }, select: { code: true } });
      return item ? linked("Item", item.code) : null;
    }
    case "Price List": {
      const ip = await tx.purchaseItemPrice.findFirst({ where: { priceListCode: name }, select: { erpnextName: true } });
      if (ip) return linked("Item Price", ip.erpnextName);
      const po = await tx.purchaseOrder.findFirst({ where: { buyingPriceList: { code: name } }, select: { number: true } });
      if (po) return linked("Purchase Order", po.number);
      const receipt = await tx.purchaseReceipt.findFirst({ where: { buyingPriceList: name }, select: { number: true } });
      if (receipt) return linked("Purchase Receipt", receipt.number);
      const supplier = await tx.purchaseSupplier.findFirst({ where: { defaultPriceList: { code: name } }, select: { code: true } });
      return supplier ? linked("Supplier", supplier.code) : null;
    }
    case "Customs Tariff Number": {
      const item = await tx.$queryRaw<{ code: string }[]>`SELECT code FROM purchase_items WHERE legacy->>'customs_tariff_number' = ${name} LIMIT 1`;
      return item.length ? linked("Item", item[0].code) : null;
    }
    default:
      return null;
  }
}

/** Deletes a record (its ⋯ › Delete, or the list's Actions › Delete). */
export async function deleteDoc(user: PurchaseUser, s: DocScreen, id: string): Promise<ActionResult<{ name: string }>> {
  if (!s.editable) return { ok: false, error: `${s.doctype} is not entered here.` };
  try {
    const out = await db.$transaction(async (tx) => {
      const stored = await loadStored(tx, s, id);
      if (!stored) refuse(`This ${s.doctype} no longer exists.`);
      const why = await deleteRefusal(tx, s, stored!);
      if (why) refuse(why);
      if (s.doctype === "Item Manufacturer" && num(stored!.doc.is_default)) await afterSave(tx, s, stored!.name, { ...stored!.doc, is_default: 0 }, siteDateTime(), false);
      if (s.store.kind === "table") await tx.$executeRaw`DELETE FROM ${Prisma.raw(`"${s.store.table}"`)} WHERE id = ${id}`;
      else await tx.purchaseDocument.delete({ where: { id } });
      await tx.purchaseLike.deleteMany({ where: { doctype: s.doctype, recordId: id } });
      await tx.purchaseDocEvent.create({
        data: { source: "app", doctype: s.doctype, docName: stored!.name, kind: "DELETED", at: new Date(), byEmail: user.email, data: { doc: stored!.legacy } as unknown as Prisma.InputJsonValue },
      });
      return { name: stored!.name };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Countries for a Country link (the old site's 251). */
export const countryNames = (): readonly string[] => COUNTRIES as readonly string[];
