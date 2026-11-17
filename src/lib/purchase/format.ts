// How the old site displayed numbers, money and dates — the screens must show
// figures exactly as the ERPNext screens did (CLAUDE.md, "Behave like the
// original"). Frappe 14's own rules, re-implemented:
//   * System Settings: number format "#,###.###" (groups of three, also for
//     INR: the site did not use each currency's own format), date format
//     dd-mm-yyyy, time zone Asia/Kolkata, currency precision 3;
//   * a Currency value shows 2 decimals unless it has 3 (form/formatters.js),
//     so ₹ 189,125.68 and ₹ 112,121.062;
//   * "3 d" / "1 w" for how long ago a record changed (utils/pretty_date.js).
// Pure: usable on the server and in the browser.

/** The old site's time zone: datetimes are shown in it, whatever the server's zone. */
export const SITE_TIME_ZONE = "Asia/Kolkata";
const SITE_UTC_OFFSET_MIN = 330; // Asia/Kolkata has no daylight saving

/** System Settings → Currency Precision. */
export const CURRENCY_PRECISION = 3;

/** format_number(v, "#,###.###", decimals): groups of three, "." for decimals. */
export function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "";
  const negative = value < 0;
  const [int, frac] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

/** A whole-number count, as the list's "20 of 3,199". */
export const formatCount = (n: number) => formatNumber(n, 0);

export interface CurrencyDisplay {
  symbol?: string | null;
  /** The currency's fraction units (100 for paisa and cents). */
  fractionUnits?: number | null;
}

/**
 * Frappe's Currency formatter: the currency precision (3), but only 2 decimals unless the value
 * itself has more than 2 (a value read as it came from the database, trailing zeros dropped).
 */
export function formatCurrency(value: number | string | null | undefined, currency: CurrencyDisplay = {}): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  let precision = CURRENCY_PRECISION;
  const decimals = String(n).split(".")[1] ?? "";
  if (decimals.length < 3 || decimals.length < precision) {
    const fraction = String(currency.fractionUnits || 100);
    if (decimals.length < fraction.length) precision = fraction.length - 1;
  }
  const number = formatNumber(n, precision);
  return currency.symbol ? `${currency.symbol} ${number}` : number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A date-only value (stored as midnight UTC), as dd-mm-yyyy. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return `${pad(x.getUTCDate())}-${pad(x.getUTCMonth() + 1)}-${x.getUTCFullYear()}`;
}

/** A moment, as dd-mm-yyyy HH:mm:ss in the old site's time zone. */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = new Date((typeof d === "string" ? new Date(d) : d).getTime() + SITE_UTC_OFFSET_MIN * 60000);
  return `${formatDate(x)} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
}

/** The first instant of a calendar day (YYYY-MM-DD) in the old site's time zone. */
export function siteDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - SITE_UTC_OFFSET_MIN * 60000);
}

/** Today's date (YYYY-MM-DD) in the old site's time zone. */
export function siteToday(now: Date = new Date()): string {
  return new Date(now.getTime() + SITE_UTC_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

/** Frappe's prettyDate(date, mini): "now", "5 m", "3 h", "2 d", "1 w", "4 M", "1 y". */
export function timeAgoMini(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "";
  const diff = (now.getTime() - new Date(d).getTime()) / 1000;
  const days = Math.floor(diff / 86400);
  if (Number.isNaN(days) || days < 0) return "";
  if (days === 0) {
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)} m`;
    return `${Math.floor(diff / 3600)} h`;
  }
  if (days < 7) return `${days} d`;
  if (days < 31) return `${Math.floor(days / 7)} w`;
  if (days < 365) return `${Math.floor(days / 30)} M`;
  return `${Math.floor(days / 365)} y`;
}
