// A DocType's list as the old site drew it, from the DocType's own definition (owner, 24-11-2026:
// "make all these remainings", and the Gate Entry List "looking different … some extra columns and
// icons"). Frappe 14.101's list view, read from the old site's own list bundle (captured
// 23-11-2026, list.bundle.FKJ6F4OQ.js) and checked against every captured list heading:
//
//   * COLUMNS (setup_columns): the title field (or ID) first, the hidden Tag column, Status when the
//     DocType has an indicator, then its "in list view" fields (not the title field; not status when
//     there is an indicator) — cut to 4 columns in a window up to 1366 px wide, 6 below 1920 px and
//     10 from 1920 px (the Tag column counts). Then ID, when the title is another field (unless the
//     list hides it). So a wider screen shows more columns: the owner's screen showed Gate Entry's
//     Po No, Inward No, Supplier and Inward Date; a narrower one only Po No.
//   * STANDARD FILTERS (make_standard_filters): ID ("like"), then the title field and the "in
//     standard filter" fields in the form's order; text fields match with "like", the rest "=".
//   * SORT (get_sort_options): Last Updated On, the sort field, the title field, ID, Created On, Most
//     Used, then the mandatory, bold and "in list view" fields.
//   * STATUS (frappe.get_indicator + each DocType's listview_settings.get_indicator, captured in
//     live-meta-20261121.json): Draft / Cancelled first for a submittable DocType, then the
//     DocType's own rule, Submitted, the status by its words, Enabled / Disabled.
//   * COUNT (get_count_str): "20 of 77"; past 1,000 rows the old list counted only to 1,001 and
//     showed "1,000+", the exact count a click away.
// Pure: the page (server), the list (browser) and the tests share it.

import { flt } from "../calc/pymath";
import { formatNumber } from "../format";
import { LAYOUT_TYPES, type DoctypeLayout, type LayoutField } from "./layout";

/** Field types that hold no value (frappe.model.no_value_type). */
const NO_VALUE = new Set([...LAYOUT_TYPES, "HTML", "Table", "Table MultiSelect", "Button", "Image", "Fold", "Heading"]);
export const isValueField = (f: LayoutField) => !NO_VALUE.has(f.fieldtype);
const hasField = (l: DoctypeLayout, name: string) => l.fields.some((f) => f.fieldname === name);

export type IndicatorColour = "red" | "orange" | "yellow" | "green" | "blue" | "gray";

/** A status pill: its words, colour, and the list filter a click on it applies (Frappe's data-filter). */
export interface Indicator {
  label: string;
  colour: IndicatorColour;
  filter?: string;
}

/** Frappe's has_words: does the text contain any of the words (case as written)? */
const hasWords = (words: string[], text: string) => words.some((w) => text.includes(w));

/** frappe.utils.guess_colour: a status's colour by its words. */
export function guessColour(text: string): IndicatorColour {
  if (!text) return "gray";
  if (hasWords(["Pending", "Review", "Medium", "Not Approved"], text)) return "orange";
  if (hasWords(["Open", "Urgent", "High", "Failed", "Rejected", "Error"], text)) return "red";
  if (hasWords(["Closed", "Finished", "Converted", "Completed", "Complete", "Confirmed", "Approved", "Yes", "Active", "Available", "Paid", "Success"], text)) return "green";
  if (hasWords(["Submitted"], text)) return "blue";
  return "gray";
}

type Doc = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** System Settings › Float Precision (3), as frappe.defaults.get_default("float_precision"). */
const FLOAT_PRECISION = 3;

/** Each DocType's own listview_settings.get_indicator (ERPNext 14.92, as the old site served them). */
const LIST_INDICATORS: Record<string, (doc: Doc) => Indicator | null> = {
  "Material Request": (doc) => {
    const ds = num(doc.docstatus);
    const ordered = flt(num(doc.per_ordered), FLOAT_PRECISION);
    const received = flt(num(doc.per_received), FLOAT_PRECISION);
    const type = str(doc.material_request_type);
    if (doc.status === "Stopped") return { label: "Stopped", colour: "red", filter: "status,=,Stopped" };
    if (doc.transfer_status && ds !== 2) {
      if (doc.transfer_status === "Not Started") return { label: "Not Started", colour: "orange" };
      if (doc.transfer_status === "In Transit") return { label: "In Transit", colour: "yellow" };
      if (doc.transfer_status === "Completed") return { label: "Completed", colour: "green" };
      return null;
    }
    if (ds === 1 && ordered === 0) return { label: "Pending", colour: "orange", filter: "per_ordered,=,0" };
    if (ds === 1 && ordered < 100) return { label: "Partially ordered", colour: "yellow", filter: "per_ordered,<,100" };
    if (ds === 1 && ordered === 100) {
      if (type === "Purchase" && received < 100 && received > 0) return { label: "Partially Received", colour: "yellow", filter: "per_received,<,100" };
      if (type === "Purchase" && received === 100) return { label: "Received", colour: "green", filter: "per_received,=,100" };
      if (type === "Purchase") return { label: "Ordered", colour: "green", filter: "per_ordered,=,100" };
      if (type === "Material Transfer") return { label: "Transfered", colour: "green", filter: "per_ordered,=,100" };
      if (type === "Material Issue") return { label: "Issued", colour: "green", filter: "per_ordered,=,100" };
      if (type === "Customer Provided") return { label: "Received", colour: "green", filter: "per_ordered,=,100" };
      if (type === "Manufacture") return { label: "Manufactured", colour: "green", filter: "per_ordered,=,100" };
    }
    return null;
  },
  "Stock Entry": (doc) => {
    const ds = num(doc.docstatus);
    if (num(doc.is_return) === 1 && doc.purpose === "Material Transfer for Manufacture") {
      return { label: "Material Returned from WIP", colour: "orange", filter: "is_return,=,1|purpose,=,Material Transfer for Manufacture|docstatus,<,2" };
    }
    if (ds === 0) return { label: "Draft", colour: "red", filter: "docstatus,=,0" };
    if (doc.purpose === "Send to Warehouse" && num(doc.per_transferred) < 100) return { label: "Goods In Transit", colour: "gray", filter: "per_transferred,<,100" };
    if (doc.purpose === "Send to Warehouse" && num(doc.per_transferred) === 100) return { label: "Goods Transferred", colour: "green", filter: "per_transferred,=,100" };
    if (ds === 2) return { label: "Canceled", colour: "red", filter: "docstatus,=,2" };
    return { label: "Submitted", colour: "blue", filter: "docstatus,=,1" };
  },
  "Delivery Note": (doc) => {
    if (num(doc.is_return) === 1) return { label: "Return", colour: "gray", filter: "is_return,=,Yes" };
    if (doc.status === "Closed") return { label: "Closed", colour: "green", filter: "status,=,Closed" };
    if (doc.status === "Return Issued") return { label: "Return Issued", colour: "gray", filter: "status,=,Return Issued" };
    if (flt(num(doc.per_billed), 2) < 100) return { label: "To Bill", colour: "orange", filter: "per_billed,<,100" };
    if (flt(num(doc.per_billed), 2) === 100) return { label: "Completed", colour: "green", filter: "per_billed,=,100" };
    return null;
  },
  "Pick List": (doc) => {
    const colours: Record<string, IndicatorColour> = { Draft: "gray", Open: "orange", Completed: "green", Cancelled: "red" };
    const s = str(doc.status);
    return { label: s, colour: colours[s] ?? "gray", filter: `status,=,${s}` };
  },
  "Delivery Trip": (doc) => {
    const s = str(doc.status);
    if (s === "Cancelled" || s === "Draft") return { label: s, colour: "red", filter: `status,=,${s}` };
    if (s === "In Transit" || s === "Scheduled") return { label: s, colour: "orange", filter: `status,=,${s}` };
    if (s === "Completed") return { label: s, colour: "green", filter: `status,=,${s}` };
    return null;
  },
};

/** frappe.has_indicator: does the list have a Status column? */
export function hasIndicator(l: DoctypeLayout): boolean {
  return l.isSubmittable || l.doctype in LIST_INDICATORS || hasField(l, "enabled") || hasField(l, "disabled");
}

/** frappe.get_indicator for a record of the list (no workflow and no document states on these DocTypes). */
export function docIndicator(l: DoctypeLayout, doc: Doc): Indicator | null {
  const ds = num(doc.docstatus);
  if (l.isSubmittable && ds === 0) return { label: "Draft", colour: "red", filter: "docstatus,=,0" };
  if (l.isSubmittable && ds === 2) return { label: "Cancelled", colour: "red", filter: "docstatus,=,2" };
  const own = LIST_INDICATORS[l.doctype]?.(doc);
  if (own) return own;
  if (l.isSubmittable && ds === 1) return { label: "Submitted", colour: "blue", filter: "docstatus,=,1" };
  if (doc.status) return { label: str(doc.status), colour: guessColour(str(doc.status)), filter: `status,=,${str(doc.status)}` };
  if (hasField(l, "enabled")) return num(doc.enabled) ? { label: "Enabled", colour: "blue", filter: "enabled,=,1" } : { label: "Disabled", colour: "gray", filter: "enabled,=,0" };
  if (hasField(l, "disabled")) return num(doc.disabled) ? { label: "Disabled", colour: "gray", filter: "disabled,=,1" } : { label: "Enabled", colour: "blue", filter: "disabled,=,0" };
  return null;
}

/** The pill's tooltip (get_indicator_html): the document's state. */
export const DOCSTATUS_TITLE = ["Document is in draft state", "Document has been submitted", "Document has been cancelled"] as const;

/** A column of the list. */
export interface ListColumn {
  kind: "subject" | "status" | "field" | "name";
  /** The field shown (the subject's title field; null for ID and Status). */
  field: LayoutField | null;
  label: string;
  /** The narrowest window that shows it: Frappe's 4 / 6 / 10 columns (≤ 1366 px, < 1920 px, ≥ 1920 px). */
  from: 0 | 1367 | 1920;
}

/** The fields Frappe offered as list columns (get_fields_in_list_view, then setup_columns' filter). */
function listViewFields(l: DoctypeLayout, indicator: boolean): LayoutField[] {
  return l.fields.filter((f) => isValueField(f) && f.inListView && f.fieldname !== l.titleField && !(indicator && f.fieldname === "status"));
}

export function listColumns(l: DoctypeLayout, opts: { hideNameColumn?: boolean } = {}): ListColumn[] {
  const title = l.titleField ? l.fields.find((f) => f.fieldname === l.titleField) ?? null : null;
  const indicator = hasIndicator(l);
  const all: (Omit<ListColumn, "from"> | "tag")[] = [
    { kind: "subject", field: title, label: title?.label ?? "ID" },
    "tag",
    ...(indicator ? [{ kind: "status" as const, field: null, label: "Status" }] : []),
    ...listViewFields(l, indicator).map((f) => ({ kind: "field" as const, field: f, label: f.label ?? f.fieldname })),
  ];
  const out: ListColumn[] = [];
  all.slice(0, 10).forEach((c, i) => {
    if (c !== "tag") out.push({ ...c, from: i < 4 ? 0 : i < 6 ? 1367 : 1920 });
  });
  if (!opts.hideNameColumn && l.titleField && l.titleField !== "name") out.push({ kind: "name", field: null, label: "ID", from: 0 });
  return out;
}

/** A standard filter above the list. */
export interface StandardFilter {
  fieldname: string;
  label: string;
  /** "Data" for text (matched with like), else the field's type. */
  fieldtype: string;
  condition: "like" | "=";
  /** A Select's options ("" first); a Link's DocType. */
  options?: string;
}

const TEXTISH = new Set(["Text", "Small Text", "Text Editor", "HTML Editor", "Data", "Code", "Phone", "JSON", "Read Only"]);

export function standardFilters(l: DoctypeLayout): StandardFilter[] {
  const out: StandardFilter[] = [{ fieldname: "name", label: "ID", fieldtype: "Data", condition: "like" }];
  for (const f of l.fields) {
    if (!(f.fieldname === l.titleField || (f.inStandardFilter && isValueField(f)))) continue;
    const text = TEXTISH.has(f.fieldtype);
    let options = f.options;
    if (f.fieldtype === "Select" && f.options) {
      const list = f.options.split("\n");
      options = (list[0] !== "" ? ["", ...list] : list).join("\n");
    }
    out.push({ fieldname: f.fieldname, label: f.label ?? f.fieldname, fieldtype: text ? "Data" : f.fieldtype, condition: text ? "like" : "=", options });
  }
  return out;
}

const STANDARD_LABELS: Record<string, string> = { modified: "Last Updated On", name: "ID", creation: "Created On", idx: "Most Used" };

/** The sort selector's fields (get_sort_options), labelled. */
export function sortOptions(l: DoctypeLayout): { field: string; label: string }[] {
  const order = ["modified", "name", "creation", "idx"];
  if (l.titleField) order.splice(1, 0, l.titleField);
  if (l.sortField) order.splice(1, 0, l.sortField);
  for (const f of l.fields) if ((f.reqd || f.bold || f.inListView) && isValueField(f)) order.push(f.fieldname);
  const seen = new Set<string>();
  const out: { field: string; label: string }[] = [];
  for (const name of order) {
    if (seen.has(name)) continue;
    seen.add(name);
    const f = l.fields.find((x) => x.fieldname === name);
    out.push({ field: name, label: STANDARD_LABELS[name] ?? f?.label ?? name });
  }
  return out;
}

/** The old list's count: only to 1,001 unless the exact count was asked for ("1,000+"). */
export const COUNT_UPPER_BOUND = 1001;
export function countLabel(shown: number, total: number, exact: boolean): string {
  const of = !exact && total >= COUNT_UPPER_BOUND ? `${formatNumber(COUNT_UPPER_BOUND - 1, 0)}+` : formatNumber(total, 0);
  return `${formatNumber(shown, 0)} of ${of}`;
}
export const isEstimatedCount = (total: number, exact: boolean) => !exact && total >= COUNT_UPPER_BOUND;

/** The old list's page lengths and "Load More". */
export const DOC_PAGE_LENGTHS = [20, 100, 500, 2500] as const;

// ---------------------------------------------------------------------------------------------
// The list's state in the address bar, as Frappe's route options wrote a filter: "field=value" for
// equals, "field=[\"like\",\"%x%\"]" for any other condition; the list's own settings start with
// "_" (sort, order, page length, rows shown, the exact count).

export type DocOperator = "=" | "!=" | "like" | "not like" | "in" | "not in" | "is" | ">" | "<" | ">=" | "<=" | "between";
const OPERATORS: readonly DocOperator[] = ["=", "!=", "like", "not like", "in", "not in", "is", ">", "<", ">=", "<=", "between"];

export interface DocFilter {
  field: string;
  op: DocOperator;
  value: string | string[];
}

export interface DocListQuery {
  filters: DocFilter[];
  sort: string;
  order: "asc" | "desc";
  pageLength: number;
  limit: number;
  /** The exact count, asked for by a click on "1,000+". */
  exact: boolean;
}

/** Fields a list may filter or sort on besides the layout's: Frappe's standard fields. */
export const STANDARD_LIST_FIELDS = ["name", "owner", "modified_by", "creation", "modified", "docstatus", "idx", "_liked_by"] as const;

const MAX_VALUE = 200;
type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const entries = (p: Params): [string, string][] =>
  p instanceof URLSearchParams ? [...p.entries()] : Object.entries(p).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]]));

/** Can this list filter on the field? */
export function filterable(l: DoctypeLayout, field: string): boolean {
  return (STANDARD_LIST_FIELDS as readonly string[]).includes(field) || l.fields.some((f) => f.fieldname === field && isValueField(f));
}

/** One condition from the address bar, checked; null when it cannot apply. */
export function parseFilterValue(field: string, raw: string): DocFilter | null {
  let op: DocOperator = "=";
  let value: unknown = raw;
  if (raw.startsWith("[")) {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j) && j.length === 2 && typeof j[0] === "string" && (OPERATORS as readonly string[]).includes(j[0].toLowerCase())) {
        op = j[0].toLowerCase() as DocOperator;
        value = j[1];
      }
    } catch {
      /* a value that only starts with "[" */
    }
  }
  if (op === "in" || op === "not in" || op === "between") {
    const list = (Array.isArray(value) ? value : String(value ?? "").split(",")).map((v) => String(v ?? "").trim().slice(0, MAX_VALUE)).filter(Boolean);
    if (op === "between") return list.length === 2 ? { field, op, value: list } : null;
    return list.length ? { field, op, value: list.slice(0, 100) } : null;
  }
  const v = String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim().slice(0, MAX_VALUE);
  if (op === "is") return v === "set" || v === "not set" ? { field, op, value: v } : null;
  return v ? { field, op, value: v } : null;
}

export function parseDocListQuery(l: DoctypeLayout, p: Params, defaults: { sort: string; order: "asc" | "desc" }): DocListQuery {
  const filters: DocFilter[] = [];
  let sort = defaults.sort;
  let order = defaults.order;
  let pageLength = 20;
  let limit = 0;
  let exact = false;
  const sorts = new Set(sortOptions(l).map((s) => s.field));
  for (const [k, raw] of entries(p)) {
    if (k === "_sort") sort = sorts.has(raw) ? raw : sort;
    else if (k === "_order") order = raw === "asc" ? "asc" : raw === "desc" ? "desc" : order;
    else if (k === "_page_length") pageLength = (DOC_PAGE_LENGTHS as readonly number[]).includes(Number(raw)) ? Number(raw) : pageLength;
    else if (k === "_limit") limit = Math.min(Math.max(Math.trunc(Number(raw)) || 0, 0), 10_000);
    else if (k === "_count") exact = raw === "exact";
    else if (filterable(l, k) && filters.length < 25) {
      const f = parseFilterValue(k, raw);
      if (f) filters.push(f);
    }
  }
  return { filters, sort, order, pageLength, limit: Math.max(limit, pageLength), exact };
}

/** The address bar's query for a list state (only what differs from the defaults). */
export function docListParams(q: DocListQuery, defaults: { sort: string; order: "asc" | "desc" }): URLSearchParams {
  const s = new URLSearchParams();
  for (const f of q.filters) s.set(f.field, f.op === "=" && typeof f.value === "string" ? f.value : JSON.stringify([f.op, f.value]));
  if (q.sort !== defaults.sort) s.set("_sort", q.sort);
  if (q.order !== defaults.order) s.set("_order", q.order);
  if (q.pageLength !== 20) s.set("_page_length", String(q.pageLength));
  if (q.limit !== q.pageLength) s.set("_limit", String(q.limit));
  if (q.exact) s.set("_count", "exact");
  return s;
}

/** A pill's or a cell's data-filter ("field,op,value|…") as the list's conditions. */
export function filtersFromDataFilter(spec: string): DocFilter[] {
  return spec
    .split("|")
    .map((part): DocFilter | null => {
      const [field, op, ...rest] = part.split(",");
      const o = (op ?? "").toLowerCase();
      if (!field || !(OPERATORS as readonly string[]).includes(o)) return null;
      return { field, op: o as DocOperator, value: rest.join(",") };
    })
    .filter((f): f is DocFilter => f !== null);
}

/** Replaces the conditions on the same fields with these (a click on a pill or a value). */
export function withFilters(current: DocFilter[], add: DocFilter[]): DocFilter[] {
  const fields = new Set(add.map((f) => f.field));
  return [...current.filter((f) => !fields.has(f.field)), ...add];
}

// ---------------------------------------------------------------------------------------------
// The rows as the list draws them (get_column_html): what each cell shows and what a click on it
// filters by. Computed on the server; the list in the browser only draws them.

/** A column as the browser draws it. */
export interface ListColumnView {
  kind: ListColumn["kind"];
  label: string;
  from: ListColumn["from"];
  numeric: boolean;
}

/** One cell of a row (a "Field" column). */
export interface ListCell {
  text: string;
  /** link: a filterable value; pill: a Select's value in a pill; check; percent: a bar; text: long text, not filterable. */
  kind: "link" | "pill" | "check" | "percent" | "text";
  colour?: IndicatorColour;
  /** The filter a click applies ("field,=,value"). */
  filter?: string;
  /** Percent: the bar's width. */
  percent?: number;
  /** Frappe's tooltip: "Label: value". */
  title: string;
}

export interface ListRowView {
  id: string;
  name: string;
  /** The subject's words (the title field, or the name). */
  subject: string;
  indicator: Indicator | null;
  docstatus: number;
  /** One per column: null where the column is the subject, status or ID. */
  cells: (ListCell | null)[];
  comments: number;
  /** When it last changed (ISO), and as the tooltip shows it. */
  modified: string;
  modifiedTitle: string;
}

export const NUMERIC_TYPES = new Set(["Currency", "Float", "Int", "Percent"]);

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** A Field column's cell, as get_column_html drew it. */
export function listCell(f: LayoutField, doc: Record<string, unknown>, format: (f: LayoutField, v: unknown, doc: Record<string, unknown>) => string): ListCell {
  const raw = doc[f.fieldname];
  const value = raw === null || raw === undefined ? "" : raw;
  const label = f.label ?? f.fieldname;
  if (f.fieldtype === "Percent") {
    const n = num(value);
    return { text: format(f, n, doc), kind: "percent", percent: Math.round(n), title: `${label}: ${n}` };
  }
  if (f.fieldtype === "Check") {
    return { text: num(value) ? "1" : "0", kind: "check", filter: `${f.fieldname},=,${num(value)}`, title: `${label}: ${num(value)}` };
  }
  if (["Text Editor", "Text", "Small Text", "HTML Editor", "Markdown Editor"].includes(f.fieldtype) || (f.fetchFrom && ["Text", "Small Text"].includes(f.fieldtype))) {
    const t = stripHtml(str(value));
    return { text: t, kind: "text", title: `${label}: ${t}` };
  }
  if (f.fieldtype === "Select") {
    const t = str(value);
    return { text: t, kind: "pill", colour: guessColour(t), filter: `${f.fieldname},=,${t}`, title: `${label}: ${t}` };
  }
  if (f.fieldtype === "Link" || f.fieldtype === "Dynamic Link") {
    const t = str(value);
    return { text: t, kind: "link", filter: `${f.fieldname},=,${t}`, title: `${label}: ${t}` };
  }
  const shown = value === "" ? "" : format(f, value, doc);
  return { text: shown, kind: "link", filter: `${f.fieldname},=,${str(value)}`, title: `${label}: ${shown}` };
}
