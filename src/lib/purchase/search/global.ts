// The search box's "Search for <text> ↵" — the old site's global search (Frappe 14
// frappe.utils.global_search.search over its __global_search index), for the DocTypes of this ERP
// that the old Global Search Settings listed: Supplier, Item, Purchase Order, Purchase Receipt,
// Contact, Address, Purchase Taxes and Charges Template (captured 23-11-2026; Gate Entry was not
// indexed there, and is not here). Owner, 23-11-2026: "same functionality and behaviour".
//
// Each result is { doctype, name, content } as the old one was, content in its form
// "Supplier : … ||| Supplier Name : … ||| Name : … ||| Item Name : …" (the fields the old index
// held). The old index matched words (MariaDB full text); here every word typed must appear in that
// content. Best first: the document named exactly so, then names holding the text, then the newest.
// Server-only: the API route answers with it.
import "server-only";
import { Prisma } from "@prisma/client";
import { purchaseCan } from "../access";
import { masterPath, orderPath, receiptPath } from "../routes";
import { db } from "../server/db";

export interface GlobalResult {
  doctype: string;
  name: string;
  content: string;
  href: string;
}

export const GLOBAL_SEARCH_DOCTYPES = ["Purchase Order", "Purchase Receipt", "Supplier", "Item", "Contact", "Address", "Purchase Taxes and Charges Template"] as const;
export type GlobalDoctype = (typeof GLOBAL_SEARCH_DOCTYPES)[number];

/** The DocTypes this user's search covers (receipts are the Stock module's). */
export function globalDoctypesFor(user: unknown): GlobalDoctype[] {
  return GLOBAL_SEARCH_DOCTYPES.filter((d) => (d === "Purchase Receipt" ? purchaseCan(user, "stock") : purchaseCan(user, "view")));
}

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Every word must appear in the text (an AND of ILIKEs). */
const allWords = (text: Prisma.Sql, words: string[]) => Prisma.join(words.map((w) => Prisma.sql`(${text}) ILIKE ${like(w)}`), " AND ");

interface Row {
  id: string;
  name: string;
  content: string | null;
}

/** One DocType's matches: SQL for its content and the text it is searched in. */
const QUERIES: Record<GlobalDoctype, (words: string[], q: string, start: number, limit: number) => Promise<Row[]>> = {
  "Purchase Order": (words, q, start, limit) => db.$queryRaw<Row[]>`
    SELECT o.id, o.number AS name,
      concat_ws(' ||| ', 'Supplier : ' || s.code, 'Supplier Name : ' || o.supplier_name, 'Name : ' || o.number, it.content) AS content
    FROM purchase_orders o
    LEFT JOIN purchase_suppliers s ON s.id = o.supplier_id
    LEFT JOIN LATERAL (
      SELECT string_agg('Item Name : ' || i.item_name, ' ||| ' ORDER BY i.idx) AS content, string_agg(i.item_name, ' ') AS text
      FROM purchase_order_items i WHERE i.order_id = o.id) it ON TRUE
    WHERE ${allWords(Prisma.sql`concat_ws(' ', o.number, s.code, o.supplier_name, it.text)`, words)}
    ORDER BY (o.number ILIKE ${q}) DESC, (o.number ILIKE ${like(q)}) DESC, o.transaction_date DESC, o.number DESC
    LIMIT ${limit} OFFSET ${start}`,

  "Purchase Receipt": (words, q, start, limit) => db.$queryRaw<Row[]>`
    SELECT r.id, r.number AS name,
      concat_ws(' ||| ', 'Supplier : ' || r.supplier_code, 'Supplier Name : ' || r.supplier_name, 'Name : ' || r.number, it.content) AS content
    FROM purchase_receipts r
    LEFT JOIN LATERAL (
      SELECT string_agg('Item Code : ' || i.item_code || ' ||| Item Name : ' || coalesce(i.item_name, i.item_code), ' ||| ' ORDER BY i.idx) AS content,
             string_agg(i.item_code || ' ' || coalesce(i.item_name, ''), ' ') AS text
      FROM purchase_receipt_items i WHERE i.receipt_id = r.id) it ON TRUE
    WHERE ${allWords(Prisma.sql`concat_ws(' ', r.number, r.supplier_code, r.supplier_name, it.text)`, words)}
    ORDER BY (r.number ILIKE ${q}) DESC, (r.number ILIKE ${like(q)}) DESC, r.posting_date DESC, r.number DESC
    LIMIT ${limit} OFFSET ${start}`,

  Supplier: (words, q, start, limit) => db.$queryRaw<Row[]>`
    SELECT s.id, s.code AS name,
      concat_ws(' ||| ', 'Supplier Name : ' || s.supplier_name, 'Supplier Group : ' || g.code, 'GSTIN / UIN : ' || s.gstin, 'Name : ' || s.code) AS content
    FROM purchase_suppliers s LEFT JOIN purchase_supplier_groups g ON g.id = s.supplier_group_id
    WHERE NOT s.disabled AND ${allWords(Prisma.sql`concat_ws(' ', s.code, s.supplier_name, g.code, s.gstin)`, words)}
    ORDER BY (s.code ILIKE ${q}) DESC, (s.code ILIKE ${like(q)}) DESC, s.code
    LIMIT ${limit} OFFSET ${start}`,

  Item: (words, q, start, limit) => db.$queryRaw<Row[]>`
    SELECT i.id, i.code AS name,
      concat_ws(' ||| ', 'Item Name : ' || i.item_name, 'Item Group : ' || g.code,
        'Description : ' || nullif(regexp_replace(coalesce(i.description, ''), '<[^>]*>', '', 'g'), ''), 'Name : ' || i.code) AS content
    FROM purchase_items i LEFT JOIN purchase_item_groups g ON g.id = i.item_group_id
    WHERE NOT i.disabled AND ${allWords(Prisma.sql`concat_ws(' ', i.code, i.item_name, g.code, regexp_replace(coalesce(i.description, ''), '<[^>]*>', '', 'g'))`, words)}
    ORDER BY (i.code ILIKE ${q}) DESC, (i.code ILIKE ${like(q)}) DESC, i.code
    LIMIT ${limit} OFFSET ${start}`,

  Contact: (words, q, start, limit) => db.$queryRaw<Row[]>`
    SELECT c.id, c.code AS name,
      concat_ws(' ||| ', 'First Name : ' || c.first_name, 'Last Name : ' || c.last_name, 'Email Address : ' || c.email_id,
        'Mobile No : ' || c.mobile_no, 'User Id : ' || c.user_email) AS content
    FROM purchase_contacts c
    WHERE ${allWords(Prisma.sql`concat_ws(' ', c.code, c.first_name, c.last_name, c.email_id, c.mobile_no, c.phone, c.user_email, c.company_name)`, words)}
    ORDER BY (c.code ILIKE ${q}) DESC, (c.code ILIKE ${like(q)}) DESC, c.code
    LIMIT ${limit} OFFSET ${start}`,

  Address: (words, q, start, limit) => db.$queryRaw<Row[]>`
    SELECT a.id, a.code AS name,
      concat_ws(' ||| ', 'Address Title : ' || a.address_title, 'Address Line 1 : ' || a.address_line1, 'City/Town : ' || a.city,
        'State : ' || a.state, 'GSTIN : ' || a.gstin) AS content
    FROM purchase_addresses a
    WHERE NOT a.disabled AND ${allWords(Prisma.sql`concat_ws(' ', a.code, a.address_title, a.address_line1, a.address_line2, a.city, a.state, a.pincode, a.gstin)`, words)}
    ORDER BY (a.code ILIKE ${q}) DESC, (a.code ILIKE ${like(q)}) DESC, a.code
    LIMIT ${limit} OFFSET ${start}`,

  "Purchase Taxes and Charges Template": (words, q, start, limit) => db.$queryRaw<Row[]>`
    SELECT t.id, t.code AS name, 'Title : ' || t.title AS content
    FROM purchase_tax_templates t
    WHERE NOT t.disabled AND ${allWords(Prisma.sql`concat_ws(' ', t.code, t.title)`, words)}
    ORDER BY (t.code ILIKE ${q}) DESC, t.code
    LIMIT ${limit} OFFSET ${start}`,
};

const HREF: Record<GlobalDoctype, (id: string) => string> = {
  "Purchase Order": orderPath,
  "Purchase Receipt": receiptPath,
  Supplier: (id) => masterPath("suppliers", id),
  Item: (id) => masterPath("items", id),
  Contact: (id) => masterPath("contacts", id),
  Address: (id) => masterPath("addresses", id),
  "Purchase Taxes and Charges Template": (id) => masterPath("taxTemplates", id),
};

/**
 * The global search: the first `limit` results of each DocType (or, with `doctype`, the next ones of
 * that one from `start`). Words: up to 8, each at least one character.
 */
export async function globalSearch(
  user: unknown,
  text: string,
  opts: { doctype?: string | null; start?: number; limit?: number } = {},
): Promise<GlobalResult[]> {
  const q = text.trim().slice(0, 140);
  const words = q.split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const allowed = globalDoctypesFor(user);
  const doctypes = opts.doctype ? allowed.filter((d) => d === opts.doctype) : allowed;
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const start = Math.max(opts.start ?? 0, 0);
  const groups = await Promise.all(
    doctypes.map(async (d) => (await QUERIES[d](words, q, start, limit)).map((r) => ({ doctype: d, name: r.name, content: r.content ?? "", href: HREF[d](r.id) }))),
  );
  return groups.flat();
}
