// Gate Entry — the add-on's own DocType (pacific_group, "Nestorbird"): a vehicle at the gate
// against one Purchase Order, before its goods are received (owner, 23-11-2026: "Gate Entry list
// … this is Thiru R's part … build this entire gate entry list and the Receipt section"). Pure:
// the form, the server and the tests share these rules.
//
// From the old site (captured 21–23-11-2026; docs/reference/live-capture/stock/pacific_group_gate_entry.js,
// data/erpnext-live/live-gate-entry-states-20261123.json) and its 4,693 gate entries:
//   * naming series "GE-25-26-.#####" (default) or "GE-.{financial_year}.-.#####"; Location defaults to
//     Hosur, Invoice Date and Gate Entry Date to today;
//   * the PO picker offers submitted POs, not Closed, less than 99 % received;
//   * choosing the PO lists its lines still to receive (the add-on's po_items: PO qty − received qty,
//     in the PO line's unit, by the line's ID; lines with nothing left are left out) — Po Qty and Bal
//     Qty are that quantity; rows cannot be added by hand;
//   * typing a row's Item Qty sets Bal Qty = Po Qty − Item Qty;
//   * Supplier and Po Date come from the PO (fetch_from); a row's Po Date too;
//   * submittable, no change history kept (track_changes 0); an amended entry is "<name>-1";
//   * once submitted and while it has no Inward No: Create › Purchase Receipt (stock/receipt-map.ts);
//     submitting that receipt writes the Inward No and Inward Date here (stock/receipt-submit.ts).

import { flt } from "../calc/pymath";
import { LAYOUTS } from "../doc/layouts";
import type { Doc } from "../doc/store";
import { seriesKey } from "./receipt-meta";

export const GATE_ENTRY = "Gate Entry";
export const GATE_ENTRY_ITEM = "Gate Entry Item";
export const GATE_ENTRY_CHILDREN = { [GATE_ENTRY_ITEM]: LAYOUTS[GATE_ENTRY_ITEM] };
/** The DocType's default series (every gate entry since April 2025 took it). */
export const DEFAULT_GATE_ENTRY_SERIES = "GE-25-26-.#####";
export const GATE_ENTRY_LOCATION = "Hosur";

/**
 * Frappe's naming series with the Gate Entry's own "{financial_year}" part (a field of the document,
 * parse_naming_series: "{fieldname}" is the document's value) — then the standard parts (seriesKey).
 */
export function gateEntrySeriesKey(series: string, doc: Doc, on: Date = new Date()): { prefix: string; digits: number } {
  const filled = series
    .split(".")
    .map((p) => (p.startsWith("{") && p.endsWith("}") ? String(doc[p.slice(1, -1)] ?? "").trim() : p))
    .join(".");
  return seriesKey(filled, on);
}

/**
 * The name of an amendment (Frappe's _get_amended_name): "<original>-1", or the next number when
 * the cancelled entry was itself an amendment ("GE-25-26-03332-1" → "GE-25-26-03332-2").
 */
export function amendedName(original: string, originalWasAmendment: boolean): string {
  if (!originalWasAmendment) return `${original}-1`;
  const parts = original.split("-");
  const n = Number(parts[parts.length - 1]);
  return `${parts.slice(0, -1).join("-")}-${(Number.isFinite(n) ? Math.trunc(n) : 0) + 1}`;
}

export type GateEntryDocStatus = "DRAFT" | "SUBMITTED" | "CANCELLED";

/** The status pill (Frappe's indicator for a submittable DocType without a status field). */
export function gateEntryIndicator(docStatus: GateEntryDocStatus): { label: string; colour: "red" | "blue" } {
  if (docStatus === "SUBMITTED") return { label: "Submitted", colour: "blue" };
  if (docStatus === "CANCELLED") return { label: "Cancelled", colour: "red" };
  return { label: "Draft", colour: "red" };
}

/** The Gate Entry Item's Bal Qty (the add-on's item_qty trigger: po_qty − item_qty). */
export const balQty = (poQty: number, itemQty: number) => poQty - itemQty;

/** A PO line as the add-on's po_items returned it. */
export interface PoItemRow {
  /** The PO line's name (its ERPNext name; a line made here: its id). */
  name: string;
  item_code: string;
  description: string;
  uom: string;
  /** What is still to receive: PO qty − received qty. */
  qty: number;
}

/** The new gate entry's rows for a PO (the form's po_no trigger over po_items). */
export function rowsFromPoItems(order: { number: string; transactionDate: string }, items: PoItemRow[], newName: () => string): Doc[] {
  return items
    .filter((i) => i.qty) // `if (items[item].qty)`: a line with nothing left to receive is left out
    .map((i, k) => ({
      __islocal: 1,
      name: newName(),
      idx: k + 1,
      po_no: order.number,
      po_date: order.transactionDate,
      item_code: i.item_code,
      item_description: i.description,
      uom: i.uom,
      po_qty: i.qty,
      item_qty: 0,
      bal_qty: i.qty,
      po_item_name: i.name,
    }));
}

/** po_items' rule over the PO's lines: PO qty − received qty, in the line's ID order. */
export function poItemsOf(lines: { name: string; itemCode: string; description: string | null; itemName: string; uom: string; qty: number; receivedQty: number }[]): PoItemRow[] {
  return [...lines]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((l) => ({ name: l.name, item_code: l.itemCode, description: l.description ?? l.itemName, uom: l.uom, qty: flt(l.qty - l.receivedQty, 9) }));
}

/**
 * The financial years the Financial Year link offers: the company's (April to March), from the first
 * one its gate entries named (2023-2024) to the current one, newest first.
 */
export function financialYears(today: string): string[] {
  const y = Number(today.slice(0, 4));
  const current = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  const out: string[] = [];
  for (let s = 2023; s <= current; s++) out.push(`${s}-${s + 1}`);
  return out.reverse();
}

/** Frappe's list count: "1,000+" once more than a thousand match (its count stops at 1,001). */
export function listCountLabel(total: number): string {
  return total > 1000 ? "1,000+" : total.toLocaleString("en-IN");
}
