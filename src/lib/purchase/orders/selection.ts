// The rows picked with a list's checkboxes, as the browser sends them to the selection's Actions
// (Export, Print, Delete, Approve, Reject): a JSON list of record ids, in the list's order. Anything
// else is dropped, not guessed. Pure.

/** No more than a list can show (lib/purchase/orders/list.ts, MAX_ROWS). */
export const MAX_SELECTED = 10_000;

/**
 * The most records one request of a bulk action works through. The browser sends a large selection
 * in turns of this many, so each request stays well inside a Vercel function's 60 s (the Main ERP's
 * maxDuration) on the production database. Frappe ran up to 20 at once too (bulk_workflow_approval).
 */
export const BULK_BATCH = 20;

/**
 * The most PO sheets one print file holds. A Vercel function's answer must stay under about 4.5 MB,
 * and a sheet is up to 93 KB (all five layouts, measured 19-11-2026 on the 3,217 POs): 40 sheets is
 * at most 3.7 MB. Frappe 14 had no limit (v15 added one, at 500); print more in turns.
 */
export const MAX_PRINT_SHEETS = 40;

/** Frappe's own words for it (bulk_operations.js). */
export const TOO_MANY_TO_PRINT = `You can only print upto ${MAX_PRINT_SHEETS} documents at a time`;

/** The largest print file the route sends back: a margin under Vercel's 4.5 MB. */
export const MAX_PRINT_BYTES = 4_200_000;

export function parseSelectedIds(raw: unknown): string[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) if (typeof x === "string" && x.length > 0 && x.length <= 64) out.add(x);
  return [...out].slice(0, MAX_SELECTED);
}
