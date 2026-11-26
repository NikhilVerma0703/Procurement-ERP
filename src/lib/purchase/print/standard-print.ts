// Frappe's "Standard" print (docs/15, X3; owner 26-11-2026: "If the original website provides a Print
// option, our Procurement ERP must also provide the same option"). The old site offered it on every
// DocType: the form's own fields, laid out by its sections and columns, printed by Frappe's
// standard.html. Here the same templates run (frappe-templates.ts) over the record as Frappe handed it to
// them, with Frappe 14.101.1's and ERPNext 14.92.14's Python ported:
//
//   * printview.make_layout, is_visible, has_value, get_visible_columns, column_has_value;
//   * BaseDocument.get_formatted / is_print_hide, formatters.format_value, utils.fmt_money,
//     meta.get_field_precision / get_field_currency (the old site's System Settings: number format
//     #,###.###, currency and float precision 3, dates dd-mm-yyyy, read 26-11-2026);
//   * ERPNext's AccountsController.before_print (the item, quantity, total and tax templates; Discount
//     Amount printed only without taxes) and print_settings.py; Accounts Settings: taxes not as a table,
//     inclusive tax not shown.
//
// Pure: the record, its child rows and what the format looks up (currencies, the companies' currency,
// linked titles) are handed in (standard-print-data.ts loads them).
import { flt, pyFormatFixed, pyMod, pyRound } from "../calc/pymath";
import type { LayoutField } from "../doc/layout";
import { LAYOUTS } from "../doc/layouts";
import { pyStr } from "../pdf/pyfmt";
import { FRAPPE_TEMPLATES } from "./frappe-templates";
import { isKeywords, PyInt, pyBool, pyDict, pyDoc, PyUndefined, registerTemplates, renderJinja, type PyObject } from "./jinja";

registerTemplates(FRAPPE_TEMPLATES);

type Legacy = Record<string, unknown>;

/** The old site's System Settings (read 26-11-2026). */
const NUMBER_FORMAT: string = "#,###.###";
const CURRENCY_PRECISION = 3;
const FLOAT_PRECISION = 3;
const NUMBER_FORMAT_INFO: Record<string, [string, string, number]> = {
  "#,###.##": [".", ",", 2], "#.###,##": [",", ".", 2], "# ###.##": [".", " ", 2], "# ###,##": [",", " ", 2], "#'###.##": [".", "'", 2],
  "#, ###.##": [".", ", ", 2], "#,##,###.##": [".", ",", 2], "#,###.###": [".", ",", 3], "#.###": ["", ".", 0], "#,###": ["", ",", 0], "#.########": [".", "", 8],
};

/** The "Logo" letter head (the old site's only one, its default). */
export const LETTER_HEAD_LOGO = `<div style="text-align: left;">\n<img alt="Logo" src="/files/pacific_logo.png" style="width: 32.0px;" width="32.0">\n</div>`;

/** The DocTypes whose controller was ERPNext's AccountsController (its before_print ran). */
const ACCOUNTS_CONTROLLER = new Set([
  "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Supplier Quotation", "Material Request", "Stock Entry", "Stock Reconciliation",
  "Delivery Note", "Sales Order", "Sales Invoice", "Quotation",
]);
const DISCOUNT_IN_PRINT = new Set(["Purchase Order", "Sales Order", "Sales Invoice", "Purchase Invoice", "Supplier Quotation", "Purchase Receipt", "Delivery Note", "Quotation"]);

/** The Python class a DocType's documents had (the "no such element" text names it). */
const CLASS_OF: Record<string, string> = {
  "Purchase Receipt": "erpnext.stock.doctype.purchase_receipt.purchase_receipt.PurchaseReceipt",
  "Purchase Order": "erpnext.buying.doctype.purchase_order.purchase_order.PurchaseOrder",
  Address: "erpnext.accounts.custom.address.ERPNextAddress",
};
const classOf = (doctype: string, module: string | null | undefined) => {
  if (CLASS_OF[doctype]) return CLASS_OF[doctype];
  const scrub = (s: string) => s.toLowerCase().replace(/[ -]/g, "_");
  const app = module === "Pacific Group" ? "pacific_group" : module === "Contacts" || module === "Core" ? "frappe" : "erpnext";
  return `${app}.${scrub(module ?? "")}.doctype.${scrub(doctype)}.${scrub(doctype)}.${doctype.replace(/[ -]/g, "")}`;
};

export interface PrintSystem {
  /** Each currency: its symbol and fraction units (Currency). */
  currencies: Record<string, { symbol: string | null; fractionUnits: number | null; symbolOnRight?: boolean }>;
  /** Each company's default currency. */
  companyCurrency: Record<string, string>;
  /** Linked records shown by their title ("DocType::name" → title): set_link_titles. */
  linkTitles: Record<string, string>;
  defaultCurrency: string;
}

export interface StandardPrintOptions {
  /** The letter head's content, or null for "No Letterhead". */
  letterHead: string | null;
  compactItemPrint?: boolean;
  printUomAfterQuantity?: boolean;
  printTaxesWithZeroAmount?: boolean;
}

export interface PrintRecord {
  doctype: string;
  /** The record's row as the old site stored it (its fieldnames), with its child rows by table field. */
  values: Legacy;
  children: Record<string, Legacy[]>;
}

// ---------------------------------------------------------------------------------------------
// Values as Python held them

const FLOATS = new Set(["Float", "Currency", "Percent"]);
const INTS = new Set(["Int", "Check"]);
const unwrap = (v: unknown) => (v instanceof PyInt ? v.v : v);

function pyValue(fieldtype: string | undefined, name: string, v: unknown): unknown {
  if ((fieldtype && INTS.has(fieldtype)) || name === "idx" || name === "docstatus") return new PyInt(v === null || v === undefined || v === "" ? 0 : Math.trunc(Number(unwrap(v))) || 0);
  if (fieldtype && FLOATS.has(fieldtype)) return v === null || v === undefined || v === "" ? 0 : Number(unwrap(v)) || 0;
  if (v === undefined) return null;
  if (fieldtype === "Datetime" && typeof v === "string") return v.replace(/\.0+$/, "");
  return v;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");
const cint = (v: unknown) => {
  const n = Number.parseInt(String(unwrap(v) ?? ""), 10);
  return Number.isNaN(n) ? 0 : n;
};

// ---------------------------------------------------------------------------------------------
// formatters

/** frappe.utils.fmt_money. */
export function fmtMoney(amount: unknown, precision: number | null, currency: string | null, sys: PrintSystem): string {
  const [decimalStr, commaStr, nfPrecision] = NUMBER_FORMAT_INFO[NUMBER_FORMAT] ?? [".", ",", 2];
  let p = precision ?? (CURRENCY_PRECISION || nfPrecision);
  let a = typeof amount === "string" ? flt(amount, p) : Number(unwrap(amount)) || 0;
  if (decimalStr) {
    const after = pyStr(pyRound(pyMod(a, 1), p)).split(".");
    const decimals = after.length > 1 ? after[1] : after[0];
    if (p > 2) {
      if (decimals.length < 3) p = currency ? String(sys.currencies[currency]?.fractionUnits || 100).length - 1 : nfPrecision;
      else if (decimals.length < p) p = decimals.length;
    }
  }
  a = pyRound(a, p);
  const fixed = pyFormatFixed(a, p);
  const decimals = fixed.includes(".") ? fixed.split(".")[1] : "";
  const minus = Number(fixed) < 0 ? "-" : "";
  let whole = pyStr(Math.abs(Number(fixed))).split(".")[0];
  const parts: string[] = [];
  if (whole.length > 3) {
    parts.push(whole.slice(-3));
    whole = whole.slice(0, -3);
    const step = NUMBER_FORMAT === "#,##,###.##" ? 2 : 3;
    while (whole.length > step) {
      parts.push(whole.slice(-step));
      whole = whole.slice(0, -step);
    }
  }
  parts.push(whole);
  parts.reverse();
  let out = parts.join(commaStr) + (p && decimalStr ? decimalStr + decimals : "");
  if (out !== "0") out = minus + out;
  if (currency) {
    const c = sys.currencies[currency];
    const symbol = c?.symbol || currency;
    out = c?.symbolOnRight ? `${out} ${symbol}` : `${symbol} ${out}`;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** formatdate (dd-mm-yyyy), format_datetime, format_time. */
function formatDate(v: unknown): string {
  const s = String(v ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}
function formatDatetime(v: unknown): string {
  const s = String(v ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}` : formatDate(s);
}
function formatTime(v: unknown): string {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(String(v ?? ""));
  return m ? `${pad(Number(m[1]))}:${m[2]}:${m[3]}` : String(v ?? "");
}

/** meta.get_field_precision. */
function fieldPrecision(df: PyObject): number {
  if (df.precision) return cint(df.precision);
  return df.fieldtype === "Currency" ? CURRENCY_PRECISION || NUMBER_FORMAT_INFO[NUMBER_FORMAT][2] : FLOAT_PRECISION;
}

/** meta.get_field_currency (on the document handed to the formatter: the parent for a child row). */
function fieldCurrency(df: PyObject, doc: PyObject | null, sys: PrintSystem): string | null {
  const options = df.options ? String(df.options) : "";
  if (!options || !doc) return null;
  if (options.includes(":")) {
    const [dt, link, field] = options.split(":");
    const linked = (doc as Legacy)[link];
    if (dt === "Company" && field === "default_currency" && linked) return sys.companyCurrency[String(linked)] ?? null;
    return null;
  }
  const own = (doc as Legacy)[options];
  if (typeof own === "string" && own) return own;
  const parent = (doc as Legacy).parent_doc as PyObject | undefined;
  const fromParent = parent ? (parent as Legacy)[options] : null;
  return typeof fromParent === "string" && fromParent ? fromParent : null;
}

/** frappe.utils.formatters.format_value. */
function formatValue(value: unknown, df: PyObject, doc: PyObject | null, currency: string | null, sys: PrintSystem): unknown {
  let v = value === null || value === undefined || value instanceof PyUndefined ? "" : value;
  const ft = String(df.fieldtype ?? "Data");
  if (ft === "Date") return formatDate(v);
  if (ft === "Datetime") return formatDatetime(v);
  if (ft === "Time") return formatTime(v);
  if (Number(unwrap(v)) === 0 && v !== "" && ["Int", "Float", "Currency", "Percent"].includes(ft) && pyBool(df.print_hide_if_no_value)) return "";
  if (ft === "Currency") return fmtMoney(v, fieldPrecision(df), currency || fieldCurrency(df, doc, sys) || sys.defaultCurrency, sys);
  if (ft === "Float") {
    let p: number | null = fieldPrecision(df);
    const cur = currency || fieldCurrency(df, doc, sys);
    if (!df.options) {
      const temp = (typeof v === "number" ? pyStr(v) : String(unwrap(v))).split(".");
      if (temp.length === 1 || cint(temp[1]) === 0) p = 0;
    }
    return fmtMoney(v, p, cur, sys);
  }
  if (ft === "Percent") return `${pyStr(flt(Number(unwrap(v)) || 0, 2))}%`;
  if ((ft === "Text" || ft === "Small Text") && typeof v === "string") return /(<br|<div|<p)/.test(v) ? v : v.replace(/\n/g, "<br>");
  if (ft === "Text Editor") return `<div class='ql-snow'>${typeof v === "string" ? v : String(unwrap(v))}</div>`;
  if ((ft === "Link" || ft === "Dynamic Link") && doc && df.options && ft === "Link") {
    const titles = (doc as Legacy).__link_titles as Record<string, string> | undefined;
    v = titles?.[`${df.options}::${v}`] ?? v;
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Meta and documents

function dfOf(f: LayoutField): PyObject {
  return pyDict({
    fieldname: f.fieldname, label: f.label ?? null, fieldtype: f.fieldtype, options: f.options ?? null,
    print_hide: new PyInt(f.printHide ? 1 : 0), print_hide_if_no_value: new PyInt((f as { printHideIfNoValue?: boolean }).printHideIfNoValue ? 1 : 0),
    print_width: (f as { printWidth?: string }).printWidth ?? null, bold: new PyInt(f.bold ? 1 : 0), permlevel: new PyInt(f.permlevel ?? 0),
    precision: f.precision ?? "", translatable: new PyInt(0), hidden: new PyInt(f.hidden ? 1 : 0),
  });
}

const DEFAULT_LABELS: Record<string, string> = { name: "ID", owner: "Created By", modified_by: "Modified By", creation: "Created On", modified: "Last Modified On", _assign: "Assigned To" };

function metaOf(doctype: string, cache: Map<string, PyObject>): PyObject {
  const hit = cache.get(doctype);
  if (hit) return hit;
  const l = LAYOUTS[doctype];
  const fields = (l?.fields ?? []).map(dfOf);
  const byName = new Map(fields.map((f) => [String(f.fieldname), f]));
  const meta = pyDoc("frappe.model.meta.Meta", {
    name: doctype, istable: new PyInt(l?.istable ? 1 : 0), is_submittable: new PyInt(l?.isSubmittable ? 1 : 0), module: l?.module ?? null, fields,
  }, {
    get_field: (fieldname: unknown) => byName.get(String(fieldname)) ?? null,
    has_field: (fieldname: unknown) => byName.has(String(fieldname)),
    get_label: (fieldname: unknown) => (byName.get(String(fieldname))?.label as string | undefined) ?? DEFAULT_LABELS[String(fieldname)] ?? "No Label",
  });
  cache.set(doctype, meta);
  return meta;
}

interface Ctx {
  sys: PrintSystem;
  metas: Map<string, PyObject>;
}

/** A Frappe document as the print templates saw it: every field typed, its child rows, meta and methods. */
function docOf(doctype: string, row: Legacy, children: Record<string, Legacy[]>, ctx: Ctx, parent: PyObject | null): PyObject {
  const meta = metaOf(doctype, ctx.metas);
  const l = LAYOUTS[doctype];
  const values: Legacy = { doctype };
  const types = new Map((l?.fields ?? []).map((f) => [f.fieldname, f.fieldtype]));
  for (const k of ["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", ...(parent ? ["parent", "parentfield", "parenttype"] : [])]) {
    values[k] = pyValue(k === "creation" || k === "modified" ? "Datetime" : undefined, k, row[k]);
  }
  for (const f of l?.fields ?? []) {
    if (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect" || ["Section Break", "Column Break", "Tab Break", "Button", "Fold", "Heading", "Image", "HTML"].includes(f.fieldtype)) continue;
    values[f.fieldname] = pyValue(f.fieldtype, f.fieldname, row[f.fieldname]);
  }
  for (const [k, v] of Object.entries(row)) if (!(k in values) && !types.has(k)) values[k] = pyValue(undefined, k, v);
  const doc = pyDoc(classOf(doctype, l?.module), values) as PyObject;
  const self = doc as Legacy;
  self.meta = meta;
  self.flags = pyDict({});
  self.__link_titles = ctx.sys.linkTitles;
  if (parent) self.parent_doc = parent;
  for (const f of l?.fields ?? []) {
    if (f.fieldtype !== "Table" && f.fieldtype !== "Table MultiSelect") continue;
    self[f.fieldname] = (children[f.fieldname] ?? []).map((r, i) => docOf(f.options ?? "", { ...r, idx: r.idx ?? i + 1 }, {}, ctx, doc));
  }
  const method = (name: string, fn: (...a: unknown[]) => unknown) => Object.defineProperty(doc, name, { value: fn, enumerable: false });
  const kwOf = (args: unknown[]) => (args.length && isKeywords(args[args.length - 1]) ? (args.pop() as Legacy) : {});
  method("get", (...args: unknown[]) => {
    const kw = kwOf(args);
    const key = String(args[0]);
    return key in self ? self[key] : args[1] ?? kw.default ?? null;
  });
  method("set", (key: unknown, value: unknown) => {
    self[String(key)] = value;
    return null;
  });
  method("in_format_data", () => true);
  // BaseDocument.is_print_hide.
  method("is_print_hide", (...args: unknown[]) => {
    kwOf(args);
    const [fieldname, df] = args as [string, PyObject | undefined];
    const metaDf = (meta.get_field as (n: string) => PyObject | null)(fieldname);
    let hide: unknown = 0;
    if (unwrap(self[fieldname]) === 0 && !pyBool(meta.istable)) hide = (df && pyBool(df.print_hide_if_no_value)) || (metaDf && pyBool(metaDf.print_hide_if_no_value));
    if (!pyBool(hide)) {
      if (df && df.print_hide !== null && df.print_hide !== undefined) hide = df.print_hide;
      else if (metaDf) hide = metaDf.print_hide;
    }
    return pyBool(hide);
  });
  // BaseDocument.get_formatted(fieldname, doc=None, currency=None, absolute_value=False, translated=False, format=None).
  method("get_formatted", (...args: unknown[]) => {
    const kw = kwOf(args);
    const fieldname = String(args[0]);
    const docArg = (args[1] ?? kw.doc ?? null) as PyObject | null;
    let currency = (args[2] ?? kw.currency ?? null) as string | null;
    const absolute = pyBool(args[3] ?? kw.absolute_value);
    let df = (meta.get_field as (n: string) => PyObject | null)(fieldname);
    if (!df) df = pyDict({ fieldname, fieldtype: fieldname === "creation" || fieldname === "modified" ? "Datetime" : "Data", options: null, print_hide_if_no_value: new PyInt(0) });
    if (df.fieldtype === "Currency" && !currency && df.options) {
      const cv = self[String(df.options)];
      if (typeof cv === "string" && cv) currency = cv;
    }
    let val = self[fieldname];
    const target = docArg && typeof docArg === "object" && !(docArg instanceof PyUndefined) ? docArg : ((self.parent_doc as PyObject | undefined) ?? doc);
    if ((absolute || pyBool((target as Legacy).absolute_value)) && (typeof val === "number" || val instanceof PyInt)) val = typeof val === "number" ? Math.abs(val) : new PyInt(Math.abs(val.v));
    return formatValue(val, df, target, currency, ctx.sys);
  });
  return doc;
}

// ---------------------------------------------------------------------------------------------
// printview

function hasValue(df: PyObject, doc: PyObject): boolean {
  const v = (doc as Legacy)[String(df.fieldname)];
  if (v === null || v === undefined || v === "" || v instanceof PyUndefined) return false;
  if (typeof v === "string" && !stripHtml(v).trim()) return df.fieldtype === "Text" || df.fieldtype === "Text Editor";
  if (Array.isArray(v) && !v.length) return false;
  return true;
}

function isVisible(df: PyObject, doc: PyObject): boolean {
  if (["Section Break", "Column Break", "Button"].includes(String(df.fieldtype))) return false;
  // A field of a higher permission level printed for those with access to it: none of the old site's
  // printing users had it (Ignore Pricing Rule is the only such field here).
  if (Number(unwrap(df.permlevel) ?? 0) > 0) return false;
  return !(doc.is_print_hide as (f: string, d: PyObject) => boolean)(String(df.fieldname), df);
}

type Section = { columns: { fields: PyObject[] }[]; has_data: boolean; label?: string };

/** printview.make_layout. */
function makeLayout(doc: PyObject, meta: PyObject): unknown[] {
  const layout: Section[][] = [];
  let page: Section[] = [];
  layout.push(page);
  const newSection = (): Section => ({ columns: [], has_data: false });
  const ensureColumn = (p: Section[]) => {
    if (!p[p.length - 1].columns.length) p[p.length - 1].columns.push({ fields: [] });
  };
  for (const df0 of meta.fields as PyObject[]) {
    let df = df0;
    if (df.fieldtype === "Section Break" || page.length === 0) {
      if (page.length > 1 && page[page.length - 1].has_data === false) page.pop();
      const section = newSection();
      if (df.fieldtype === "Section Break" && df.label) section.label = String(df.label);
      page.push(section);
    } else if (df.fieldtype === "Column Break") {
      page[page.length - 1].columns.push({ fields: [] });
    } else {
      ensureColumn(page);
    }
    if (df.fieldtype === "HTML" && df.options) (doc as Legacy)[String(df.fieldname)] = true;
    if (isVisible(df, doc) && hasValue(df, doc)) {
      ensureColumn(page);
      page[page.length - 1].columns[page[page.length - 1].columns.length - 1].fields.push(df);
      page[page.length - 1].has_data = true;
      if (df.fieldtype === "Table") {
        df.rows = [];
        df.start = new PyInt(0);
        df.end = null;
        const rows = (doc as Legacy)[String(df.fieldname)] as PyObject[];
        rows.forEach((row, i) => {
          if (pyBool((row as Legacy).page_break)) {
            df.end = new PyInt(i);
            page = [newSection()];
            layout.push(page);
            ensureColumn(page);
            df = pyDict({ ...df, start: new PyInt(i), end: null });
            page[page.length - 1].columns[page[page.length - 1].columns.length - 1].fields.push(df);
          }
        });
      }
    }
  }
  return layout.map((p) => p.map((s) => pyDict({ ...s, columns: s.columns.map((c) => pyDict({ fields: c.fields })) })));
}

/** printview.get_visible_columns. */
function getVisibleColumns(data: unknown, tableMeta: PyObject, df: PyObject): PyObject[] {
  const rows = Array.isArray(data) ? (data as PyObject[]) : [];
  if (!rows.length) return [];
  const first = rows[0];
  const hidden = (df.hide_in_print_layout as string[] | null) ?? [];
  const columnHasValue = (fieldname: string, col: PyObject) => {
    if ((col.fieldtype === "Float" || col.fieldtype === "Currency") && !pyBool(col.print_hide_if_no_value)) return true;
    return rows.some((r) => {
      const v = (r as Legacy)[fieldname];
      if (!pyBool(v)) return false;
      return typeof v === "string" ? !!stripHtml(v).trim() : true;
    });
  };
  return (tableMeta.fields as PyObject[]).filter((col) => !hidden.includes(String(col.fieldname)) && isVisible(col, first) && columnHasValue(String(col.fieldname), col));
}

/** ERPNext's AccountsController.before_print with print_settings.py. */
function beforePrint(doc: PyObject, opts: StandardPrintOptions) {
  const self = doc as Legacy;
  const doctype = String(self.doctype);
  if (!ACCOUNTS_CONTROLLER.has(doctype)) return;
  const meta = self.meta as PyObject;
  if (DISCOUNT_IN_PRINT.has(doctype)) {
    const df = (meta.get_field as (n: string) => PyObject | null)("discount_amount");
    const taxes = self.taxes as unknown[] | undefined;
    if (df) {
      if (pyBool(self.discount_amount) && Array.isArray(taxes) && !taxes.length) {
        df.print_hide = new PyInt(0);
        self.discount_amount = -(Number(self.discount_amount) || 0);
      } else df.print_hide = new PyInt(1);
    }
  }
  const flags = self.flags as Legacy;
  self.print_templates = pyDict({ items: "templates/print_formats/includes/items.html" });
  const itemTemplates: Legacy = { qty: "templates/print_formats/includes/item_table_qty.html" };
  self.child_print_templates = pyDict({ items: pyDict(itemTemplates) });
  flags.compact_item_fields = ["description", "qty", "rate", "amount"];
  if (opts.compactItemPrint) {
    itemTemplates.description = "templates/print_formats/includes/item_table_description.html";
    (self.child_print_templates as Legacy).items = pyDict(itemTemplates);
    flags.format_columns = (display: string[], compact: string[]) => display.filter((c) => ![...compact, "image", "item_code", "item_name"].includes(c));
  }
  // Accounts Settings on the old site: inclusive tax not shown, taxes not as a table.
  flags.show_inclusive_tax_in_print = new PyInt(0);
  Object.assign(self.print_templates as Legacy, { total: "templates/print_formats/includes/total.html", taxes: "templates/print_formats/includes/taxes.html" });
}

const resolveClass = (classes: unknown) => {
  if (typeof classes === "string") return classes;
  if (Array.isArray(classes)) return classes.filter(Boolean).join(" ");
  return Object.entries((classes ?? {}) as Legacy).filter(([, v]) => pyBool(v)).map(([k]) => k).join(" ");
};

/** The record printed in Frappe's Standard format: the body of the old print view's page. */
export function renderStandardPrint(record: PrintRecord, sys: PrintSystem, opts: StandardPrintOptions): string {
  const ctx: Ctx = { sys, metas: new Map() };
  const doc = docOf(record.doctype, record.values, record.children, ctx, null);
  const self = doc as Legacy;
  self.print_heading = null;
  self.sub_heading = null;
  beforePrint(doc, opts);
  const meta = self.meta as PyObject;
  const printSettings = pyDict({
    repeat_header_footer: new PyInt(1), add_draft_heading: new PyInt(1), allow_print_for_draft: new PyInt(1), with_letterhead: new PyInt(1),
    compact_item_print: new PyInt(opts.compactItemPrint ? 1 : 0), print_uom_after_quantity: new PyInt(opts.printUomAfterQuantity ? 1 : 0),
    print_taxes_with_zero_amount: new PyInt(opts.printTaxesWithZeroAmount ? 1 : 0),
  });
  const frappe = {
    get_meta: (doctype: unknown) => metaOf(String(doctype), ctx.metas),
    render_template: (template: unknown, context: unknown) => renderJinja(String(template ?? ""), (context ?? {}) as Record<string, unknown>),
    utils: { is_image: (v: unknown) => /\.(png|jpe?g|gif|svg|webp|bmp)(\?|$)/i.test(String(v ?? "")) },
  };
  return renderJinja(FRAPPE_TEMPLATES["templates/print_formats/standard.html"], {
    doc, meta, layout: makeLayout(doc, meta), no_letterhead: new PyInt(opts.letterHead ? 0 : 1), trigger_print: new PyInt(0),
    letter_head: opts.letterHead, footer: null, print_settings: printSettings,
    frappe, _: (v: unknown) => v, get_visible_columns: getVisibleColumns, resolve_class: resolveClass,
    guess_mimetype: (v: unknown) => [/\.(png|jpe?g|gif|svg|webp|bmp)(\?|$)/i.test(String(v ?? "")) ? "image/png" : null, null],
  });
}

/** frappe.utils.formatdate(date, "dd-MM-yyyy"): the day in that pattern ("" for none). */
function formatdateAs(v: unknown, pattern: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  if (!m) return v === null || v === undefined || v instanceof PyUndefined ? "" : String(v);
  const fmt = typeof pattern === "string" && pattern ? pattern : "dd-MM-yyyy";
  return fmt.replace(/yyyy/g, m[1]).replace(/MM/g, m[2]).replace(/dd/g, m[3]);
}

/**
 * A record printed in one of its own (Jinja) print formats, as the old site ran them: the document as
 * Frappe handed it over (every field typed, its before_print applied — print_templates, Discount Amount
 * negated without taxes), with the frappe calls the formats make: get_doc of an Address (as it is now),
 * db.get_value, utils.formatdate and format.
 */
export function renderCustomFormat(html: string, record: PrintRecord, sys: PrintSystem, lookups: { addresses: Record<string, Legacy> }): string {
  const ctx: Ctx = { sys, metas: new Map() };
  const doc = docOf(record.doctype, record.values, record.children, ctx, null);
  const self = doc as Legacy;
  self.print_heading = null;
  self.sub_heading = null;
  beforePrint(doc, { letterHead: null });
  const addresses = new Map<string, PyObject>();
  const addressOf = (name: string) => {
    if (!addresses.has(name) && lookups.addresses[name]) addresses.set(name, docOf("Address", lookups.addresses[name], {}, ctx, null));
    return addresses.get(name) ?? null;
  };
  const frappe = {
    get_meta: (doctype: unknown) => metaOf(String(doctype), ctx.metas),
    get_doc: (doctype: unknown, name: unknown) => {
      if (doctype === record.doctype && name === self.name) return doc;
      const found = doctype === "Address" && typeof name === "string" ? addressOf(name) : null;
      if (found) return found;
      throw new Error(`${String(doctype)} ${name === null || name === undefined ? "None" : String(name)} not found`);
    },
    db: {
      get_value: (doctype: unknown, name: unknown, field: unknown) =>
        doctype === "Address" && typeof name === "string" ? ((addressOf(name) as Legacy | null)?.[String(field)] ?? null) : null,
    },
    utils: { formatdate: formatdateAs, is_image: (v: unknown) => /\.(png|jpe?g|gif|svg|webp|bmp)(\?|$)/i.test(String(v ?? "")) },
    format: (value: unknown, df: unknown) => formatValue(value, pyDict((df ?? {}) as Legacy), null, null, sys),
    render_template: (template: unknown, context: unknown) => renderJinja(String(template ?? ""), (context ?? {}) as Record<string, unknown>),
  };
  return renderJinja(html, { doc, frappe, _: (v: unknown) => v });
}
