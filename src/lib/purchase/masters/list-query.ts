// A master list's state, kept in the address bar as the PO list keeps its own
// (lib/purchase/orders/list.ts): a search over the ID and name, the screen's
// standard filters (Frappe's in_standard_filter fields), the sort field and
// order, and how many rows show (20, 100 or 500, then "Load More"). Pure.

import type { LikeInfo } from "../like-rules";

export const PAGE_SIZES = [20, 100, 500] as const;

export interface MasterListQuery {
  q: string;
  /** The standard filters that are set, by key. */
  filters: Record<string, string>;
  sort: string;
  order: "asc" | "desc";
  limit: number;
  /**
   * The ♥ heading's filter, Frappe's "Liked By like %<e-mail>%" (address bar: _liked_by=<e-mail>);
   * "" or absent for none.
   */
  likedBy?: string;
  /** Set by the server before listing (masters/list-likes.ts): the ids "Liked By" keeps, or leaves out. */
  idFilter?: { in: string[] } | { notIn: string[] };
}

export interface ListShape {
  filters: readonly string[];
  sorts: readonly string[];
  defaultSort: string;
  defaultOrder: "asc" | "desc";
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const one = (p: Params, k: string): string => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

export function parseMasterQuery(p: Params, shape: ListShape): MasterListQuery {
  const filters: Record<string, string> = {};
  for (const k of shape.filters) {
    const v = one(p, k).trim();
    if (v) filters[k] = v.slice(0, 140);
  }
  const sort = shape.sorts.includes(one(p, "sort")) ? one(p, "sort") : shape.defaultSort;
  const order = one(p, "order") === "asc" ? "asc" : one(p, "order") === "desc" ? "desc" : shape.defaultOrder;
  const limit = Math.min(Math.max(Number(one(p, "limit")) || PAGE_SIZES[0], 1), 5000);
  return { q: one(p, "q").trim().slice(0, 140), filters, sort, order, limit, likedBy: one(p, "_liked_by").trim().slice(0, 140) };
}

export function masterQueryParams(q: MasterListQuery, shape: ListShape): URLSearchParams {
  const s = new URLSearchParams();
  if (q.q) s.set("q", q.q);
  for (const [k, v] of Object.entries(q.filters)) if (v) s.set(k, v);
  if (q.sort !== shape.defaultSort) s.set("sort", q.sort);
  if (q.order !== shape.defaultOrder) s.set("order", q.order);
  if (q.limit !== PAGE_SIZES[0]) s.set("limit", String(q.limit));
  if (q.likedBy) s.set("_liked_by", q.likedBy);
  return s;
}

/** A standard filter above the list: a select of fixed options, or text. */
export interface ListFilterSpec {
  key: string;
  label: string;
  options?: readonly string[];
}

/** A column of the list (the doctype's in_list_view fields). */
export interface ListColumnSpec {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Hidden on narrow screens. */
  wide?: boolean;
}

export type PillColour = "green" | "red" | "orange" | "gray" | "blue";

/** One row of a master list. */
export interface ListRow {
  id: string;
  /** The row's heart (set by masters/list-likes.ts). */
  likes?: LikeInfo;
  href: string;
  title: string;
  /** The record's ID (shown when it differs from the title). */
  name: string;
  pill?: { label: string; colour: PillColour } | null;
  cells: Record<string, string | null>;
  updatedAt: string;
}

/** A page of a master list. */
export interface ListPage {
  rows: ListRow[];
  total: number;
}
