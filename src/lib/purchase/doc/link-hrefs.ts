// Where a document's links open here: the records of the Link fields on a form (its header and its
// rows) that have a page in this ERP — items, suppliers, POs, receipts, gate entries and the Stock
// screens drawn from their definitions. Server only (owner, 24-11-2026).

import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../server/db";
import { docRecordPath, gateEntryPath, masterPath, orderPath, receiptPath } from "../routes";
import { isTable, type DoctypeLayout } from "./layout";
import { DOC_SCREENS } from "./screens";

type Doc = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** "<DocType>\u0000<name>" → the page of that record. */
export type LinkHrefs = Map<string, string>;
export const linkKey = (doctype: string, name: string) => `${doctype}\u0000${name}`;

/** The links of a document (and its rows), by DocType. */
function linksOf(l: DoctypeLayout, doc: Doc, children: Record<string, DoctypeLayout | undefined>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (layout: DoctypeLayout, row: Doc) => {
    for (const f of layout.fields) {
      if (f.fieldtype !== "Link" || !f.options) continue;
      const v = str(row[f.fieldname]);
      if (!v) continue;
      if (!out.has(f.options)) out.set(f.options, new Set());
      out.get(f.options)!.add(v);
    }
  };
  add(l, doc);
  for (const f of l.fields) {
    const child = isTable(f) ? children[f.options ?? ""] : undefined;
    if (child && Array.isArray(doc[f.fieldname])) for (const r of doc[f.fieldname] as Doc[]) add(child, r);
  }
  return out;
}

export async function linkHrefs(l: DoctypeLayout, doc: Doc, children: Record<string, DoctypeLayout | undefined>): Promise<LinkHrefs> {
  const hrefs: LinkHrefs = new Map();
  const links = linksOf(l, doc, children);
  const names = (doctype: string) => [...(links.get(doctype) ?? [])];
  const jobs: Promise<void>[] = [];
  const many = <T extends { id: string }>(doctype: string, rows: Promise<T[]>, nameOf: (r: T) => string, path: (id: string) => string) =>
    jobs.push(rows.then((rs) => rs.forEach((r) => hrefs.set(linkKey(doctype, nameOf(r)), path(r.id)))));
  if (names("Item").length) many("Item", db.purchaseItem.findMany({ where: { code: { in: names("Item") } }, select: { id: true, code: true } }), (r) => r.code, (id) => masterPath("items", id));
  if (names("Supplier").length) many("Supplier", db.purchaseSupplier.findMany({ where: { code: { in: names("Supplier") } }, select: { id: true, code: true } }), (r) => r.code, (id) => masterPath("suppliers", id));
  if (names("Purchase Order").length) many("Purchase Order", db.purchaseOrder.findMany({ where: { number: { in: names("Purchase Order") } }, select: { id: true, number: true } }), (r) => r.number, orderPath);
  if (names("Purchase Receipt").length) many("Purchase Receipt", db.purchaseReceipt.findMany({ where: { number: { in: names("Purchase Receipt") } }, select: { id: true, number: true } }), (r) => r.number, receiptPath);
  if (names("Gate Entry").length) many("Gate Entry", db.purchaseGateEntry.findMany({ where: { number: { in: names("Gate Entry") } }, select: { id: true, number: true } }), (r) => r.number, gateEntryPath);
  for (const s of DOC_SCREENS) {
    const list = names(s.doctype);
    if (!list.length) continue;
    const table = s.store.kind === "table" ? Prisma.raw(`"${s.store.table}"`) : Prisma.raw("purchase_documents");
    const scoped = s.store.kind === "generic" ? Prisma.sql`AND doctype = ${s.doctype}` : Prisma.empty;
    many(s.doctype, db.$queryRaw<{ id: string; name: string }[]>`SELECT id, legacy->>'name' AS name FROM ${table} WHERE legacy->>'name' IN (${Prisma.join(list)}) ${scoped}`, (r) => r.name, (id) => docRecordPath(s.path, id));
  }
  await Promise.all(jobs);
  return hrefs;
}
