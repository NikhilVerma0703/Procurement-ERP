// An imported record's values as the old form held them, and as it showed them (Phase II, owner
// 21-11-2026). The importer keeps every source row whole in `legacy`, as text (the dump's values);
// Frappe's form had numbers for Check / Int / Float / Currency / Percent fields (so a condition
// like "eval:doc.is_return" is false for 0, not true for "0"). Pure.

import { formatCurrency, formatFloat, formatNumber } from "../format";
import type { DoctypeLayout, LayoutField } from "./layout";

const NUMERIC = new Set(["Check", "Int", "Float", "Currency", "Percent", "Rating"]);
const STANDARD_INT = new Set(["docstatus", "idx"]);

/** A legacy row (text values) as the form's document (typed values). */
export function typedDoc(layout: DoctypeLayout, row: Record<string, unknown>): Record<string, unknown> {
  const types = new Map(layout.fields.map((f) => [f.fieldname, f.fieldtype]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const t = types.get(k);
    if ((t && NUMERIC.has(t)) || STANDARD_INT.has(k)) out[k] = v === null || v === undefined || v === "" ? 0 : Number(v);
    else out[k] = v;
  }
  for (const f of layout.fields) if (!(f.fieldname in out) && NUMERIC.has(f.fieldtype)) out[f.fieldname] = 0;
  return out;
}

/** Is there a value to show? (Frappe hid empty fields on a read-only form; a Check always shows.) */
export function hasValue(f: LayoutField, v: unknown): boolean {
  if (f.fieldtype === "Check") return true;
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

const pad = (n: string) => n.padStart(2, "0");

/** A value as the old read-only form showed it (dates dd-mm-yyyy, the site's number formats). */
export function displayValue(f: LayoutField, v: unknown, currency: string | null = "INR"): string {
  if (v === null || v === undefined || v === "") return "";
  switch (f.fieldtype) {
    case "Date": {
      const s = String(v);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : s;
    }
    case "Datetime": {
      const s = String(v);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)} ${s.slice(11, 19)}` : s;
    }
    case "Time": {
      const [h = "0", m = "0", sec = "0"] = String(v).split(":");
      return `${pad(h)}:${pad(m)}:${pad(sec.split(".")[0])}`;
    }
    case "Currency":
      return formatCurrency(Number(v), { symbol: currency === "INR" ? "₹" : currency });
    case "Float":
      return formatFloat(Number(v), f.precision ? Number(f.precision) : 3);
    case "Percent":
      return `${formatFloat(Number(v), f.precision ? Number(f.precision) : 3)}%`;
    case "Int":
      return formatNumber(Number(v), 0);
    default:
      return String(v);
  }
}
