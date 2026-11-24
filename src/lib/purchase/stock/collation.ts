// The old database's text order (MariaDB, utf8mb4_unicode_ci: the Unicode Collation Algorithm 4.0.0's
// primary weights, PAD SPACE), for the reports that listed rows in it — Stock Projected Qty by item
// and warehouse, an item's Bins in Item Price Stock (owner, 24-11-2026: the golden check put rows
// elsewhere under the browser's own collation, which takes “ and " as one). Case and accents do not
// count; spaces, then punctuation and symbols (in the order below), then digits, then letters;
// invisible format characters (a word joiner) count for nothing, and compatibility characters as
// what they stand for ("½" as "1⁄2", "²" as "2", "ﬁ" as "fi"). Pure.

/** DUCET 4.0.0's order of the punctuation and symbols in use, lowest first. */
const PUNCTUATION = [
  "_", "‾", "-", "‐", "‑", "‒", "–", "—", "―", ",", ";", ":", "!", "¡", "?", "¿", ".", "…", "·", "'", "‘", "’", "‚", "‛", "‹", "›",
  '"', "“", "”", "„", "‟", "«", "»", "(", ")", "[", "]", "{", "}", "§", "¶", "@", "*", "/", "⁄", "\\", "&", "#", "%", "‰", "†", "‡",
  "•", "`", "´", "˜", "^", "¯", "¨", "°", "©", "®", "+", "±", "÷", "×", "<", "=", ">", "¬", "|", "¦", "~", "¤", "¢", "$", "£", "¥", "€",
];
const PUNCT_RANK = new Map(PUNCTUATION.map((c, i) => [c, i]));
const SPACES = new Set([" ", "\t", "\n", "\r", " ", " ", " ", " ", "　"]);
const IGNORABLE = /[\p{Cf}\p{Mn}]/u;
const MARKS = /\p{Mn}/gu;
const TRAILING_SPACES = /[ \t]+$/;

/** A plain character's primary weight. */
function weight(ch: string): number {
  const base = ch.toLowerCase();
  const c = base.charCodeAt(0);
  if (c >= 48 && c <= 57) return 10_000 + (c - 48);
  if (c >= 97 && c <= 122) return 20_000 + (c - 97);
  if (/\p{L}/u.test(base)) return 30_000 + (base.codePointAt(0) ?? 0);
  // Other symbols: after the known ones, before the digits.
  return 1_000 + ((ch.codePointAt(0) ?? 0) % 8_000);
}

/** One character's primary weights: none for an ignorable one, several for one that expands. */
function weights(ch: string): number[] {
  if (SPACES.has(ch)) return [1];
  if (IGNORABLE.test(ch)) return [];
  const p = PUNCT_RANK.get(ch);
  if (p !== undefined) return [100 + p];
  const parts = Array.from(ch.normalize("NFKD").replace(MARKS, ""));
  if (parts.length === 1 && parts[0] === ch) return [weight(ch)];
  return parts.flatMap((x) => (x === ch ? [weight(x)] : weights(x)));
}

/** The string's sort key (trailing spaces do not count: PAD SPACE). */
export function collationKey(s: string): number[] {
  return Array.from(s.replace(TRAILING_SPACES, "")).flatMap(weights);
}

/** Compares as the old database ordered; equal keys fall back to the plain text. */
export function oldDbCompare(a: string, b: string): number {
  const ka = collationKey(a);
  const kb = collationKey(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  if (ka.length !== kb.length) return ka.length - kb.length;
  return a < b ? -1 : a > b ? 1 : 0;
}
