// The records behind the five further Stock Reports (stock/reports-more.ts), read as ERPNext 14.92's
// report queries read them: Bins, ledger entries, Item Prices, warehouses (owner, 24-11-2026).
// Server only.

import { Prisma, type PrismaClient } from "@prisma/client";
import { siteToday } from "../format";
import { oldDbCompare } from "./collation";
import type { AgeingEntry, AgeingItem, PriceForStock, ProjectedBin, ProjectedItem, SummaryBin, SummarySort, WarehouseForBalance } from "./reports-more";


/** A warehouse (or item group) and every one below it (the reports' lft/rgt conditions). */
async function subtree(db: PrismaClient, table: "purchase_warehouses" | "purchase_item_groups", root: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ code: string; parent: string | null }[]>(`SELECT code, parent_code AS parent FROM ${table}`);
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

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

// --- Stock Projected Qty --------------------------------------------------------------------------

export async function loadProjectedQty(db: PrismaClient, f: { itemCode?: string | null; warehouse?: string | null }): Promise<{ bins: ProjectedBin[]; items: Map<string, ProjectedItem> }> {
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.itemCode) where.push(Prisma.sql`b.item_code = ${f.itemCode}`);
  if (f.warehouse) where.push(Prisma.sql`b.warehouse_code IN (${Prisma.join(await subtree(db, "purchase_warehouses", f.warehouse))})`);
  const bins = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT b.item_code, b.warehouse_code, c.code AS company, b.actual_qty::float8 AS actual_qty, b.planned_qty::float8 AS planned_qty,
           b.indented_qty::float8 AS indented_qty, b.ordered_qty::float8 AS ordered_qty, b.reserved_qty::float8 AS reserved_qty,
           b.reserved_qty_for_production::float8 AS rqp, b.reserved_qty_for_production_plan::float8 AS rqpp,
           b.reserved_qty_for_sub_contract::float8 AS rqsc, b.projected_qty::float8 AS projected_qty
    FROM purchase_bins b
    LEFT JOIN purchase_warehouses w ON w.code = b.warehouse_code
    LEFT JOIN purchase_companies c ON c.id = w.company_id
    WHERE ${Prisma.join(where, " AND ")}`;
  const today = new Date(`${siteToday()}T00:00:00Z`);
  const items = await db.purchaseItem.findMany({
    where: {
      isStockItem: true, disabled: false, OR: [{ endOfLife: null }, { endOfLife: { gt: today } }], bins: { some: {} },
      ...(f.itemCode ? { code: f.itemCode } : {}),
    },
    select: { code: true, itemName: true, description: true, brand: true, stockUom: true, itemGroup: { select: { code: true } } },
  });
  const map = new Map<string, ProjectedItem>(
    items.map((i) => [i.code, { name: i.code, itemName: i.itemName, description: i.description, itemGroup: i.itemGroup?.code ?? null, brand: i.brand, stockUom: i.stockUom, reorderLevels: [] }]),
  );
  const list: ProjectedBin[] = bins.map((b) => ({
    itemCode: String(b.item_code), warehouse: String(b.warehouse_code), company: (b.company as string) ?? null,
    actualQty: n(b.actual_qty), plannedQty: n(b.planned_qty), indentedQty: n(b.indented_qty), orderedQty: n(b.ordered_qty), reservedQty: n(b.reserved_qty),
    reservedQtyForProduction: n(b.rqp), reservedQtyForProductionPlan: n(b.rqpp), reservedQtyForSubContract: n(b.rqsc), projectedQty: n(b.projected_qty),
  }));
  // ORDER BY item_code, warehouse — in the old database's collation.
  list.sort((a, b) => oldDbCompare(a.itemCode, b.itemCode) || oldDbCompare(a.warehouse, b.warehouse));
  return { bins: list, items: map };
}

// --- Stock Ageing ---------------------------------------------------------------------------------

export async function loadAgeing(
  db: PrismaClient,
  f: { company: string; toDate: string; warehouse?: string | null; itemCode?: string | null; brand?: string | null },
): Promise<{ entries: AgeingEntry[]; items: Map<string, AgeingItem> }> {
  // The report's own conditions: the company, up to the date, not cancelled (is_cancelled only).
  const where: Prisma.Sql[] = [Prisma.sql`NOT s.is_cancelled`, Prisma.sql`s.company_code = ${f.company}`, Prisma.sql`s.posting_date <= ${f.toDate}::date`];
  if (f.itemCode) where.push(Prisma.sql`s.item_code = ${f.itemCode}`);
  if (f.brand) where.push(Prisma.sql`i.brand = ${f.brand}`);
  if (f.warehouse) where.push(Prisma.sql`s.warehouse_code IN (${Prisma.join(await subtree(db, "purchase_warehouses", f.warehouse))})`);
  const rows = await db.$queryRaw<{ item_code: string; warehouse_code: string; posting_date: string; voucher_type: string; voucher_no: string; actual_qty: number; qty_after_transaction: number; serial_no: string | null }[]>`
    SELECT s.item_code, s.warehouse_code, to_char(s.posting_date, 'YYYY-MM-DD') AS posting_date, s.voucher_type, s.voucher_no,
           s.actual_qty::float8 AS actual_qty, s.qty_after_transaction::float8 AS qty_after_transaction, s.serial_no
    FROM purchase_stock_ledger_entries s
    JOIN purchase_items i ON i.code = s.item_code
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY s.posting_date_time, s.legacy->>'creation', s.actual_qty`;
  const codes = [...new Set(rows.map((r) => r.item_code))];
  const items = new Map<string, AgeingItem>();
  for (let i = 0; i < codes.length; i += 5000) {
    const found = await db.purchaseItem.findMany({
      where: { code: { in: codes.slice(i, i + 5000) } },
      select: { code: true, itemName: true, description: true, brand: true, stockUom: true, hasSerialNo: true, itemGroup: { select: { code: true } } },
    });
    for (const r of found) items.set(r.code, { itemName: r.itemName, description: r.description, itemGroup: r.itemGroup?.code ?? null, brand: r.brand, stockUom: r.stockUom, hasSerialNo: r.hasSerialNo });
  }
  return {
    entries: rows.map((r) => ({
      itemCode: r.item_code, warehouse: r.warehouse_code, postingDate: r.posting_date, voucherType: r.voucher_type, voucherNo: r.voucher_no,
      actualQty: r.actual_qty, qtyAfterTransaction: r.qty_after_transaction, serialNo: r.serial_no,
    })),
    items,
  };
}

// --- Item Price Stock -----------------------------------------------------------------------------

export async function loadItemPriceStock(db: PrismaClient, f: { itemCode?: string | null }): Promise<{ prices: PriceForStock[]; bins: Map<string, { warehouse: string; actualQty: number }[]> }> {
  const prices = await db.$queryRaw<{ name: string; item_code: string; item_name: string | null; brand: string | null; price_list: string; rate: number; buying: boolean; selling: boolean }[]>`
    SELECT erpnext_name AS name, item_code, item_name, NULLIF(legacy->>'brand', '') AS brand, price_list_code AS price_list,
           price_list_rate::float8 AS rate, buying, selling
    FROM purchase_item_prices ${f.itemCode ? Prisma.sql`WHERE item_code = ${f.itemCode}` : Prisma.empty}`;
  const codes = [...new Set(prices.map((p) => p.item_code))];
  const bins = new Map<string, { warehouse: string; actualQty: number }[]>();
  if (codes.length) {
    // An item's Bins came through its (item_code, warehouse) index: by warehouse.
    const rows = (await db.$queryRaw<{ item_code: string; warehouse_code: string; actual_qty: number }[]>`
      SELECT item_code, warehouse_code, actual_qty::float8 AS actual_qty FROM purchase_bins
      WHERE item_code IN (${Prisma.join(codes)})`).sort((a, b) => oldDbCompare(a.warehouse_code, b.warehouse_code));
    for (const r of rows) {
      if (!bins.has(r.item_code)) bins.set(r.item_code, []);
      bins.get(r.item_code)!.push({ warehouse: r.warehouse_code, actualQty: r.actual_qty });
    }
  }
  return {
    prices: prices.map((p) => ({ name: p.name, itemCode: p.item_code, itemName: p.item_name, brand: p.brand, priceList: p.price_list, rate: p.rate, buying: p.buying, selling: p.selling })),
    bins,
  };
}

// --- Warehouse Wise Stock Balance -----------------------------------------------------------------

export async function loadWarehouseBalance(db: PrismaClient, f: { company: string; showDisabled: boolean }): Promise<{ warehouses: WarehouseForBalance[]; balance: Map<string, number> }> {
  const ws = await db.$queryRaw<{ code: string; parent_code: string | null; is_group: boolean; disabled: boolean; lft: string | null }[]>`
    SELECT w.code, w.parent_code, w.is_group, w.disabled, w.legacy->>'lft' AS lft
    FROM purchase_warehouses w JOIN purchase_companies c ON c.id = w.company_id
    WHERE c.code = ${f.company} ${f.showDisabled ? Prisma.empty : Prisma.sql`AND NOT w.disabled`}`;
  ws.sort((a, b) => n(a.lft) - n(b.lft));
  const sums = await db.$queryRaw<{ warehouse_code: string; v: number }[]>`
    SELECT warehouse_code, SUM(stock_value_difference)::float8 AS v FROM purchase_stock_ledger_entries
    WHERE doc_status <> 'Cancelled' AND NOT is_cancelled AND company_code = ${f.company}
    GROUP BY warehouse_code`;
  return {
    warehouses: ws.map((w) => ({ name: w.code, parent: w.parent_code, isGroup: w.is_group, disabled: w.disabled })),
    balance: new Map(sums.map((s) => [s.warehouse_code, s.v])),
  };
}

// --- Stock Summary --------------------------------------------------------------------------------

const SORT_COLUMNS: Record<SummarySort, string> = {
  projected_qty: "projected_qty",
  reserved_qty: "reserved_qty",
  reserved_qty_for_production: "reserved_qty_for_production",
  reserved_qty_for_sub_contract: "reserved_qty_for_sub_contract",
  actual_qty: "actual_qty",
};

/** item_dashboard.get_data: a page of Bins with anything in them (21 read, 20 shown, More past that). */
export async function loadSummary(
  db: PrismaClient,
  f: { itemCode?: string | null; warehouse?: string | null; itemGroup?: string | null; sort: SummarySort; order: "asc" | "desc"; start: number; length: number },
): Promise<SummaryBin[]> {
  const where: Prisma.Sql[] = [
    Prisma.sql`(b.projected_qty <> 0 OR b.reserved_qty <> 0 OR b.reserved_qty_for_production <> 0 OR b.reserved_qty_for_sub_contract <> 0 OR b.actual_qty <> 0)`,
  ];
  if (f.itemCode) where.push(Prisma.sql`b.item_code = ${f.itemCode}`);
  if (f.warehouse) where.push(Prisma.sql`b.warehouse_code = ${f.warehouse}`);
  if (f.itemGroup) where.push(Prisma.sql`ig.code IN (${Prisma.join(await subtree(db, "purchase_item_groups", f.itemGroup))})`);
  const col = Prisma.raw(`b.${SORT_COLUMNS[f.sort]}`);
  const dir = Prisma.raw(f.order === "asc" ? "ASC" : "DESC");
  const rows = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT b.item_code, i.item_name, b.warehouse_code, b.projected_qty::float8 AS projected_qty, b.reserved_qty::float8 AS reserved_qty,
           b.reserved_qty_for_production::float8 AS rqp, b.reserved_qty_for_sub_contract::float8 AS rqsc, b.actual_qty::float8 AS actual_qty
    FROM purchase_bins b
    LEFT JOIN purchase_items i ON i.code = b.item_code
    LEFT JOIN purchase_item_groups ig ON ig.id = i.item_group_id
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${col} ${dir}, b.erpnext_name
    LIMIT ${f.length} OFFSET ${f.start}`;
  return rows.map((r) => ({
    itemCode: String(r.item_code), itemName: String(r.item_name ?? r.item_code), warehouse: String(r.warehouse_code),
    projectedQty: n(r.projected_qty), reservedQty: n(r.reserved_qty), reservedQtyForProduction: n(r.rqp), reservedQtyForSubContract: n(r.rqsc), actualQty: n(r.actual_qty),
  }));
}
