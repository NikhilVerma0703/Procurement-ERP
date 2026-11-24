// Gate Entries: one entry as its form holds it, the entries around it, and the PO lines a new entry
// lists (owner, 23-11-2026; the rules are stock/gate-entry-meta.ts). Server-side; takes the database
// client the page passes (server/db's). The list is the old list view of every DocType since
// 24-11-2026 (doc/list-view.ts, doc/screens.ts GATE_ENTRY_SCREEN).

import { Prisma, type PrismaClient } from "@prisma/client";
import { LAYOUTS } from "../doc/layouts";
import { typedDoc } from "../doc/values";
import { GATE_ENTRY, GATE_ENTRY_ITEM, poItemsOf, type PoItemRow } from "./gate-entry-meta";

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
