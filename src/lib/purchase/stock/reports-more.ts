// Stock › Stock Reports, the five after Stock Ledger and Stock Balance (owner, 24-11-2026: "make all
// these remainings"): ERPNext 14.92's own report code, ported — Stock Projected Qty, Stock Ageing,
// Item Price Stock, Warehouse Wise Stock Balance, and the Stock Summary page's item dashboard.
// `npm run golden:stock` holds each to the old site's own answers (live-stock-reports-20261124.json).
// Pure: the pages load the records (stock/reports-more-data.ts) and call these.

import { flt } from "../calc/pymath";
import { FLOAT_PRECISION } from "./reports";

// ---------------------------------------------------------------------------------------------
// Stock Projected Qty (stock_projected_qty.py): one row per Bin of a stock item that is enabled and
// not past its end of life, ordered by item code and warehouse; the reorder level of the item for
// that warehouse, and the shortage under it.

export interface ProjectedBin {
  itemCode: string;
  warehouse: string;
  /** The warehouse's company. */
  company: string | null;
  actualQty: number;
  plannedQty: number;
  indentedQty: number;
  orderedQty: number;
  reservedQty: number;
  reservedQtyForProduction: number;
  reservedQtyForProductionPlan: number;
  reservedQtyForSubContract: number;
  projectedQty: number;
}

export interface ProjectedItem {
  name: string;
  itemName: string;
  description: string | null;
  itemGroup: string | null;
  brand: string | null;
  stockUom: string | null;
  /** Item Reorder rows (none on the old site). */
  reorderLevels: { warehouse: string; level: number; qty: number }[];
}

export interface ProjectedQtyRow {
  itemCode: string;
  itemName: string;
  description: string | null;
  itemGroup: string | null;
  brand: string | null;
  warehouse: string;
  stockUom: string | null;
  actualQty: number;
  plannedQty: number;
  indentedQty: number;
  orderedQty: number;
  reservedQty: number;
  reservedQtyForProduction: number;
  reservedQtyForProductionPlan: number;
  reservedQtyForSubContract: number;
  reservedQtyForPos: number;
  projectedQty: number;
  reOrderLevel: number;
  reOrderQty: number;
  shortageQty: number;
}

export function stockProjectedQty(
  bins: readonly ProjectedBin[],
  items: ReadonlyMap<string, ProjectedItem>,
  f: { company?: string | null; brand?: string | null; itemGroup?: string | null },
): ProjectedQtyRow[] {
  const out: ProjectedQtyRow[] = [];
  for (const bin of bins) {
    const item = items.get(bin.itemCode);
    if (!item) continue; // likely an item that has reached its end of life
    if (f.brand && f.brand !== item.brand) continue;
    else if (f.itemGroup && f.itemGroup !== item.itemGroup) continue;
    else if (f.company && f.company !== bin.company) continue;
    let level = 0;
    let qty = 0;
    for (const d of item.reorderLevels) {
      if (d.warehouse === bin.warehouse) {
        level = d.level;
        qty = d.qty;
      }
    }
    const shortage = (level || qty) && level > bin.projectedQty ? level - bin.projectedQty : 0;
    out.push({
      itemCode: item.name, itemName: item.itemName, description: item.description, itemGroup: item.itemGroup, brand: item.brand,
      warehouse: bin.warehouse, stockUom: item.stockUom, actualQty: bin.actualQty, plannedQty: bin.plannedQty, indentedQty: bin.indentedQty,
      orderedQty: bin.orderedQty, reservedQty: bin.reservedQty, reservedQtyForProduction: bin.reservedQtyForProduction,
      reservedQtyForProductionPlan: bin.reservedQtyForProductionPlan, reservedQtyForSubContract: bin.reservedQtyForSubContract,
      // No POS invoice was ever made: nothing reserved for one.
      reservedQtyForPos: 0, projectedQty: bin.projectedQty, reOrderLevel: level, reOrderQty: qty, shortageQty: shortage,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Stock Ageing (stock_ageing.py, FIFOSlots): the stock still held, in FIFO slots dated by when it
// came in, aged on the "As On" date; ranges 0–30, 31–60, 61–90, 91+ by default. The rows end up
// sorted by Average Age, oldest first (get_chart_data sorted the report's own list in place).

export interface AgeingEntry {
  itemCode: string;
  warehouse: string;
  postingDate: string;
  voucherType: string;
  voucherNo: string;
  actualQty: number;
  qtyAfterTransaction: number;
  serialNo: string | null;
}

export interface AgeingItem {
  itemName: string;
  description: string | null;
  itemGroup: string | null;
  brand: string | null;
  stockUom: string | null;
  hasSerialNo: boolean;
}

export interface AgeingRow {
  itemCode: string;
  itemName: string;
  description: string | null;
  itemGroup: string | null;
  brand: string | null;
  warehouse?: string;
  qty: number;
  averageAge: number;
  range1: number;
  range2: number;
  range3: number;
  range4: number;
  earliest: number;
  latest: number;
  uom: string | null;
}

export interface AgeingFilters {
  toDate: string;
  range1: number;
  range2: number;
  range3: number;
  showWarehouseWise: boolean;
}

type Slot = [number | string, string | null];

/** Days from a date to another (frappe.utils.date_diff). */
export function dateDiff(to: string, from: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

const serialsOf = (s: string | null) => (s ? s.split("\n").map((x) => x.trim()).filter(Boolean) : []);

interface Bucket {
  itemCode: string;
  warehouse: string;
  fifo: Slot[];
  qtyAfterTransaction: number;
  totalQty: number | null;
  hasSerialNo: boolean;
}

/** FIFOSlots.generate: the slots of every item (and warehouse), entries in ledger order. */
export function fifoSlots(entries: readonly AgeingEntry[], items: ReadonlyMap<string, AgeingItem>, showWarehouseWise: boolean): Bucket[] {
  const buckets = new Map<string, Bucket>();
  const transferred = new Map<string, Slot[]>();
  const serialDates = new Map<string, string>();
  for (const d of entries) {
    const item = items.get(d.itemCode);
    if (!item) continue;
    const key = `${d.itemCode}\u0000${d.warehouse}`;
    let b = buckets.get(key);
    if (!b) {
      b = { itemCode: d.itemCode, warehouse: d.warehouse, fifo: [], qtyAfterTransaction: 0, totalQty: null, hasSerialNo: item.hasSerialNo };
      buckets.set(key, b);
    }
    const tkey = `${d.voucherNo}\u0000${d.itemCode}\u0000${d.warehouse}`;
    if (!transferred.has(tkey)) transferred.set(tkey, []);
    const fifo = b.fifo;
    let actual = d.actualQty;
    // A reconciliation's change is the difference in the balance it set.
    if (d.voucherType === "Stock Reconciliation") actual = d.qtyAfterTransaction - b.qtyAfterTransaction;
    const serials = serialsOf(d.serialNo);
    if (actual > 0) {
      const data = transferred.get(tkey)!;
      if (data.length) {
        // Inward and outward in the same voucher, item and warehouse: what went out comes back first.
        let left = actual;
        const add = (slot: Slot) => {
          if (fifo.length && flt(Number(fifo[0][0]) || 0) <= 0) {
            fifo[0][0] = (Number(fifo[0][0]) || 0) + (Number(slot[0]) || 0);
            fifo[0][1] = slot[1];
          } else fifo.push(slot);
        };
        while (left) {
          const first = data[0];
          if (first && 0 < (first[0] as number) && (first[0] as number) <= left) {
            left -= first[0] as number;
            add(data.shift()!);
          } else if (!first) {
            add([left, d.postingDate]);
            left = 0;
          } else {
            first[0] = (first[0] as number) - left;
            add([left, first[1]]);
            left = 0;
          }
        }
      } else if (!serials.length && !b.hasSerialNo) {
        if (fifo.length && flt(Number(fifo[0][0]) || 0) <= 0) {
          fifo[0][0] = (Number(fifo[0][0]) || 0) + actual;
          fifo[0][1] = d.postingDate;
        } else fifo.push([actual, d.postingDate]);
      } else {
        for (const sn of serials) {
          const known = serialDates.get(sn);
          if (known) fifo.push([sn, known]);
          else {
            serialDates.set(sn, d.postingDate);
            fifo.push([sn, d.postingDate]);
          }
        }
      }
    } else if (serials.length) {
      const gone = new Set(serials);
      const kept = fifo.filter((s) => !gone.has(String(s[0])));
      fifo.splice(0, fifo.length, ...kept);
    } else {
      let pop = Math.abs(actual);
      const data = transferred.get(tkey)!;
      while (pop) {
        const slot: Slot = fifo.length ? fifo[0] : [0, null];
        const q = Number(slot[0]) || 0;
        if (0 < q && q <= pop) {
          pop -= q;
          data.push(fifo.shift()!);
        } else if (!fifo.length) {
          fifo.push([-pop, d.postingDate]);
          data.push([pop, d.postingDate]);
          pop = 0;
        } else {
          slot[0] = q - pop;
          data.push([pop, slot[1]]);
          pop = 0;
        }
      }
    }
    b.qtyAfterTransaction = d.qtyAfterTransaction;
    b.totalQty = b.totalQty === null ? actual : b.totalQty + actual;
  }
  const list = [...buckets.values()];
  if (showWarehouseWise) return list;
  // (Item 1, WH 1), (Item 1, WH 2) → Item 1, in the order items first appeared.
  const byItem = new Map<string, Bucket>();
  for (const b of list) {
    const x = byItem.get(b.itemCode);
    if (!x) byItem.set(b.itemCode, { ...b, fifo: [...b.fifo], totalQty: b.totalQty ?? 0, qtyAfterTransaction: b.qtyAfterTransaction });
    else {
      x.fifo.push(...b.fifo);
      x.qtyAfterTransaction += b.qtyAfterTransaction;
      x.totalQty = (x.totalQty ?? 0) + (b.totalQty ?? 0);
      x.hasSerialNo = b.hasSerialNo;
    }
  }
  return [...byItem.values()];
}

export function stockAgeing(entries: readonly AgeingEntry[], items: ReadonlyMap<string, AgeingItem>, f: AgeingFilters): { rows: AgeingRow[]; chart: { labels: string[]; values: number[] } | null } {
  const rows: AgeingRow[] = [];
  for (const b of fifoSlots(entries, items, f.showWarehouseWise)) {
    if (!flt(b.totalQty ?? 0, FLOAT_PRECISION)) continue;
    const fifo = b.fifo.filter((s) => s[1]).sort((a, c) => (a[1]! < c[1]! ? -1 : a[1]! > c[1]! ? 1 : 0));
    if (!fifo.length) continue;
    let ageQty = 0;
    let total = 0;
    for (const s of fifo) {
      const age = dateDiff(f.toDate, s[1]!);
      if (typeof s[0] === "number") {
        ageQty += age * s[0];
        total += s[0];
      } else {
        ageQty += age;
        total += 1;
      }
    }
    const averageAge = total ? flt(ageQty / total, 2) : 0;
    let r1 = 0;
    let r2 = 0;
    let r3 = 0;
    let r4 = 0;
    for (const s of fifo) {
      const age = dateDiff(f.toDate, s[1]!);
      const qty = b.hasSerialNo ? 1 : Number(s[0]) || 0;
      if (age <= f.range1) r1 = flt(r1 + qty, FLOAT_PRECISION);
      else if (age <= f.range2) r2 = flt(r2 + qty, FLOAT_PRECISION);
      else if (age <= f.range3) r3 = flt(r3 + qty, FLOAT_PRECISION);
      else r4 = flt(r4 + qty, FLOAT_PRECISION);
    }
    const item = items.get(b.itemCode)!;
    rows.push({
      itemCode: b.itemCode, itemName: item.itemName, description: item.description, itemGroup: item.itemGroup, brand: item.brand,
      ...(f.showWarehouseWise ? { warehouse: b.warehouse } : {}),
      qty: flt(b.totalQty ?? 0, FLOAT_PRECISION), averageAge, range1: r1, range2: r2, range3: r3, range4: r4,
      earliest: dateDiff(f.toDate, fifo[0][1]!), latest: dateDiff(f.toDate, fifo[fifo.length - 1][1]!), uom: item.stockUom,
    });
  }
  if (f.showWarehouseWise || !rows.length) return { rows, chart: null };
  // get_chart_data sorts the report's list itself (stable): oldest average age first; the ten oldest drawn.
  rows.sort((a, b) => b.averageAge - a.averageAge);
  const top = rows.slice(0, 10);
  return { rows, chart: { labels: top.map((r) => r.itemCode), values: top.map((r) => r.averageAge) } };
}

// ---------------------------------------------------------------------------------------------
// Item Price Stock (item_price_stock.py): every Item Price with each Bin of its item (an item with
// no Bin: one row, no warehouse), in the Item Prices' own order (their names: the table's key).

export interface PriceForStock {
  name: string;
  itemCode: string;
  itemName: string | null;
  brand: string | null;
  priceList: string;
  rate: number;
  buying: boolean;
  selling: boolean;
}

export interface ItemPriceStockRow {
  itemCode: string;
  itemName: string | null;
  brand: string | null;
  warehouse: string | null;
  stockAvailable: number;
  buyingPriceList: string;
  buyingRate: number;
  sellingPriceList: string;
  sellingRate: number;
}

export function itemPriceStock(prices: readonly PriceForStock[], bins: ReadonlyMap<string, readonly { warehouse: string; actualQty: number }[]>, f: { itemCode?: string | null }): ItemPriceStockRow[] {
  const out: ItemPriceStockRow[] = [];
  const ordered = [...prices].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const p of ordered) {
    if (f.itemCode && p.itemCode !== f.itemCode) continue;
    const its = bins.get(p.itemCode);
    for (const bin of its?.length ? its : [null]) {
      out.push({
        itemCode: p.itemCode, itemName: p.itemName, brand: p.brand, warehouse: bin?.warehouse ?? null, stockAvailable: bin?.actualQty || 0,
        buyingPriceList: p.buying ? p.priceList : "", buyingRate: p.buying ? p.rate || 0 : 0,
        sellingPriceList: p.selling ? p.priceList : "", sellingRate: p.selling ? p.rate || 0 : 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Warehouse Wise Stock Balance (warehouse_wise_stock_balance.py): the company's enabled warehouses in
// tree order, each with the value of its ledger entries, groups indented with their children. The
// roll-up into parents is the old code's: in tree order, each parent adds its children's values as
// they stand then (so a group inside a group passes on only its own entries' value).

export interface WarehouseForBalance {
  name: string;
  parent: string | null;
  isGroup: boolean;
  disabled: boolean;
}

export interface WarehouseBalanceRow {
  name: string;
  parentWarehouse: string | null;
  isGroup: boolean;
  disabled: boolean;
  stockBalance: number;
  /** The tree's depth (absent for a warehouse under no group). */
  indent?: number;
}

export function warehouseWiseStockBalance(warehouses: readonly WarehouseForBalance[], balance: ReadonlyMap<string, number>): WarehouseBalanceRow[] {
  const rows: WarehouseBalanceRow[] = warehouses.map((w) => ({ name: w.name, parentWarehouse: w.parent, isGroup: w.isGroup, disabled: w.disabled, stockBalance: balance.get(w.name) || 0 }));
  // update_indent
  for (const w of rows) {
    const add = (x: WarehouseBalanceRow, indent: number) => {
      x.indent = indent;
      for (const child of rows) if (child.parentWarehouse === x.name) add(child, indent + 1);
    };
    if (w.isGroup) add(w, w.indent ?? 0);
  }
  // set_balance_in_parent: "sorted by lft, descending" — lft was not fetched, so the order stays.
  for (const w of rows) for (const child of rows) if (w.name === child.parentWarehouse) w.stockBalance += child.stockBalance;
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Stock Summary (the "stock-balance" page and erpnext.stock.ItemDashboard): the Bins with any stock,
// order or reservation, sorted (Projected qty, ascending, by default), 20 at a time with More; each
// row's Reserved and Actual / Waiting bars scaled to the page's largest figure.

export interface SummaryBin {
  itemCode: string;
  itemName: string;
  warehouse: string;
  projectedQty: number;
  reservedQty: number;
  reservedQtyForProduction: number;
  reservedQtyForSubContract: number;
  actualQty: number;
}

export const SUMMARY_SORTS = [
  { key: "projected_qty", label: "Projected qty" },
  { key: "reserved_qty", label: "Reserved for sale" },
  { key: "reserved_qty_for_production", label: "Reserved for manufacturing" },
  { key: "reserved_qty_for_sub_contract", label: "Reserved for sub contracting" },
  { key: "actual_qty", label: "Actual qty in stock" },
] as const;
export type SummarySort = (typeof SUMMARY_SORTS)[number]["key"];

export interface SummaryRow extends SummaryBin {
  totalReserved: number;
  pendingQty: number;
}

/**
 * The query report's Total row (frappe/desk/query_report.py add_total_row): each number column's
 * non-zero cells added up; a column with none stays blank.
 */
export function totalRow(keys: readonly string[], rows: readonly Record<string, unknown>[]): Record<string, number | ""> {
  const out: Record<string, number | ""> = {};
  for (const k of keys) {
    let t: number | "" = "";
    for (const r of rows) {
      const v = Number(r[k] ?? 0) || 0;
      if (v) t = (t === "" ? 0 : t) + v;
    }
    out[k] = t;
  }
  return out;
}

/** A report cell that held HTML (an item's description) as the old grid showed it: its text. */
export const plainText = (v: string | null | undefined) => (v ? v.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "");

/** get_item_dashboard_data: each row's figures and the page's largest one (the bars' scale). */
export function summaryRows(bins: readonly SummaryBin[]): { rows: SummaryRow[]; maxCount: number } {
  let maxCount = 0;
  const rows = bins.map((d) => {
    const actualOrPending = d.projectedQty + d.reservedQty + d.reservedQtyForProduction + d.reservedQtyForSubContract;
    const totalReserved = d.reservedQty + d.reservedQtyForProduction + d.reservedQtyForSubContract;
    const pendingQty = actualOrPending > d.actualQty ? actualOrPending - d.actualQty : 0;
    maxCount = Math.max(actualOrPending, d.actualQty, totalReserved, maxCount);
    return { ...d, totalReserved, pendingQty };
  });
  return { rows, maxCount };
}
