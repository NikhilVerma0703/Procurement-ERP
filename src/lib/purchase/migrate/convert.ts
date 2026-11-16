// Value conversions from ERPNext's stored text to this schema's types, and the
// deterministic record IDs of the import. Pure — unit-tested in
// tests/purchase/migrate.test.ts.
import { createHash } from "node:crypto";

type Raw = string | null | undefined;

/** The old site ran on Asia/Kolkata; ERPNext stored naive local times. */
export const SOURCE_UTC_OFFSET_MINUTES = 330;

/** "YYYY-MM-DD HH:MM:SS[.ffffff]" in the old site's local time → UTC Date. */
export function localDateTime(v: Raw): Date | null {
  if (!v || v.startsWith("0000")) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(v.trim());
  if (!m) throw new Error(`Not a datetime: ${v}`);
  const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms) - SOURCE_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utc);
}

/** "YYYY-MM-DD" → that calendar date (as UTC midnight, the @db.Date way). */
export function dateOnly(v: Raw): Date | null {
  if (!v || v.startsWith("0000")) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) throw new Error(`Not a date: ${v}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** A numeric(21,9) value as exact decimal text (Prisma accepts strings). */
export function dec(v: Raw): string {
  if (v === null || v === undefined || v.trim() === "") return "0";
  const t = v.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(t)) throw new Error(`Not a number: ${v}`);
  return t;
}

/** Like dec, but empty stays empty (for optional numbers). */
export function decOrNull(v: Raw): string | null {
  return v === null || v === undefined || v.trim() === "" ? null : dec(v);
}

export function int(v: Raw): number {
  if (v === null || v === undefined || v.trim() === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Not an integer: ${v}`);
  return Math.trunc(n);
}

export function intOrNull(v: Raw): number | null {
  return v === null || v === undefined || v.trim() === "" ? null : int(v);
}

/** ERPNext check fields: "1" true, anything else false. */
export function bool(v: Raw): boolean {
  return v !== null && v !== undefined && v.trim() !== "" && Number(v) !== 0;
}

/** Optional text: ERPNext writes both NULL and '' for "nothing". */
export function text(v: Raw): string | null {
  return v === null || v === undefined || v === "" ? null : v;
}

/** JSON stored as text (item_wise_tax_detail, item_tax_rate, Version data). */
export function jsonOf(v: Raw): unknown {
  if (!v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return { unparsed: v };
  }
}

/**
 * The record ID of an imported row: derived from what the row is and its
 * ERPNext name, so importing a later backup gives every surviving record the
 * same ID (links and bookmarks stay valid). Rows created in this system use
 * Prisma's cuid() instead; both are opaque strings.
 */
export function importId(kind: string, erpnextName: string): string {
  const h = createHash("sha256").update(`${kind}\u0000${erpnextName}`).digest("base64url");
  return `${kind}_${h.slice(0, 22)}`;
}

/** Map an ERPNext label onto an enum key; unknown labels are reported, not guessed. */
export function enumOf<T extends string>(
  labels: Record<string, T>,
  v: Raw,
  where: string,
  issues: string[],
): T | null {
  const t = text(v);
  if (t === null) return null;
  const key = labels[t];
  if (!key) {
    issues.push(`${where}: unknown value "${t}"`);
    return null;
  }
  return key;
}
