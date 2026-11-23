// The stock ledger as the reports read it, from the imported books (Phase II, owner 21-11-2026).
//
// ERPNext's report queries (stock_balance.py prepare_stock_ledger_entries, stock_ledger.py
// get_stock_ledger_entries): entries not cancelled (is_cancelled = 0 AND docstatus < 2 — one 2024
// entry is cancelled only by its docstatus), of items that exist (an inner join with Item),
// of the company, up to the date — in the ledger's order, the posting instant then the creation
// time. A warehouse filter takes the warehouse and everything under it, an item group its
// sub-groups. The figures come as doubles (Postgres float8, correctly rounded from numeric — what
// Python's float(Decimal) gave the old site).
//
// Takes the database client: pages pass server/db's, scripts their own.

import { Prisma, type PrismaClient } from "@prisma/client";
import { receiptPath } from "../routes";
import type { ItemDetail, LedgerEntry, OpeningVouchers } from "./reports";

export interface LedgerFilters {
  company?: string | null;
  fromDate?: string | null;
  toDate: string;
  itemCode?: string | null;
  itemGroup?: string | null;
  warehouse?: string | null;
  batchNo?: string | null;
  voucherNo?: string | null;
}

/** A warehouse (or item group) and every one below it, by ERPNext name. */
async function subtree(db: PrismaClient, table: "purchase_warehouses" | "purchase_item_groups", root: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ code: string; parent: string | null }[]>(
    `SELECT code, parent_code AS parent FROM ${table}`,
  );
  const children = new Map<string, string[]>();
  for (const r of rows) if (r.parent) children.set(r.parent, [...(children.get(r.parent) ?? []), r.code]);
  const out: string[] = [];
  const walk = (c: string) => {
    out.push(c);
    for (const k of children.get(c) ?? []) walk(k);
  };
  walk(root);
  return out;
}

export async function loadLedger(db: PrismaClient, f: LedgerFilters): Promise<LedgerEntry[]> {
  const where: Prisma.Sql[] = [
    Prisma.sql`NOT s.is_cancelled`,
    Prisma.sql`s.doc_status <> 'Cancelled'`,
    Prisma.sql`s.posting_date <= ${f.toDate}::date`,
  ];
  if (f.fromDate) where.push(Prisma.sql`s.posting_date >= ${f.fromDate}::date`);
  if (f.company) where.push(Prisma.sql`s.company_code = ${f.company}`);
  if (f.itemCode) where.push(Prisma.sql`s.item_code = ${f.itemCode}`);
  if (f.batchNo) where.push(Prisma.sql`s.batch_no = ${f.batchNo}`);
  if (f.voucherNo) where.push(Prisma.sql`s.voucher_no = ${f.voucherNo}`);
  if (f.warehouse) where.push(Prisma.sql`s.warehouse_code IN (${Prisma.join(await subtree(db, "purchase_warehouses", f.warehouse))})`);
  if (f.itemGroup) where.push(Prisma.sql`ig.code IN (${Prisma.join(await subtree(db, "purchase_item_groups", f.itemGroup))})`);
  const rows = await db.$queryRaw<
    {
      item_code: string; warehouse_code: string; posting_date: string; posting_time: string; date: string | null; company_code: string;
      voucher_type: string; voucher_no: string; actual_qty: number; qty_after_transaction: number; incoming_rate: number;
      valuation_rate: number; stock_value: number; stock_value_difference: number; batch_no: string | null; serial_no: string | null;
    }[]
  >`
    SELECT s.item_code, s.warehouse_code, to_char(s.posting_date, 'YYYY-MM-DD') AS posting_date, s.posting_time,
           s.legacy->>'posting_datetime' AS date, s.company_code, s.voucher_type, s.voucher_no,
           s.actual_qty::float8 AS actual_qty, s.qty_after_transaction::float8 AS qty_after_transaction,
           s.incoming_rate::float8 AS incoming_rate, s.valuation_rate::float8 AS valuation_rate,
           s.stock_value::float8 AS stock_value, s.stock_value_difference::float8 AS stock_value_difference,
           s.batch_no, s.serial_no
    FROM purchase_stock_ledger_entries s
    JOIN purchase_items i ON i.id = s.item_id
    LEFT JOIN purchase_item_groups ig ON ig.id = i.item_group_id
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY s.posting_date_time, s.created_at`;
  return rows.map((r) => ({
    itemCode: r.item_code, warehouse: r.warehouse_code, postingDate: r.posting_date, postingTime: r.posting_time,
    date: r.date ?? `${r.posting_date} ${r.posting_time}`, company: r.company_code, voucherType: r.voucher_type, voucherNo: r.voucher_no,
    actualQty: r.actual_qty, qtyAfterTransaction: r.qty_after_transaction, incomingRate: r.incoming_rate, valuationRate: r.valuation_rate,
    stockValue: r.stock_value, stockValueDifference: r.stock_value_difference, batchNo: r.batch_no, serialNo: r.serial_no,
  }));
}

/** The items' names, groups, units, brands and descriptions, for the reports' columns. */
export async function loadItemDetails(db: PrismaClient, codes: Iterable<string>): Promise<Map<string, ItemDetail>> {
  const list = [...new Set(codes)];
  const out = new Map<string, ItemDetail>();
  for (let i = 0; i < list.length; i += 5000) {
    const rows = await db.purchaseItem.findMany({
      where: { code: { in: list.slice(i, i + 5000) } },
      select: { id: true, code: true, itemName: true, stockUom: true, brand: true, description: true, itemGroup: { select: { code: true } } },
    });
    for (const r of rows) {
      out.set(r.code, { id: r.id, itemName: r.itemName, itemGroup: r.itemGroup?.code ?? null, stockUom: r.stockUom, brand: r.brand, description: r.description });
    }
  }
  return out;
}

/**
 * The pages the ledger's vouchers open here, by voucher number: Purchase Receipts so far (a voucher
 * type without screens here yet opens nothing).
 */
/** The key voucherPages uses: voucher type and number. */
export const voucherKey = (type: string, no: string) => `${type}|${no}`;

export async function voucherPages(db: PrismaClient, entries: readonly { voucherType: string; voucherNo: string }[]): Promise<Map<string, string>> {
  const receipts = [...new Set(entries.filter((e) => e.voucherType === "Purchase Receipt").map((e) => e.voucherNo))];
  const out = new Map<string, string>();
  for (let i = 0; i < receipts.length; i += 5000) {
    const rows = await db.purchaseReceipt.findMany({ where: { number: { in: receipts.slice(i, i + 5000) } }, select: { id: true, number: true } });
    for (const r of rows) out.set(voucherKey("Purchase Receipt", r.number), receiptPath(r.id));
  }
  return out;
}

/** Submitted opening vouchers up to the date (StockBalanceReport.get_opening_vouchers). */
export async function loadOpeningVouchers(db: PrismaClient, toDate: string): Promise<OpeningVouchers> {
  const upto = new Date(`${toDate}T00:00:00Z`);
  const [se, sr] = await Promise.all([
    db.purchaseStockEntry.findMany({ where: { docStatus: "SUBMITTED", isOpening: "Yes", postingDate: { lte: upto } }, select: { number: true } }),
    db.purchaseStockReconciliation.findMany({ where: { docStatus: "SUBMITTED", purpose: "Opening Stock", postingDate: { lte: upto } }, select: { number: true } }),
  ]);
  return { stockEntries: new Set(se.map((x) => x.number)), stockReconciliations: new Set(sr.map((x) => x.number)) };
}

/**
 * The Stock Ledger's "'Opening'" row (stock_ledger.py get_opening_balance → get_previous_sle): the
 * item's last entry in the warehouse (or under it) before the From Date.
 */
export async function loadPreviousEntry(
  db: PrismaClient,
  itemCode: string,
  warehouse: string,
  fromDate: string,
): Promise<{ qtyAfterTransaction: number; valuationRate: number; stockValue: number } | null> {
  const warehouses = await subtree(db, "purchase_warehouses", warehouse);
  const [row] = await db.$queryRaw<{ q: number; v: number; s: number }[]>`
    SELECT qty_after_transaction::float8 AS q, valuation_rate::float8 AS v, stock_value::float8 AS s
    FROM purchase_stock_ledger_entries
    WHERE item_code = ${itemCode} AND warehouse_code IN (${Prisma.join(warehouses)})
      AND NOT is_cancelled AND doc_status <> 'Cancelled' AND posting_date < ${fromDate}::date
    ORDER BY posting_date_time DESC, created_at DESC
    LIMIT 1`;
  return row ? { qtyAfterTransaction: row.q, valuationRate: row.v, stockValue: row.s } : null;
}

/** The company the stock books are kept for (the reports' default): the one with the most entries. */
export async function defaultStockCompany(db: PrismaClient): Promise<string> {
  const [top] = await db.$queryRaw<{ c: string }[]>`
    SELECT company_code AS c FROM purchase_stock_ledger_entries GROUP BY company_code ORDER BY COUNT(*) DESC LIMIT 1`;
  if (top) return top.c;
  const first = await db.purchaseCompany.findFirst({ orderBy: { code: "asc" }, select: { code: true } });
  return first?.code ?? "";
}
