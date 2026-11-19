// How the old PO sheets printed values. They were Jinja templates fed the PO
// as Frappe loaded it: decimals as Python floats, dates as Python dates, empty
// fields as None. So `{{ row.qty }}` printed "6.0", `{{ doc.grand_total }}`
// "415799.5", `{{ doc.transaction_date }}` "2026-11-07" and an empty
// `{{ doc.tc_name }}` "None" (all seen on the captured PDFs). The replica
// prints the same text. Pure.
import { pyFormatFixed } from "../calc/pymath";

/** Python's str(float): the shortest round-trip digits, "6.0" for a whole number, exponent below 1e-4 or from 1e16. */
export function pyStr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const [mant, expText] = x.toExponential().split("e");
  const exp = Number(expText);
  const neg = mant.startsWith("-");
  const digits = mant.replace("-", "").replace(".", "");
  let out: string;
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    out = `${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  } else if (exp >= 0) {
    out = digits.length <= exp + 1 ? `${digits}${"0".repeat(exp + 1 - digits.length)}.0` : `${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
  } else {
    out = `0.${"0".repeat(-exp - 1)}${digits}`;
  }
  return neg ? `-${out}` : out;
}

/** A stored decimal (Prisma Decimal, string or number) as the float Frappe handed the template. */
export const asFloat = (v: { toString(): string } | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v.toString());

/** `{{ value }}` in a Jinja template: None for an empty field, a float as str(float), text as it is. */
export function jinja(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "number") return pyStr(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

/** `'%0.2f' | format(x)` (and Python's "%.nf"): the exact value rounded half to even. */
export const pyFixed = (x: number, n = 2) => pyFormatFixed(x, n);

/**
 * A date as dd-mm-yyyy: `frappe.utils.formatdate(d, "dd-MM-yyyy")` and `d.strftime('%d-%m-%Y')`
 * in the 2024–2025 layouts. An empty date prints nothing (formatdate's "").
 */
export function dmy(d: Date | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.toISOString().slice(0, 10).split("-");
  return `${day}-${m}-${y}`;
}
