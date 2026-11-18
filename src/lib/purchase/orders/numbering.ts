// PO numbers, as the old site gave them.
//
// A new PO takes the next number of its naming series: the series
// "PUR-ORD/25-26/" was the only one (and still said 25-26 in 2026-27), five
// digits, continuing from the last imported number (purchase_naming_series
// holds the counter, from ERPNext's tabSeries). An amended PO is named after
// the cancelled one: "<number>-1", and "-2" when an amendment is amended
// (Frappe's _get_amended_name). Pure.

export const DEFAULT_SERIES = "PUR-ORD/25-26/";
const DIGITS = 5;

/** The number after `current` in a series: ("PUR-ORD/25-26/", 2529) → "PUR-ORD/25-26/02530". */
export function seriesNumber(prefix: string, counter: number): string {
  return `${prefix}${String(counter).padStart(DIGITS, "0")}`;
}

/**
 * The name of an amendment. `amendedFrom` is the cancelled PO's number; `wasAmendment` says
 * whether that PO was itself an amendment (then its "-N" is counted on, not added to).
 */
export function amendedNumber(amendedFrom: string, wasAmendment: boolean): string {
  if (!wasAmendment) return `${amendedFrom}-1`;
  const parts = amendedFrom.split("-");
  const n = Number(parts[parts.length - 1]) || 0;
  return `${parts.slice(0, -1).join("-")}-${n + 1}`;
}
