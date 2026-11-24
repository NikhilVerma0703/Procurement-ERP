// The Purchase Order list's state — filters, sort, page size — and how it is
// written in the address bar, so a list view can be bookmarked or shared.
//
// Mirrors the old site's list (docs/reference/live-capture/ui-notes.md, screen
// 01): the quick-filter bar (ID, Supplier, Supplier Name, Company, Status), the
// filter builder (any of the fields below with ERPNext's operators), the sort
// selector, and paging by 20 / 100 / 500 / 2500 with Load More.
// Pure: used by the page (server), the toolbar (browser) and the export route.
import { PO_STATUSES } from "../calc/status";
import { MODES_OF_TRANSPORT, PURPOSES, SHIPMENT_TYPES } from "./options";

export type ListFieldType = "data" | "link" | "select" | "date" | "datetime" | "number" | "percent";

export interface ListField {
  /** ERPNext fieldname: what the address bar and saved filters use. */
  key: string;
  /** ERPNext label, as the filter builder showed it. */
  label: string;
  type: ListFieldType;
  options?: readonly string[];
  /** A field of the item rows (Purchase Order Item). */
  child?: "items";
}

export const WORKFLOW_STATES = ["Created", "Approved", "Rejected"] as const;
export const DOC_STATUSES = ["Draft", "Submitted", "Cancelled"] as const;

/** The fields the filter builder offers. */
export const LIST_FIELDS: readonly ListField[] = [
  { key: "name", label: "ID", type: "data" },
  { key: "supplier", label: "Supplier", type: "link" },
  { key: "supplier_name", label: "Supplier Name", type: "data" },
  { key: "company", label: "Company", type: "link" },
  { key: "status", label: "Status", type: "select", options: PO_STATUSES },
  { key: "workflow_state", label: "Workflow State", type: "select", options: WORKFLOW_STATES },
  { key: "docstatus", label: "Document Status", type: "select", options: DOC_STATUSES },
  { key: "transaction_date", label: "Date", type: "date" },
  { key: "schedule_date", label: "Required By", type: "date" },
  { key: "currency", label: "Currency", type: "link" },
  { key: "net_total", label: "Net Total", type: "number" },
  { key: "grand_total", label: "Grand Total", type: "number" },
  { key: "rounded_total", label: "Rounded Total", type: "number" },
  { key: "per_received", label: "% Received", type: "percent" },
  { key: "per_billed", label: "% Billed", type: "percent" },
  { key: "tax_category", label: "Tax Category", type: "link" },
  { key: "taxes_and_charges", label: "Purchase Taxes and Charges Template", type: "link" },
  { key: "set_warehouse", label: "Set Target Warehouse", type: "link" },
  { key: "custom_shipment_type", label: "Shipment Type", type: "select", options: SHIPMENT_TYPES },
  { key: "custom_mode_of_transport", label: "Mode Of Transport", type: "select", options: MODES_OF_TRANSPORT },
  { key: "custom_purpose_of_purchase", label: "Purpose", type: "select", options: PURPOSES },
  { key: "owner", label: "Created By", type: "link" },
  { key: "modified_by", label: "Last Updated By", type: "link" },
  { key: "creation", label: "Created On", type: "datetime" },
  { key: "modified", label: "Last Updated On", type: "datetime" },
  // Frappe's standard "Liked By" (_liked_by): the ♥ heading adds "Liked By like %<me>%". Answered from
  // the likes table (like-rules.ts), not by list-where.ts.
  { key: "_liked_by", label: "Liked By", type: "data" },
  { key: "item_code", label: "Item Code (Purchase Order Item)", type: "link", child: "items" },
  { key: "item_name", label: "Item Name (Purchase Order Item)", type: "data", child: "items" },
  { key: "material_request", label: "Material Request (Purchase Order Item)", type: "link", child: "items" },
];

export const fieldByKey = (key: string) => LIST_FIELDS.find((f) => f.key === key);

/** ERPNext's filter operators and their labels. */
export const OPERATORS = {
  "=": "Equals",
  "!=": "Not Equals",
  like: "Like",
  "not like": "Not Like",
  in: "In",
  "not in": "Not In",
  is: "Is",
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
  between: "Between",
} as const;
export type Operator = keyof typeof OPERATORS;

const TEXT_OPS: readonly Operator[] = ["=", "!=", "like", "not like", "in", "not in", "is"];
const RANGE_OPS: readonly Operator[] = ["=", "!=", ">", "<", ">=", "<=", "between", "is"];
export const OPERATORS_BY_TYPE: Record<ListFieldType, readonly Operator[]> = {
  data: TEXT_OPS,
  link: TEXT_OPS,
  select: ["=", "!=", "in", "not in", "is"],
  date: RANGE_OPS,
  datetime: RANGE_OPS,
  number: RANGE_OPS,
  percent: RANGE_OPS,
};

/** "is" takes one of these. */
export const IS_VALUES = ["set", "not set"] as const;

/** One condition: a string, a list (in / not in), or a [from, to] pair (between). */
export interface ListFilter {
  field: string;
  op: Operator;
  value: string | string[];
}

/** The quick-filter bar above the list, left to right. */
export const QUICK_FILTERS = [
  { key: "name", label: "ID", type: "data" },
  { key: "supplier", label: "Supplier", type: "link" },
  { key: "supplier_name", label: "Supplier Name", type: "data" },
  { key: "company", label: "Company", type: "link" },
  { key: "status", label: "Status", type: "select" },
] as const;
export type QuickKey = (typeof QUICK_FILTERS)[number]["key"];

/** The sort selector's fields (ERPNext: the standard ones, then the list's columns). */
export const SORT_FIELDS = [
  { key: "modified", label: "Last Updated On" },
  { key: "name", label: "ID" },
  { key: "creation", label: "Created On" },
  { key: "supplier_name", label: "Supplier Name" },
  { key: "transaction_date", label: "Date" },
  { key: "schedule_date", label: "Required By" },
  { key: "grand_total", label: "Grand Total" },
  { key: "per_received", label: "% Received" },
  { key: "per_billed", label: "% Billed" },
] as const;
export type SortKey = (typeof SORT_FIELDS)[number]["key"];

export const PAGE_LENGTHS = [20, 100, 500, 2500] as const;

export interface ListQuery {
  quick: Partial<Record<QuickKey, string>>;
  filters: ListFilter[];
  sort: SortKey;
  order: "asc" | "desc";
  pageLength: number;
  /** Rows shown: a page, plus one more page for each Load More. */
  limit: number;
}

/** The doctype's own default: last updated first, 20 rows. */
export const DEFAULT_QUERY: ListQuery = { quick: {}, filters: [], sort: "modified", order: "desc", pageLength: 20, limit: 20 };

const MAX_FILTERS = 25;
const MAX_VALUE = 200;
const MAX_ROWS = 10_000;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;
const get = (p: ParamSource, key: string): string | undefined => {
  if (p instanceof URLSearchParams) return p.get(key) ?? undefined;
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
};

const clean = (v: unknown) => String(v ?? "").trim().slice(0, MAX_VALUE);

/** A condition as the builder or the address bar gave it, checked; null if it cannot apply. */
export function normaliseFilter(field: string, op: string, raw: unknown, fields: readonly ListField[] = LIST_FIELDS): ListFilter | null {
  const f = fields.find((x) => x.key === field);
  if (!f || !(OPERATORS_BY_TYPE[f.type] as readonly string[]).includes(op)) return null;
  const o = op as Operator;
  if (o === "in" || o === "not in") {
    const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map(clean).filter(Boolean);
    return list.length ? { field, op: o, value: list.slice(0, 100) } : null;
  }
  if (o === "between") {
    if (!Array.isArray(raw) || raw.length !== 2) return null;
    const [a, b] = raw.map(clean);
    return a && b ? { field, op: o, value: [a, b] } : null;
  }
  const v = clean(Array.isArray(raw) ? raw[0] : raw);
  if (o === "is") return (IS_VALUES as readonly string[]).includes(v) ? { field, op: o, value: v } : null;
  return v ? { field, op: o, value: v } : null;
}

/** Reads the list's state from the address bar; anything malformed is dropped, not guessed. */
export function parseListQuery(p: ParamSource): ListQuery {
  const quick: ListQuery["quick"] = {};
  for (const { key } of QUICK_FILTERS) {
    const v = clean(get(p, key));
    if (v) quick[key] = v;
  }
  if (quick.status && !(PO_STATUSES as readonly string[]).includes(quick.status)) delete quick.status;

  const filters: ListFilter[] = [];
  try {
    const raw = JSON.parse(get(p, "filters") ?? "[]");
    if (Array.isArray(raw)) {
      for (const item of raw.slice(0, MAX_FILTERS)) {
        if (!Array.isArray(item) || item.length !== 3) continue;
        const f = normaliseFilter(String(item[0]), String(item[1]), item[2]);
        if (f) filters.push(f);
      }
    }
  } catch {
    /* a hand-edited address: no builder filters */
  }

  const sortRaw = get(p, "sort");
  const sort = SORT_FIELDS.some((s) => s.key === sortRaw) ? (sortRaw as SortKey) : DEFAULT_QUERY.sort;
  const orderRaw = get(p, "order");
  const order = orderRaw === "asc" || orderRaw === "desc" ? orderRaw : DEFAULT_QUERY.order;
  const lengthRaw = Number(get(p, "pageLength"));
  const pageLength = (PAGE_LENGTHS as readonly number[]).includes(lengthRaw) ? lengthRaw : DEFAULT_QUERY.pageLength;
  const limitRaw = Math.floor(Number(get(p, "limit")));
  const limit = Number.isFinite(limitRaw) && limitRaw >= pageLength ? Math.min(limitRaw, MAX_ROWS) : pageLength;
  return { quick, filters, sort, order, pageLength, limit };
}

/** The address-bar form of a list state; defaults are left out so plain links stay plain. */
export function listQueryToParams(q: ListQuery): URLSearchParams {
  const p = new URLSearchParams();
  for (const { key } of QUICK_FILTERS) if (q.quick[key]) p.set(key, q.quick[key]!);
  if (q.filters.length) p.set("filters", JSON.stringify(q.filters.map((f) => [f.field, f.op, f.value])));
  if (q.sort !== DEFAULT_QUERY.sort) p.set("sort", q.sort);
  if (q.order !== DEFAULT_QUERY.order) p.set("order", q.order);
  if (q.pageLength !== DEFAULT_QUERY.pageLength) p.set("pageLength", String(q.pageLength));
  if (q.limit !== q.pageLength) p.set("limit", String(q.limit));
  return p;
}

/** A link to the list in another state ("?…", or "" for the default). */
export function listHref(base: string, q: ListQuery): string {
  const s = listQueryToParams(q).toString();
  return s ? `${base}?${s}` : base;
}

/** A quick filter as ERPNext applied it: text fields match anywhere, links and Status exactly. */
export function quickToFilter(key: QuickKey, value: string): ListFilter {
  if (key === "name" || key === "supplier_name") return { field: key, op: "like", value: `%${value}%` };
  return { field: key, op: "=", value };
}

/** Every condition in force: the quick-filter bar's, then the builder's. All must hold. */
export function allFilters(q: ListQuery): ListFilter[] {
  const quick = QUICK_FILTERS.flatMap(({ key }) => (q.quick[key] ? [quickToFilter(key, q.quick[key]!)] : []));
  return [...quick, ...q.filters];
}
