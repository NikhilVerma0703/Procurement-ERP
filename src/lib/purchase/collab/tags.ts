// Add Tags and the list sidebar's Tags (owner, 26-11-2026: "Build all of them"), as Frappe 14.101.1 kept them
// (desk/doctype/tag/tag.py: DocTags — a record's _user_tags, each tag a Tag record): a tag is free text,
// added to every ticked record once; the sidebar counts the DocType's records by tag and filters by one; "Show
// Tags" shows each row's tags. And the sidebar's Save Filter (Frappe's List Filter): a list's state saved by a
// name, for the login that saved it. Server only.
import "server-only";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import type { RecordRef } from "./assignments";

const clean = (t: string) => t.replace(/[,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);

/** frappe.desk.doctype.tag.tag.add_tags. */
export async function addTags(user: PurchaseUser, doctype: string, records: readonly RecordRef[], tags: readonly string[]): Promise<void> {
  const list = [...new Set(tags.map(clean).filter(Boolean))];
  if (!list.length) throw new Error("Tags is required");
  await db.purchaseTag.createMany({
    data: records.flatMap((r) => list.map((tag) => ({ doctype, recordId: r.id, tag, createdBy: user.email }))),
    skipDuplicates: true,
  });
}

/** A tag taken off a record (the row's or the form's ×). */
export async function removeTag(doctype: string, recordId: string, tag: string): Promise<void> {
  await db.purchaseTag.deleteMany({ where: { doctype, recordId, tag } });
}

/** Each record's tags, in the order they were added. */
export async function tagsOf(doctype: string, ids: readonly string[]): Promise<Record<string, string[]>> {
  if (!ids.length) return {};
  const rows = await db.purchaseTag.findMany({ where: { doctype, recordId: { in: [...ids] } }, select: { recordId: true, tag: true }, orderBy: { createdAt: "asc" } });
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.recordId] ??= []).push(r.tag);
  return out;
}

/** Every tag in use (the Add Tags field's suggestions, Frappe's Tag list). */
export async function allTags(q = ""): Promise<string[]> {
  const rows = await db.purchaseTag.findMany({ where: q ? { tag: { contains: q, mode: "insensitive" } } : {}, select: { tag: true }, distinct: ["tag"], orderBy: { tag: "asc" }, take: 50 });
  return rows.map((r) => r.tag);
}

/** The sidebar's Tags: each tag with how many of the DocType's records carry it. */
export async function tagCounts(doctype: string): Promise<{ tag: string; count: number }[]> {
  const rows = await db.purchaseTag.groupBy({ by: ["tag"], where: { doctype }, _count: { _all: true } });
  return rows.map((r) => ({ tag: r.tag, count: r._count._all })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The ids of the DocType's records with this tag. */
export async function recordsTagged(doctype: string, tag: string): Promise<string[]> {
  return (await db.purchaseTag.findMany({ where: { doctype, tag }, select: { recordId: true } })).map((r) => r.recordId);
}

// ---------------------------------------------------------------------------------------------
// Saved filters (List Filter)

export async function savedFilters(doctype: string, user: PurchaseUser): Promise<{ id: string; name: string; query: string }[]> {
  const rows = await db.purchaseSavedFilter.findMany({
    where: { doctype, OR: [{ forUser: user.email }, { forUser: null }] },
    select: { id: true, filterName: true, query: true },
    orderBy: { filterName: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.filterName, query: r.query }));
}

/** A name already among the filters this user sees is refused ("Duplicate Filter Name"); a global one is for everyone. */
export async function saveFilter(user: PurchaseUser, doctype: string, name: string, query: string, isGlobal = false): Promise<void> {
  const filterName = name.trim().slice(0, 140);
  if (!filterName) throw new Error("Filter Name is required");
  const exists = await db.purchaseSavedFilter.findFirst({ where: { doctype, filterName, OR: [{ forUser: user.email }, { forUser: null }] }, select: { id: true } });
  if (exists) throw new Error(`Duplicate Filter Name`);
  await db.purchaseSavedFilter.create({ data: { doctype, filterName, query: query.slice(0, 4000), forUser: isGlobal ? null : user.email } });
}

/** A saved filter's × (Frappe let anyone delete one they could see). */
export async function deleteSavedFilter(user: PurchaseUser, id: string): Promise<void> {
  await db.purchaseSavedFilter.deleteMany({ where: { id, OR: [{ forUser: user.email }, { forUser: null }] } });
}
