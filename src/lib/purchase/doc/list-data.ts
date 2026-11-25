// The records of a screen drawn from its definition (doc/screens.ts): its list — the old list's
// conditions, sort and count, over each record's old row kept in `legacy` —, one record with its
// child rows, and the records before and after it. Server only (owner, 24-11-2026).
//
// Conditions compare as the old site's MariaDB did: text without regard to case (its collation),
// numbers as numbers, dates and datetimes as their ISO text (which orders as time does).

import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../server/db";
import { likedByWhere } from "../likes";
import { LIKE_DOCTYPE, type LikeKind } from "../like-rules";
import type { DoctypeLayout, LayoutField } from "./layout";
import { COUNT_UPPER_BOUND, type DocFilter, type DocListQuery } from "./list-view";
import { childLayoutsOf, layoutOf, type DocScreen } from "./screens";
import { typedDoc } from "./values";

const NUMERIC = new Set(["Check", "Int", "Float", "Currency", "Percent", "Rating"]);
const STANDARD_NUMERIC = new Set(["docstatus", "idx"]);

type Legacy = Record<string, unknown>;

/** The FROM clause of a screen's records, as "t". */
function source(s: DocScreen): Prisma.Sql {
  if (s.store.kind === "overlay") return Prisma.sql`(${Prisma.raw(s.store.sql)}) t WHERE TRUE`;
  return s.store.kind === "table" ? Prisma.sql`${Prisma.raw(`"${s.store.table}"`)} t WHERE TRUE` : Prisma.sql`purchase_documents t WHERE t.doctype = ${s.doctype}`;
}

const isNumeric = (l: DoctypeLayout, field: string) => STANDARD_NUMERIC.has(field) || NUMERIC.has(l.fields.find((f) => f.fieldname === field)?.fieldtype ?? "");
const textOf = (field: string) => Prisma.sql`COALESCE(t.legacy->>${field}, '')`;
const numberOf = (field: string) => Prisma.sql`COALESCE(NULLIF(t.legacy->>${field}, ''), '0')::numeric`;
const numberIn = (v: string) => {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** One condition as SQL (null: nothing to add). "_liked_by" is answered by the likes table. */
async function condition(s: DocScreen, l: DoctypeLayout, f: DocFilter): Promise<Prisma.Sql | null> {
  if (f.field === "_liked_by") {
    const kind = s.key as LikeKind;
    if (!(kind in LIKE_DOCTYPE)) return null;
    const ids = (await likedByWhere(kind, { op: f.op as never, value: f.value })).id;
    return "in" in ids ? (ids.in.length ? Prisma.sql`t.id IN (${Prisma.join(ids.in)})` : Prisma.sql`FALSE`) : ids.notIn.length ? Prisma.sql`t.id NOT IN (${Prisma.join(ids.notIn)})` : null;
  }
  const numeric = isNumeric(l, f.field);
  const x = numeric ? numberOf(f.field) : textOf(f.field);
  const one = (v: string) => (numeric ? Prisma.sql`${numberIn(v)}` : Prisma.sql`${v}`);
  const v = Array.isArray(f.value) ? f.value : [f.value];
  switch (f.op) {
    case "=":
      return numeric ? Prisma.sql`${x} = ${one(v[0])}` : Prisma.sql`lower(${x}) = lower(${v[0]})`;
    case "!=":
      return numeric ? Prisma.sql`${x} <> ${one(v[0])}` : Prisma.sql`lower(${x}) <> lower(${v[0]})`;
    case "like":
      return Prisma.sql`${textOf(f.field)} ILIKE ${v[0].includes("%") ? v[0] : `%${v[0]}%`}`;
    case "not like":
      return Prisma.sql`${textOf(f.field)} NOT ILIKE ${v[0].includes("%") ? v[0] : `%${v[0]}%`}`;
    case "in":
      return numeric ? Prisma.sql`${x} IN (${Prisma.join(v.map(numberIn))})` : Prisma.sql`lower(${x}) IN (${Prisma.join(v.map((s) => s.toLowerCase()))})`;
    case "not in":
      return numeric ? Prisma.sql`${x} NOT IN (${Prisma.join(v.map(numberIn))})` : Prisma.sql`lower(${x}) NOT IN (${Prisma.join(v.map((s) => s.toLowerCase()))})`;
    case "is":
      return v[0] === "set" ? Prisma.sql`${textOf(f.field)} <> ''` : Prisma.sql`${textOf(f.field)} = ''`;
    case ">":
      return Prisma.sql`${x} > ${one(v[0])}`;
    case "<":
      return Prisma.sql`${x} < ${one(v[0])}`;
    case ">=":
      return Prisma.sql`${x} >= ${one(v[0])}`;
    case "<=":
      return Prisma.sql`${x} <= ${one(v[0])}`;
    case "between":
      return v.length === 2 ? Prisma.sql`${x} BETWEEN ${one(v[0])} AND ${one(v[1])}` : null;
  }
}

async function whereOf(s: DocScreen, l: DoctypeLayout, filters: DocFilter[]): Promise<Prisma.Sql> {
  const parts = (await Promise.all(filters.map((f) => condition(s, l, f)))).filter((p): p is Prisma.Sql => p !== null);
  return parts.length ? Prisma.sql`AND ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

const orderOf = (l: DoctypeLayout, sort: string, order: "asc" | "desc") => {
  const dir = Prisma.raw(order === "asc" ? "ASC" : "DESC");
  return isNumeric(l, sort) ? Prisma.sql`${numberOf(sort)} ${dir}, t.id ${dir}` : Prisma.sql`${textOf(sort)} ${dir}, t.id ${dir}`;
};

export interface DocListRecord {
  id: string;
  /** The record's old row, typed (numbers for numeric fields). */
  doc: Legacy;
}

/** A page of the list, and how many match (to 1,001 unless the exact count was asked for). */
export async function listDocs(s: DocScreen, q: DocListQuery): Promise<{ rows: DocListRecord[]; total: number }> {
  const l = layoutOf(s);
  const where = await whereOf(s, l, q.filters);
  const [rows, counted] = await Promise.all([
    db.$queryRaw<{ id: string; legacy: Legacy | null }[]>`SELECT t.id, t.legacy FROM ${source(s)} ${where} ORDER BY ${orderOf(l, q.sort, q.order)} LIMIT ${q.limit}`,
    q.exact
      ? db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM ${source(s)} ${where}`
      : db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM ${source(s)} ${where} LIMIT ${COUNT_UPPER_BOUND}) x`,
  ]);
  return { rows: rows.map((r) => ({ id: r.id, doc: typedDoc(l, r.legacy ?? {}) })), total: counted[0]?.n ?? 0 };
}

/** Does the record exist (for a like)? */
export async function docRecordExists(s: DocScreen, id: string): Promise<boolean> {
  const r = await db.$queryRaw<{ id: string }[]>`SELECT t.id FROM ${source(s)} AND t.id = ${id} LIMIT 1`;
  return r.length > 0;
}

/** The record's id from its name (a link to it by name). */
export async function docIdByName(s: DocScreen, name: string): Promise<string | null> {
  const r = await db.$queryRaw<{ id: string }[]>`SELECT t.id FROM ${source(s)} AND t.legacy->>'name' = ${name} LIMIT 1`;
  return r[0]?.id ?? null;
}

export interface LoadedDoc {
  id: string;
  name: string;
  /** The form's document: the record's fields typed, and its child tables' rows. */
  doc: Legacy;
  stamps: { createdBy: string | null; createdAt: Date; updatedBy: string | null; updatedAt: Date };
}

/** A moment the old site wrote ("2026-11-17 17:06:13.516877", Asia/Kolkata) as a Date. */
export function siteMoment(v: unknown): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?/.exec(String(v ?? ""));
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${(m[3] ?? "").slice(0, 4)}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One record of a screen, with its child rows; null when there is none. */
export async function loadDoc(s: DocScreen, id: string): Promise<LoadedDoc | null> {
  const l = layoutOf(s);
  const [r] = await db.$queryRaw<{ id: string; legacy: Legacy | null }[]>`SELECT t.id, t.legacy FROM ${source(s)} AND t.id = ${id} LIMIT 1`;
  if (!r) return null;
  const legacy = r.legacy ?? {};
  const doc: Legacy = typedDoc(l, legacy);
  const children = childLayoutsOf(s);
  for (const f of l.fields) {
    if (f.fieldtype !== "Table" && f.fieldtype !== "Table MultiSelect") continue;
    const child = children[f.options ?? ""];
    const kept = s.store.kind === "table" ? s.store.children[f.fieldname] : undefined;
    let rows: Legacy[];
    if (kept) {
      const fk = Prisma.raw(`"${kept.fk}"`);
      rows = (await db.$queryRaw<{ legacy: Legacy | null }[]>`SELECT c.legacy FROM ${Prisma.raw(`"${kept.table}"`)} c WHERE c.${fk} = ${r.id} ORDER BY c.idx ASC`).map((c) => c.legacy ?? {});
    } else {
      // Rows kept inside the record itself (the generic table, and the tables the importer never had).
      rows = Array.isArray(legacy[f.fieldname]) ? (legacy[f.fieldname] as Legacy[]) : [];
    }
    doc[f.fieldname] = rows.map((row) => (child ? typedDoc(child, row) : row));
  }
  const createdAt = siteMoment(legacy.creation) ?? new Date(0);
  const updatedAt = siteMoment(legacy.modified) ?? createdAt;
  return {
    id: r.id,
    name: String(legacy.name ?? r.id),
    doc,
    stamps: { createdBy: (legacy.owner as string) ?? null, createdAt, updatedBy: (legacy.modified_by as string) ?? null, updatedAt },
  };
}

/** The records before and after this one in the list's default order (the form's ‹ ›). */
export async function adjacentDocs(s: DocScreen, id: string): Promise<{ prev: string | null; next: string | null }> {
  const l = layoutOf(s);
  const sort = s.sort.field;
  const key = isNumeric(l, sort) ? numberOf(sort) : textOf(sort);
  const meKey = isNumeric(l, sort) ? Prisma.sql`COALESCE(NULLIF(me.legacy->>${sort}, ''), '0')::numeric` : Prisma.sql`COALESCE(me.legacy->>${sort}, '')`;
  const meTable = s.store.kind === "table" ? Prisma.raw(`"${s.store.table}"`) : s.store.kind === "overlay" ? Prisma.raw(`(${s.store.sql})`) : Prisma.raw("purchase_documents");
  // ‹ goes to the record listed before this one, › to the one after, in the list's own order.
  const before = s.sort.order === "desc" ? Prisma.sql`>` : Prisma.sql`<`;
  const after = s.sort.order === "desc" ? Prisma.sql`<` : Prisma.sql`>`;
  const dirBefore = Prisma.raw(s.sort.order === "desc" ? "ASC" : "DESC");
  const dirAfter = Prisma.raw(s.sort.order === "desc" ? "DESC" : "ASC");
  const [prev] = await db.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM ${source(s)} AND (${key}, t.id) ${before} (SELECT ${meKey}, me.id FROM ${meTable} me WHERE me.id = ${id})
    ORDER BY ${key} ${dirBefore}, t.id ${dirBefore} LIMIT 1`;
  const [next] = await db.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM ${source(s)} AND (${key}, t.id) ${after} (SELECT ${meKey}, me.id FROM ${meTable} me WHERE me.id = ${id})
    ORDER BY ${key} ${dirAfter}, t.id ${dirAfter} LIMIT 1`;
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}

/** The currencies' symbols and fraction units (a Currency column shows "€ 28,987.497"). */
export async function currencyDisplays(): Promise<Record<string, { symbol: string | null; fractionUnits: number | null }>> {
  const rows = await db.purchaseCurrency.findMany({ select: { code: true, symbol: true, fractionUnits: true } });
  return Object.fromEntries(rows.map((r) => [r.code, { symbol: r.symbol, fractionUnits: r.fractionUnits }]));
}

/** A Currency field's currency on a record (its options name the field holding it). */
export function currencyOfField(f: LayoutField, doc: Legacy, fallback: string): string {
  const opt = f.options ?? "";
  if (opt && !opt.includes(":") && typeof doc[opt] === "string" && doc[opt]) return doc[opt] as string;
  return fallback;
}

/** A record's page title: "<title> - <name>", or its name. */
export async function docTitle(s: DocScreen, id: string): Promise<string | null> {
  const l = layoutOf(s);
  const [r] = await db.$queryRaw<{ legacy: Legacy | null }[]>`SELECT t.legacy FROM ${source(s)} AND t.id = ${id} LIMIT 1`;
  if (!r) return null;
  const name = String(r.legacy?.name ?? "");
  const title = l.titleField ? String(r.legacy?.[l.titleField] ?? "") : "";
  return title && title !== name ? `${title} - ${name}` : name;
}
