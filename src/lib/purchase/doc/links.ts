// Links between documents, for the screens drawn from their definitions (owner, 24-11-2026): which
// table holds each linked DocType, whether a linked record exists (Frappe's _validate_links: "Could
// not find Item Code: X"), and the linked record's row (its fetch_from values). Server only.
//
// DocTypes the old site held no record of (Manufacturer, Campaign, Promotional Scheme, Website
// Slideshow: 0 in the final backup) have no records here either, so a link to one cannot be found,
// as there. DocTypes it held but this module did not bring over (Brand, Customer Group, Territory,
// Sales Partner, Item Attribute values on a form…) cannot be checked, and are taken as typed.

import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { COUNTRIES } from "../countries";
import { db } from "../server/db";
import { DOC_SCREENS } from "./screens";

type Client = PrismaClient | Prisma.TransactionClient;
type Row = Record<string, unknown>;

/** The tables of linked DocTypes: the key column, and whether it keeps the old row in `legacy`. */
const LINK_TABLES: Readonly<Record<string, { table: string; key: string; legacy: boolean }>> = {
  Item: { table: "purchase_items", key: "code", legacy: true },
  "Item Group": { table: "purchase_item_groups", key: "code", legacy: true },
  "Price List": { table: "purchase_price_lists", key: "code", legacy: true },
  Warehouse: { table: "purchase_warehouses", key: "code", legacy: true },
  Company: { table: "purchase_companies", key: "code", legacy: true },
  Customer: { table: "purchase_customers", key: "code", legacy: true },
  Supplier: { table: "purchase_suppliers", key: "code", legacy: true },
  Currency: { table: "purchase_currencies", key: "code", legacy: false },
  UOM: { table: "purchase_uoms", key: "name", legacy: false },
  Batch: { table: "purchase_batches", key: "code", legacy: true },
  Account: { table: "purchase_accounts", key: "code", legacy: true },
  "Cost Center": { table: "purchase_cost_centers", key: "code", legacy: true },
  "GST HSN Code": { table: "purchase_hsn_codes", key: "code", legacy: false },
  "Item Tax Template": { table: "purchase_item_tax_templates", key: "code", legacy: true },
  "Tax Category": { table: "purchase_tax_categories", key: "code", legacy: false },
  "Supplier Group": { table: "purchase_supplier_groups", key: "code", legacy: false },
  "Stock Entry Type": { table: "purchase_stock_entry_types", key: "code", legacy: true },
};

/** DocTypes with no record on the old site (final backup, 24-11-2026). */
const NEVER_HELD = new Set(["Manufacturer", "Campaign", "Promotional Scheme", "Website Slideshow"]);

/** Does the linked record exist? null: this module cannot tell (taken as typed). */
export async function linkExists(c: Client, doctype: string, value: string): Promise<boolean | null> {
  if (!value) return true;
  if (doctype === "Country") return COUNTRIES.includes(value);
  if (NEVER_HELD.has(doctype)) return false;
  const t = LINK_TABLES[doctype];
  if (t) {
    const r = await c.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM ${Prisma.raw(`"${t.table}"`)} WHERE ${Prisma.raw(`"${t.key}"`)} = ${value} LIMIT 1`;
    return r.length > 0;
  }
  const screen = DOC_SCREENS.find((s) => s.doctype === doctype);
  if (screen) {
    const r =
      screen.store.kind === "table"
        ? await c.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM ${Prisma.raw(`"${screen.store.table}"`)} WHERE legacy->>'name' = ${value} LIMIT 1`
        : await c.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM purchase_documents WHERE doctype = ${doctype} AND erpnext_name = ${value} LIMIT 1`;
    return r.length > 0;
  }
  return null;
}

/** The linked record's old row (its fields by fieldname), or null. */
export async function linkedRow(c: Client, doctype: string, value: string): Promise<Row | null> {
  if (!value) return null;
  const t = LINK_TABLES[doctype];
  if (t?.legacy) {
    const r = await c.$queryRaw<{ legacy: Row | null }[]>`SELECT legacy FROM ${Prisma.raw(`"${t.table}"`)} WHERE ${Prisma.raw(`"${t.key}"`)} = ${value} LIMIT 1`;
    return r[0]?.legacy ?? (r.length ? {} : null);
  }
  const screen = DOC_SCREENS.find((s) => s.doctype === doctype);
  if (screen?.store.kind === "generic") {
    const r = await c.$queryRaw<{ legacy: Row }[]>`SELECT legacy FROM purchase_documents WHERE doctype = ${doctype} AND erpnext_name = ${value} LIMIT 1`;
    return r[0]?.legacy ?? null;
  }
  return null;
}

/** The form's fetch on choosing a link (frm.add_fetch / fetch_from): the linked row's fields. */
export async function fetchLinked(doctype: string, value: string, fields: readonly string[]): Promise<Row | null> {
  const row = await linkedRow(db, doctype, value);
  if (!row) return null;
  return Object.fromEntries(fields.map((f) => [f, row[f] ?? null]));
}
