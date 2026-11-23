// Purchase Receipts: the list and one receipt as its form held it (Phase II, owner 21-11-2026).
//
// The list is the old one: ID / Title / Company / Status filters, 20 / 100 / 500 / 2500 a page,
// newest posting date first (Thiru R's own list setting on the old site; ERPNext's default was
// Last Updated). A receipt is assembled as the old form's document — its fields and its child rows
// (items, taxes, the add-on's services) under their ERPNext fieldnames — from the imported rows,
// each typed by its captured layout. Takes the database client (pages pass server/db's).

import { Prisma, type PrismaClient } from "@prisma/client";
import { gstBreakupHtml } from "../doc/gst-breakup";
import { LAYOUTS } from "../doc/layouts";
import { typedDoc } from "../doc/values";

export const RECEIPT_PAGE_SIZES = [20, 100, 500, 2500] as const;
/** The Status filter's options, as the old field offered them. */
export const RECEIPT_STATUSES = ["Draft", "Partly Billed", "To Bill", "Completed", "Return Issued", "Cancelled", "Closed"] as const;

export interface ReceiptListQuery {
  id: string | null;
  title: string | null;
  company: string | null;
  status: string | null;
  pageSize: number;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 140) : null;
};

export function parseReceiptListQuery(sp: Params): ReceiptListQuery {
  const size = Number(one(sp.page_length));
  const page = Number(one(sp.page));
  const status = one(sp.status);
  return {
    id: one(sp.name),
    title: one(sp.title),
    company: one(sp.company),
    status: status && (RECEIPT_STATUSES as readonly string[]).includes(status) ? status : null,
    pageSize: (RECEIPT_PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function receiptListParams(q: ReceiptListQuery, over: Partial<ReceiptListQuery> = {}): URLSearchParams {
  const m = { ...q, ...over };
  const p = new URLSearchParams();
  if (m.id) p.set("name", m.id);
  if (m.title) p.set("title", m.title);
  if (m.company) p.set("company", m.company);
  if (m.status) p.set("status", m.status);
  if (m.pageSize !== 20) p.set("page_length", String(m.pageSize));
  if (m.page > 1) p.set("page", String(m.page));
  return p;
}

export interface ReceiptListRow {
  id: string;
  number: string;
  title: string | null;
  status: string;
  docStatus: "DRAFT" | "SUBMITTED" | "CANCELLED";
  postingDate: string;
  grandTotal: number;
  currency: string;
  gateEntryCode: string | null;
  updatedAt: Date;
  isReturn: boolean;
  perBilled: number;
  perReturned: number;
}

/** Frappe's "like %…%" on the ID and Title filters. */
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listReceipts(db: PrismaClient, q: ReceiptListQuery): Promise<{ rows: ReceiptListRow[]; total: number }> {
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q.id) where.push(Prisma.sql`r.number ILIKE ${like(q.id)}`);
  if (q.title) where.push(Prisma.sql`r.title ILIKE ${like(q.title)}`);
  if (q.company) where.push(Prisma.sql`r.company_code = ${q.company}`);
  if (q.status) where.push(Prisma.sql`r.status = ${q.status}`);
  const cond = Prisma.join(where, " AND ");
  const [{ n }] = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM purchase_receipts r WHERE ${cond}`;
  const rows = await db.$queryRaw<
    {
      id: string; number: string; title: string | null; status: string; doc_status: string; posting_date: string; grand_total: number;
      currency: string; gate_entry_code: string | null; updated_at: Date; is_return: string | null; per_billed: string | null; per_returned: string | null;
    }[]
  >`
    SELECT r.id, r.number, r.title, r.status, r.doc_status::text AS doc_status, to_char(r.posting_date, 'YYYY-MM-DD') AS posting_date,
           r.grand_total::float8 AS grand_total, r.currency, r.gate_entry_code, r.updated_at,
           r.legacy->>'is_return' AS is_return, r.legacy->>'per_billed' AS per_billed, r.legacy->>'per_returned' AS per_returned
    FROM purchase_receipts r
    WHERE ${cond}
    ORDER BY r.posting_date DESC, r.updated_at DESC
    LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
  const ds = { Draft: "DRAFT", Submitted: "SUBMITTED", Cancelled: "CANCELLED" } as const;
  return {
    total: n,
    rows: rows.map((r) => ({
      id: r.id, number: r.number, title: r.title, status: r.status, docStatus: ds[r.doc_status as keyof typeof ds] ?? "DRAFT",
      postingDate: r.posting_date, grandTotal: r.grand_total, currency: r.currency, gateEntryCode: r.gate_entry_code, updatedAt: r.updated_at,
      isReturn: Number(r.is_return ?? 0) === 1, perBilled: Number(r.per_billed ?? 0), perReturned: Number(r.per_returned ?? 0),
    })),
  };
}

type Legacy = Record<string, unknown>;
const rowsOf = (doctype: string, rows: { legacy: Prisma.JsonValue }[]) => {
  const layout = LAYOUTS[doctype];
  return rows.map((r) => (layout ? typedDoc(layout, (r.legacy ?? {}) as Legacy) : ((r.legacy ?? {}) as Legacy)));
};

/** One receipt as its form held it, with what its links open here. Null when there is no such receipt. */
export async function loadReceiptDoc(db: PrismaClient, id: string) {
  const r = await db.purchaseReceipt.findUnique({
    where: { id },
    include: {
      items: { orderBy: { idx: "asc" }, select: { legacy: true, itemCode: true, itemId: true, orderNumber: true, orderId: true } },
      taxes: { orderBy: { idx: "asc" }, select: { legacy: true } },
      serviceItems: { orderBy: { idx: "asc" }, select: { legacy: true } },
    },
  });
  if (!r) return null;
  const layout = LAYOUTS["Purchase Receipt"];
  const doc: Legacy = {
    ...typedDoc(layout, (r.legacy ?? {}) as Legacy),
    items: rowsOf("Purchase Receipt Item", r.items),
    taxes: rowsOf("Purchase Taxes and Charges", r.taxes),
    services_items: rowsOf("Services Items", r.serviceItems),
  };
  const company = await db.purchaseCompany.findUnique({ where: { code: r.companyCode }, select: { defaultCurrency: true } });
  // India Compliance built the GST Breakup each time the form loaded (never stored): the same here.
  // GST Settings › HSN-wise tax breakup was on; the tax amount's precision is the currency precision.
  const supplierAddressState =
    doc.gst_category === "Unregistered" && doc.supplier_address
      ? (await db.purchaseAddress.findUnique({ where: { code: String(doc.supplier_address) }, select: { gstStateNumber: true } }))?.gstStateNumber ?? null
      : null;
  doc.gst_breakup_table = gstBreakupHtml(doc, { hsnWise: true, precision: 3, supplierAddressState }) ?? doc.gst_breakup_table;
  // Purchase Taxes and Charges Template shows its title in links ("Input GST In-state", not its name).
  const template = r.taxesAndCharges
    ? await db.purchaseTaxTemplate.findUnique({ where: { code: r.taxesAndCharges }, select: { code: true, title: true } })
    : null;
  return {
    receipt: r,
    doc,
    companyCurrency: company?.defaultCurrency ?? "INR",
    linkTitles: new Map<string, string>(template ? [[`Purchase Taxes and Charges Template\u0000${template.code}`, template.title]] : []),
    ids: {
      supplier: r.supplierId,
      items: new Map(r.items.filter((i) => i.itemId).map((i) => [i.itemCode, i.itemId!])),
      orders: new Map(r.items.filter((i) => i.orderId && i.orderNumber).map((i) => [i.orderNumber!, i.orderId!])),
    },
  };
}

/**
 * The receipts before and after this one in the list's order (posting date, then last update), for
 * ‹ ›. Compared with the row's own stored values in SQL: a timestamp passed in from here would be
 * shifted by the database session's time zone.
 */
export async function adjacentReceipts(db: PrismaClient, id: string) {
  const [prev] = await db.$queryRaw<{ id: string }[]>`
    SELECT r.id FROM purchase_receipts r, (SELECT posting_date, updated_at, id FROM purchase_receipts WHERE id = ${id}) me
    WHERE (r.posting_date, r.updated_at, r.id) > (me.posting_date, me.updated_at, me.id)
    ORDER BY r.posting_date ASC, r.updated_at ASC, r.id ASC LIMIT 1`;
  const [next] = await db.$queryRaw<{ id: string }[]>`
    SELECT r.id FROM purchase_receipts r, (SELECT posting_date, updated_at, id FROM purchase_receipts WHERE id = ${id}) me
    WHERE (r.posting_date, r.updated_at, r.id) < (me.posting_date, me.updated_at, me.id)
    ORDER BY r.posting_date DESC, r.updated_at DESC, r.id DESC LIMIT 1`;
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}
