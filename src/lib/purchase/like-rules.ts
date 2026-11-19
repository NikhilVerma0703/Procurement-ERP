// Likes, the pure part: which doctype each screen's records are liked as, what a heart shows, and the
// "Liked By" filter (frappe/desk/like.py, list_view.js get_like_html). Used by the server (likes.ts) and
// the browser (the hearts), so no Prisma and no server-only imports.
//
// THE "LIKED BY" FILTER. On the old site a record's likes were a text column, `_liked_by`, holding a JSON
// list (["a@x.com", "b@y.com"]). The list's ♥ heading added the filter  Liked By like %<me>%,  and the
// filter builder offered "Liked By" with the text operators. Here likes are rows (purchase_likes), so a
// condition is answered by building that same text for each liked record and testing it with ERPNext's
// meaning (as list-where.ts does for the other text fields): case is ignored, % is the wildcard, and
// "Not Equals", "Not Like", "Not In" and "Is not set" also hold for a record nobody liked (Frappe wraps
// those in ifnull(_liked_by, '')).
import type { ListFilter } from "./orders/list";

/** The doctype each screen's records are liked as (ERPNext's doctype names). */
export const LIKE_DOCTYPE = {
  orders: "Purchase Order",
  suppliers: "Supplier",
  items: "Item",
  addresses: "Address",
  contacts: "Contact",
  taxTemplates: "Purchase Taxes and Charges Template",
  paymentTermsTemplates: "Payment Terms Template",
  paymentTerms: "Payment Term",
  terms: "Terms and Conditions",
} as const;
export type LikeKind = keyof typeof LIKE_DOCTYPE;
export const isLikeKind = (k: string): k is LikeKind => Object.prototype.hasOwnProperty.call(LIKE_DOCTYPE, k);

export interface LikeInfo {
  count: number;
  /** Did the viewer like it? */
  mine: boolean;
  /** Who liked it, by name, first liker first (the heart's tooltip). */
  names: string[];
}

export const NO_LIKES: LikeInfo = { count: 0, mine: false, names: [] };

/** The count beside a heart: nothing at 0, "99+" past 99 (get_like_html). */
export const likesCountText = (n: number): string => (n > 99 ? "99+" : n > 0 ? String(n) : "");

/** Frappe's standard field for likes, as the filter builder and the address bar name it. */
export const LIKED_BY_FIELD = "_liked_by";

/** The ♥ heading's filter: what the viewer liked. */
export const likedByMeFilter = (email: string): ListFilter => ({ field: LIKED_BY_FIELD, op: "like", value: `%${email}%` });

export const isLikedByMeFilter = (f: ListFilter, email: string): boolean =>
  f.field === LIKED_BY_FIELD && f.op === "like" && typeof f.value === "string" && f.value.toLowerCase() === `%${email.toLowerCase()}%`;

/** The old column's text for these likers, as Python's json.dumps wrote it; "" for nobody. */
export function likedByText(emails: readonly string[]): string {
  return emails.length ? `[${emails.map((e) => JSON.stringify(e)).join(", ")}]` : "";
}

/** SQL LIKE with % wildcards (the only wildcard the list uses), ignoring case. */
function likeTest(pattern: string): (s: string) => boolean {
  const body = pattern.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const re = new RegExp(`^${body}$`, "is");
  return (s) => re.test(s);
}

/**
 * Does a record's likes text meet the condition? "" is a record nobody liked: it never meets "Equals",
 * "Like" or "In" with a value (NULL compared), and meets the "not" operators (ifnull(…, '')).
 */
export function likedByMatches(f: Pick<ListFilter, "op" | "value">, text: string): boolean {
  const t = text.toLowerCase();
  const one = String((Array.isArray(f.value) ? f.value[0] : f.value) ?? "").toLowerCase();
  const list = (Array.isArray(f.value) ? f.value : [f.value]).map((v) => String(v).toLowerCase());
  switch (f.op) {
    case "=":
      return t !== "" && t === one;
    case "!=":
      return t !== one;
    case "like":
      return t !== "" && likeTest(one)(t);
    case "not like":
      return !likeTest(one)(t);
    case "in":
      return t !== "" && list.includes(t);
    case "not in":
      return !list.includes(t);
    case "is":
      return one === "set" ? t !== "" : t === "";
    default:
      return false;
  }
}

/**
 * The records a "Liked By" condition keeps, given each liked record's likers in the order they liked
 * (a record missing from the map was liked by nobody): the ids to keep, or, when a record nobody liked
 * meets the condition too, the liked ids to leave out.
 */
export function likedByCondition(f: Pick<ListFilter, "op" | "value">, likers: ReadonlyMap<string, readonly string[]>): { in: string[] } | { notIn: string[] } {
  const nobodyMeets = likedByMatches(f, "");
  const ids: string[] = [];
  for (const [id, emails] of likers) if (likedByMatches(f, likedByText(emails)) !== nobodyMeets) ids.push(id);
  return nobodyMeets ? { notIn: ids } : { in: ids };
}
