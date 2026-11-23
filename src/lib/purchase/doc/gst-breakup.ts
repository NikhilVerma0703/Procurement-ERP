// The GST Breakup table of a purchase document's form, as India Compliance 14.34.6 built it each time
// the form loaded (gst_india/overrides/transaction.py onload → set_gst_breakup; gst_india/utils/
// jinja.py GSTBreakup; templates/gst_breakup.html). Never stored on the old site — the field was
// filled on load — so it is computed here the same way. Phase II, owner 21-11-2026. Pure.
//
// HSN/SAC-wise (GST Settings › HSN-wise tax breakup was on) or item-wise; IGST for an inter-state
// supply, else CGST and SGST (and the cess columns when any row has cess); each row's taxable value
// and tax amounts rounded to the tax amount's precision and summed; printed as the template printed.

import { flt } from "../calc/pymath";
import { formatCurrency } from "../format";
import { escapeHtml } from "../html";

type Row = Record<string, unknown>;

export interface GstBreakupOptions {
  /** GST Settings › HSN-wise tax breakup (on, on the old site). */
  hsnWise: boolean;
  /** The taxes table's tax amount precision (Currency: the site's currency precision, 3). */
  precision: number;
  /** An unregistered supplier's address state code (Address.gst_state_number). */
  supplierAddressState?: string | null;
}

const CESS_HEADERS = ["CESS", "CESS Non Advol"];
const scrub = (s: string) => s.toLowerCase().replace(/ /g, "_");
const num = (v: unknown) => Number(v ?? 0) || 0;

/** India Compliance's get_source_state_code, for a purchase document. */
function sourceState(doc: Row, opts: GstBreakupOptions): string {
  if (doc.gst_category === "Overseas") return "96";
  if (doc.gst_category === "Unregistered" && doc.supplier_address && opts.supplierAddressState) return opts.supplierAddressState;
  return String(doc.supplier_gstin || doc.company_gstin || "").slice(0, 2);
}

export function isInterStateSupply(doc: Row, opts: GstBreakupOptions): boolean {
  return doc.gst_category === "SEZ" || String(doc.place_of_supply ?? "").slice(0, 2) !== sourceState(doc, opts);
}

export interface GstBreakupRow {
  key: string;
  taxableAmount: number;
  taxes: Record<string, { taxRate: number; taxAmount: number }>;
}

/** The breakup's rows and tax columns; null when the old form showed none (no place of supply or company GSTIN). */
export function gstBreakup(doc: Row, opts: GstBreakupOptions): { keyHeader: "HSN/SAC" | "Item"; taxHeaders: string[]; rows: GstBreakupRow[] } | null {
  if (!doc.place_of_supply || !doc.company_gstin) return null;
  const items = Array.isArray(doc.items) ? (doc.items as Row[]) : [];
  const taxHeaders = isInterStateSupply(doc, opts) ? ["IGST"] : ["CGST", "SGST"];
  if (items.some((i) => CESS_HEADERS.some((h) => num(i[`${scrub(h)}_amount`]) !== 0))) taxHeaders.push(...CESS_HEADERS);
  const rows = new Map<string, GstBreakupRow>();
  for (const item of items) {
    let key: string;
    if (opts.hsnWise) {
      const rate = [num(item.cgst_rate), num(item.sgst_rate), num(item.igst_rate)].find((r) => r !== 0) ?? 0;
      key = `${item.gst_hsn_code ?? ""}\u0000${rate}`;
    } else key = String(item.item_code || item.item_name || "");
    let row = rows.get(key);
    if (!row) {
      row = { key: opts.hsnWise ? String(item.gst_hsn_code ?? "") : key, taxableAmount: 0, taxes: {} };
      rows.set(key, row);
    }
    row.taxableAmount += flt(num(item.taxable_value), opts.precision);
    for (const h of taxHeaders) {
      const t = (row.taxes[h] ??= { taxRate: num(item[`${scrub(h)}_rate`]), taxAmount: 0 });
      t.taxAmount += flt(num(item[`${scrub(h)}_amount`]), opts.precision);
    }
  }
  return { keyHeader: opts.hsnWise ? "HSN/SAC" : "Item", taxHeaders, rows: [...rows.values()] };
}

/** A Python float as Jinja printed it ("9.0", "2.5"). */
const pyFloat = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const money = (v: number) => formatCurrency(v, { symbol: "₹", fractionUnits: 100 });

/** templates/gst_breakup.html, as it rendered (its whitespace removed, as set_gst_breakup did). */
export function gstBreakupHtml(doc: Row, opts: GstBreakupOptions): string | null {
  const b = gstBreakup(doc, opts);
  if (!b || !b.rows.length) return null;
  const ret = !!num(doc.is_return);
  const head = [`<th class="text-left">${b.keyHeader}</th>`, `<th class="text-right">Taxable Amount</th>`, ...b.taxHeaders.map((h) => `<th class="text-right">${h}</th>`)];
  const body = b.rows.map((r) => {
    const cells = [
      `<td class="text-left">${escapeHtml(r.key)}</td>`,
      `<td class="text-right">${money(ret ? Math.abs(r.taxableAmount) : r.taxableAmount)}</td>`,
      ...b.taxHeaders.map((h) => {
        const t = r.taxes[h];
        const rate = t.taxRate || !t.taxAmount ? `(${pyFloat(t.taxRate)}%)&nbsp;` : "";
        return `<td class="text-right">${rate}${money(ret ? Math.abs(t.taxAmount) : t.taxAmount)}</td>`;
      }),
    ];
    return `<tr>${cells.join("")}</tr>`;
  });
  return `<div class="tax-break-up" style="overflow-x: auto"><table class="table table-bordered table-hover"><thead><tr>${head.join("")}</tr></thead><tbody>${body.join("")}</tbody></table></div>`;
}
