// The Purchase Receipt DocType's parts as this module uses them (Phase II, owner 21-11-2026): its
// captured layouts, its tables, its default naming series, and Frappe's naming-series rule. Pure, so
// the form, the server, scripts and tests share it.
import { LAYOUTS } from "../doc/layouts";

export const RECEIPT = "Purchase Receipt";
export const RECEIPT_CHILDREN = {
  "Purchase Receipt Item": LAYOUTS["Purchase Receipt Item"],
  "Purchase Taxes and Charges": LAYOUTS["Purchase Taxes and Charges"],
  "Services Items": LAYOUTS["Services Items"],
  "Purchase Receipt Item Supplied": LAYOUTS["Purchase Receipt Item Supplied"],
};
/** The receipt's tables this module stores: fieldname → child DocType. */
export const RECEIPT_TABLES = [
  ["items", "Purchase Receipt Item"],
  ["taxes", "Purchase Taxes and Charges"],
  ["services_items", "Services Items"],
] as const;
/** The series every receipt since April 2025 took (the old form's default). */
export const DEFAULT_RECEIPT_SERIES = "PR/25-26/.MM-";

/**
 * Frappe's naming series → the counter's key and its digits (model/naming.py parse_naming_series):
 * the parts between dots are text, or YY / YYYY / MM / DD of the day, or #### (the counter, 5 digits
 * when none is given). "PR/25-26/.MM-" → ("PR/25-26/MM-", 5): "MM-" is text, not the month.
 */
export function seriesKey(series: string, on: Date = new Date()): { prefix: string; digits: number } {
  const ist = new Date(on.getTime() + 330 * 60_000);
  const parts = series.split(".");
  if (!parts.some((p) => p.startsWith("#"))) parts.push("#####");
  let prefix = "";
  let digits = 5;
  for (const p of parts) {
    if (p.startsWith("#")) {
      digits = p.length;
      break;
    }
    if (p === "YY") prefix += String(ist.getUTCFullYear()).slice(2);
    else if (p === "YYYY") prefix += String(ist.getUTCFullYear());
    else if (p === "MM") prefix += String(ist.getUTCMonth() + 1).padStart(2, "0");
    else if (p === "DD") prefix += String(ist.getUTCDate()).padStart(2, "0");
    else prefix += p;
  }
  return { prefix, digits };
}
