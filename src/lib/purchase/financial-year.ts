// Financial-year document numbers (owner, 26-11-2026: "Ensure the financial year changes automatically
// based on the transaction date").
//
// The old site's series carried a fixed financial year it never changed: "PUR-ORD/25-26/",
// "PR/25-26/.MM-", "GE-25-26-.#####" were still taken in November 2026 (FY 2026-27), and Stock Entry's
// "MAT-STE/24-25/" a year before that. Here a series written with such a year ("25-26": two two-digit
// years, the second the first plus one) is put in the financial year of the document's own date —
// India's, 1 April to 31 March: PUR-ORD/26-27/… now, PUR-ORD/27-28/… from 01-04-2027. Numbers already
// given stay as they are.
//
// The count (owner's choice, 26-11-2026): FY 2026-27 continues the count its series had reached under
// the old year (the next PO is PUR-ORD/26-27/02563, after PUR-ORD/25-26/02562), since the old site never
// switched; from FY 2027-28 each financial year starts again at 00001, as Frappe counted a new prefix.
// Calendar-year series (MAT-MR-.YYYY.-, MAT-SLE-.YYYY.-) are not touched. Pure.

/** The financial year a series' count carries over into, from the year before (see above). */
export const CARRY_INTO_FY = 2026;

/** The first calendar year of the financial year a date falls in: 2026 for 26-11-2026 and 31-03-2027. */
export function fyStartOf(date: Date | string): number {
  let y: number;
  let m: number;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    y = Number(date.slice(0, 4));
    m = Number(date.slice(5, 7));
  } else {
    // A moment: its day in India.
    const ist = new Date((typeof date === "string" ? new Date(date) : date).getTime() + 330 * 60_000);
    y = ist.getUTCFullYear();
    m = ist.getUTCMonth() + 1;
  }
  return m >= 4 ? y : y - 1;
}

const two = (n: number) => String(((n % 100) + 100) % 100).padStart(2, "0");
/** "26-27". */
export const fyShort = (start: number) => `${two(start)}-${two(start + 1)}`;
/** "2026-2027" (the Fiscal Year's name on the old site, e.g. a Gate Entry's financial_year). */
export const fyFull = (start: number) => `${start}-${start + 1}`;

/** Where a series names a financial year ("25-26"), and which: null when it names none. */
function fyToken(series: string): { index: number; length: number } | null {
  const re = /(\d{2})-(\d{2})/g;
  for (let m = re.exec(series); m; m = re.exec(series)) {
    const before = series[m.index - 1];
    const after = series[m.index + m[0].length];
    if (before && /\d/.test(before)) continue;
    if (after && /\d/.test(after)) continue;
    if ((Number(m[1]) + 1) % 100 === Number(m[2])) return { index: m.index, length: m[0].length };
  }
  return null;
}

/** Does the series carry a financial year? ("PUR-ORD/25-26/" yes; "MAT-MR-.YYYY.-" no.) */
export const hasFinancialYear = (series: string) => fyToken(series) !== null;

/** The series in the financial year starting `start`: ("PR/25-26/.MM-", 2026) → "PR/26-27/.MM-". */
export function seriesInFy(series: string, start: number): string {
  const t = fyToken(series);
  return t ? series.slice(0, t.index) + fyShort(start) + series.slice(t.index + t.length) : series;
}

/** The series for a document dated `date`. */
export const seriesForDate = (series: string, date: Date | string) => seriesInFy(series, fyStartOf(date));

/** The same series whatever year it names (to check a chosen series against the form's options). */
export const sameSeries = (a: string, b: string) => seriesInFy(a, 2000) === seriesInFy(b, 2000);

/**
 * The counter a new financial year's prefix starts from: the same prefix in the year before, for
 * CARRY_INTO_FY only; null (start at 1) for every other year or a prefix with no year.
 */
export function carryOverPrefix(prefix: string): string | null {
  const t = fyToken(prefix);
  if (!t) return null;
  const start = 2000 + Number(prefix.slice(t.index, t.index + 2));
  return start === CARRY_INTO_FY ? seriesInFy(prefix, start - 1) : null;
}
