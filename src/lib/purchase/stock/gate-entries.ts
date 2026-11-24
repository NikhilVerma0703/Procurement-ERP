// Gate Entries: the list, one entry as its form holds it, and the PO lines a new entry lists
// (owner, 23-11-2026; the rules are stock/gate-entry-meta.ts). Server-side; takes the database
// client the page passes (server/db's).
//
// The list is the old one as Thiru R had it (captured 23-11-2026): ID, Status and Po No (the old
// list's four-column limit left Inward No, Supplier and Inward Date out), newest created first
// (his own sort: Created On), the ID filter, 20 / 100 / 500 / 2500 a page and "Load More", and the
// count as Frappe gave it ("20 of 1,000+").

import { Prisma, type PrismaClient } from "@prisma/client";
import { LAYOUTS } from "../doc/layouts";
import { typedDoc } from "../doc/values";
import { GATE_ENTRY, GATE_ENTRY_ITEM, poItemsOf, type GateEntryDocStatus, type PoItemRow } from "./gate-entry-meta";

export const GATE_ENTRY_PAGE_SIZES = [20, 100, 500, 2500] as const;

export interface GateEntryListQuery {
  /** The ID filter (Frappe's "name like %…%"). */
  name: string | null;
  pageLength: number;
  /** Rows shown: a page, plus a page for each Load More. */
  limit: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 140) : null;
};

export function parseGateEntryListQuery(sp: Params): GateEntryListQuery {
  const size = Number(one(sp.page_length));
  const pageLength = (GATE_ENTRY_PAGE_SIZES as readonly number[]).includes(size) ? size : 20;
  const limit = Number(one(sp.limit));
  return { name: one(sp.name), pageLength, limit: Number.isInteger(limit) && limit >= pageLength ? Math.min(limit, 10_000) : pageLength };
}

export function gateEntryListParams(q: GateEntryListQuery, over: Partial<GateEntryListQuery> = {}): URLSearchParams {
  const m = { ...q, ...over };
  const p = new URLSearchParams();
  if (m.name) p.set("name", m.name);
  if (m.pageLength !== 20) p.set("page_length", String(m.pageLength));
  if (m.limit !== m.pageLength) p.set("limit", String(m.limit));
  return p;
}

export interface GateEntryListRow {
  id: string;
  number: string;
  docStatus: GateEntryDocStatus;
  orderNumber: string;
  orderId: string | null;
  supplierCode: string;
  receiptNumber: string | null;
  updatedAt: Date;
}

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const DOC_STATUS = { Draft: "DRAFT", Submitted: "SUBMITTED", Cancelled: "CANCELLED" } as const;

export async function listGateEntries(db: PrismaClient, q: GateEntryListQuery): Promise<{ rows: GateEntryListRow[]; total: number }> {
  const where = q.name ? Prisma.sql`g.number ILIKE ${like(q.name)}` : Prisma.sql`TRUE`;
  const [{ n }] = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM purchase_gate_entries g WHERE ${where}`;
  const rows = await db.$queryRaw<
    { id: string; number: string; doc_status: string; order_number: string; order_id: string | null; supplier_code: string; receipt_number: string | null; updated_at: Date }[]
  >`
    SELECT g.id, g.number, g.doc_status::text AS doc_status, g.order_number, g.order_id, g.supplier_code, g.receipt_number, g.updated_at
    FROM purchase_gate_entries g
    WHERE ${where}
    ORDER BY g.created_at DESC, g.number DESC
    LIMIT ${q.limit}`;
  return {
    total: n,
    rows: rows.map((r) => ({
      id: r.id, number: r.number, docStatus: DOC_STATUS[r.doc_status as keyof typeof DOC_STATUS] ?? "DRAFT", orderNumber: r.order_number,
      orderId: r.order_id, supplierCode: r.supplier_code, receiptNumber: r.receipt_number, updatedAt: r.updated_at,
    })),
  };
}

/** One gate entry as its form held it (typed by the captured layouts), with what its links open here. */
export async function loadGateEntryDoc(db: PrismaClient, id: string) {
  const g = await db.purchaseGateEntry.findUnique({
    where: { id },
    include: {
      items: { orderBy: { idx: "asc" }, select: { id: true, legacy: true, itemId: true, itemCode: true } },
      amendments: { select: { id: true, number: true }, take: 1 },
      receipts: { where: { docStatus: { not: "CANCELLED" } }, select: { id: true, number: true, docStatus: true } },
    },
  });
  if (!g) return null;
  const receipt = g.receiptNumber ? await db.purchaseReceipt.findUnique({ where: { number: g.receiptNumber }, select: { id: true } }) : null;
  const doc: Record<string, unknown> = {
    ...typedDoc(LAYOUTS[GATE_ENTRY], (g.legacy ?? {}) as Record<string, unknown>),
    items: g.items.map((i) => typedDoc(LAYOUTS[GATE_ENTRY_ITEM], (i.legacy ?? {}) as Record<string, unknown>)),
  };
  return {
    entry: g,
    doc,
    ids: {
      order: g.orderId,
      supplier: g.supplierId,
      receipt: receipt?.id ?? null,
      items: new Map(g.items.filter((i) => i.itemId).map((i) => [i.itemCode, i.itemId!])),
    },
    /** An amendment already made from this (cancelled) entry: Frappe offered Amend only once. */
    amendment: g.amendments[0] ?? null,
    /** Receipts that name this gate entry (not cancelled). */
    receipts: g.receipts,
  };
}

/** The entries before and after this one in the list's order (creation, newest first). */
export async function adjacentGateEntries(db: PrismaClient, id: string) {
  const [prev] = await db.$queryRaw<{ id: string }[]>`
    SELECT g.id FROM purchase_gate_entries g, (SELECT created_at, number FROM purchase_gate_entries WHERE id = ${id}) me
    WHERE (g.created_at, g.number) > (me.created_at, me.number) ORDER BY g.created_at ASC, g.number ASC LIMIT 1`;
  const [next] = await db.$queryRaw<{ id: string }[]>`
    SELECT g.id FROM purchase_gate_entries g, (SELECT created_at, number FROM purchase_gate_entries WHERE id = ${id}) me
    WHERE (g.created_at, g.number) < (me.created_at, me.number) ORDER BY g.created_at DESC, g.number DESC LIMIT 1`;
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}

const n = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));

/**
 * The add-on's po_items for a PO, and the PO's fields the form fetches (supplier, date) — or null
 * when there is no such PO. Which POs may be chosen is the picker's rule (gateEntryOrderOk).
 */
export async function poForGateEntry(db: PrismaClient | Prisma.TransactionClient, orderNumber: string): Promise<{
  order: { id: string; number: string; supplierCode: string; transactionDate: string; docStatus: string; status: string; perReceived: number };
  items: PoItemRow[];
} | null> {
  const o = await db.purchaseOrder.findUnique({
    where: { number: orderNumber },
    select: {
      id: true, number: true, transactionDate: true, docStatus: true, status: true, perReceived: true, supplier: { select: { code: true } },
      items: { select: { id: true, erpnextName: true, itemCode: true, itemName: true, description: true, uom: true, qty: true, receivedQty: true } },
    },
  });
  if (!o) return null;
  return {
    order: {
      id: o.id, number: o.number, supplierCode: o.supplier.code, transactionDate: o.transactionDate.toISOString().slice(0, 10),
      docStatus: o.docStatus, status: o.status, perReceived: n(o.perReceived),
    },
    items: poItemsOf(o.items.map((i) => ({ name: i.erpnextName ?? i.id, itemCode: i.itemCode, itemName: i.itemName, description: i.description, uom: i.uom, qty: n(i.qty), receivedQty: n(i.receivedQty) }))),
  };
}

/** The PO picker's filter (the add-on's set_query): submitted, not Closed, less than 99 % received. */
export const gateEntryOrderOk = (o: { docStatus: string; status: string; perReceived: number }) =>
  o.docStatus === "SUBMITTED" && o.status !== "CLOSED" && o.perReceived < 99;
