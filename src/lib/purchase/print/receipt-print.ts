// A Purchase Receipt printed in one of the old site's print formats (owner, 25-11-2026: "exactly
// same look and same work as previous website"; the stores printed receipts 4,442 times in its last
// year). The format's own Jinja template runs (print/jinja.ts) over the receipt as Frappe handed it to
// the template — every field of its DocType, typed as Python held it, its child tables — with the
// frappe calls the templates make answered from this ERP's data. The page is assembled as the old
// print view assembled it: Frappe's print style and the format's CSS in the head, the output inside
// .print-format. Checked against the old site's own prints of PR/25-26/MM-03457
// (scripts/check-receipt-prints.ts).
//
// Two things are not fetched from elsewhere, as the old page did: the QR codes (the QR Codes format
// asked api.qrserver.com for each image) are drawn here from the very text that service received,
// and the logo is the add-on's own (/files/pacific_logo.png, as on the PO sheets).
import "server-only";
import QRCode from "qrcode";
import { LAYOUTS } from "../doc/layouts";
import type { DoctypeLayout, LayoutField } from "../doc/layout";
import { isValueField } from "../doc/list-view";
import { formatCurrency, formatDate } from "../format";
import { db } from "../server/db";
import { readStoredFile } from "../server/files";
import { FRAPPE_PRINT_CSS } from "./print-css";
import { PyInt, pyDict, pyDoc, pyPrint, renderJinja, type PyObject } from "./jinja";
import { DEFAULT_RECEIPT_PRINT_FORMAT, RECEIPT_PRINT_FORMATS } from "./receipt-formats";

type Legacy = Record<string, unknown>;

/** The Python class of each DocType's documents (what Frappe's "no such element" text named). */
const CLASS_OF: Record<string, string> = {
  "Purchase Receipt": "erpnext.stock.doctype.purchase_receipt.purchase_receipt.PurchaseReceipt",
  "Purchase Receipt Item": "erpnext.stock.doctype.purchase_receipt_item.purchase_receipt_item.PurchaseReceiptItem",
  "Purchase Taxes and Charges": "erpnext.accounts.doctype.purchase_taxes_and_charges.purchase_taxes_and_charges.PurchaseTaxesandCharges",
  "Services Items": "pacific_group.pacific_group.doctype.services_items.services_items.ServicesItems",
  "Purchase Receipt Item Supplied": "erpnext.buying.doctype.purchase_receipt_item_supplied.purchase_receipt_item_supplied.PurchaseReceiptItemSupplied",
  "Pricing Rule Detail": "erpnext.accounts.doctype.pricing_rule_detail.pricing_rule_detail.PricingRuleDetail",
  // ERPNext's override of Frappe's Address (hooks.py override_doctype_class).
  Address: "erpnext.accounts.custom.address.ERPNextAddress",
};

const FLOATS = new Set(["Float", "Currency", "Percent"]);
const INTS = new Set(["Int", "Check"]);
const STANDARD = ["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"];
const CHILD_STANDARD = ["parent", "parentfield", "parenttype"];

/** A stored value as Python held it: floats for Float / Currency / Percent (never None: the columns
 *  were NOT NULL DEFAULT 0), ints for Int / Check / idx / docstatus, dates and text as text. */
function pyValue(fieldtype: string | undefined, name: string, v: unknown): unknown {
  if ((fieldtype && INTS.has(fieldtype)) || name === "idx" || name === "docstatus") {
    return new PyInt(v === null || v === undefined || v === "" ? 0 : Math.trunc(Number(v)) || 0);
  }
  if (fieldtype && FLOATS.has(fieldtype)) return v === null || v === undefined || v === "" ? 0 : Number(v) || 0;
  if (v === undefined) return null;
  // str(datetime) leaves out microseconds when there are none.
  if (fieldtype === "Datetime" && typeof v === "string") return v.replace(/\.0+$/, "");
  return v;
}

/** A Currency field's currency: the field its options name, on the row, else on the document. */
function currencyOfField(f: LayoutField, doc: Legacy, fallback: string): string {
  const opt = f.options ?? "";
  return opt && !opt.includes(":") && typeof doc[opt] === "string" && doc[opt] ? (doc[opt] as string) : fallback;
}

interface Currencies {
  [code: string]: { symbol: string | null; fractionUnits: number | null };
}

/** Document.get_formatted(fieldname, doc): the value as the form showed it. */
function getFormatted(layout: DoctypeLayout | undefined, own: Legacy, parent: Legacy | null, currencies: Currencies, fieldname: string): string {
  const f = layout?.fields.find((x) => x.fieldname === fieldname);
  const v = own[fieldname];
  if (v === null || v === undefined) return "";
  const n = Number(v instanceof PyInt ? v.v : v);
  switch (f?.fieldtype) {
    case "Currency": {
      const code = currencyOfField(f, own, parent ? currencyOfField(f, parent, "INR") : "INR");
      const c = currencies[code];
      return formatCurrency(n, { symbol: c?.symbol ?? code, fractionUnits: c?.fractionUnits });
    }
    case "Date":
      return formatDate(String(v));
    case "Int":
    case "Check":
      return String(Math.trunc(n));
    default:
      return typeof v === "string" ? v : pyPrint(v);
  }
}

/** A document (or a child row) as the template saw it. */
function docOf(doctype: string, legacy: Legacy, children: Record<string, PyObject[]>, currencies: Currencies, parent: Legacy | null, extra: Legacy = {}): PyObject {
  const layout = LAYOUTS[doctype];
  const values: Legacy = { doctype };
  const fields = new Map<string, LayoutField>((layout?.fields ?? []).map((f) => [f.fieldname, f]));
  for (const k of [...STANDARD, ...(parent ? CHILD_STANDARD : [])]) values[k] = pyValue(undefined, k, legacy[k]);
  for (const f of layout?.fields ?? []) if (isValueField(f)) values[f.fieldname] = pyValue(f.fieldtype, f.fieldname, legacy[f.fieldname]);
  for (const [k, v] of Object.entries(legacy)) if (!(k in values) && !fields.has(k)) values[k] = pyValue(undefined, k, v);
  for (const f of layout?.fields ?? []) if (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect") values[f.fieldname] = children[f.fieldname] ?? [];
  Object.assign(values, extra);
  const cls = CLASS_OF[doctype] ?? "frappe.model.document.Document";
  return pyDoc(cls, values, {
    get_formatted: (fieldname: unknown, doc?: unknown) =>
      getFormatted(layout, values, doc && typeof doc === "object" ? (doc as Legacy) : parent, currencies, String(fieldname)),
    get: (key: unknown, dflt: unknown = null) => (String(key) in values ? values[String(key)] : dflt),
  });
}

/** The old site's one Purchase Invoice payment schedule row (PINV/25-26/MM-00001, 19-04-2025, final backup
 *  of 25-11-2026): "Puchase Receipt Format" listed every Purchase Invoice's payment schedule — not the
 *  receipt's — so this line printed on every receipt. This ERP has no Purchase Invoices. */
const PURCHASE_INVOICE_PAYMENT_SCHEDULE = [{ parent: "PINV/25-26/MM-00001", payment_term: "45 Days From The Date Of Receipt Of Material", payment_amount: 63071 }];

class FrappeError extends Error {}

/** The frappe calls the templates make, answered from what was loaded. */
function frappeHelpers(doc: PyObject, addresses: Map<string, PyObject>, orders: Map<string, Legacy>) {
  const kw = (args: unknown[]): Record<string, unknown> => {
    const last = args[args.length - 1] as Record<string, unknown> | undefined;
    return last && typeof last === "object" && "__keywords" in last ? last : {};
  };
  const pickFields = (row: Record<string, unknown>, fields: unknown) =>
    pyDict(Array.isArray(fields) && fields.length ? Object.fromEntries(fields.map((f) => [String(f), row[String(f)] ?? null])) : { name: row.name ?? null });
  return {
    get_doc: (doctype: unknown, name: unknown) => {
      if (doctype === "Purchase Receipt" && name === doc.name) return doc;
      if (doctype === "Address") {
        const a = typeof name === "string" ? addresses.get(name) : undefined;
        if (a) return a;
      }
      throw new FrappeError(`${String(doctype)} ${name === null || name === undefined ? "None" : String(name)} not found`);
    },
    db: {
      get_value: (doctype: unknown, name: unknown, field: unknown) => {
        if (name === null || name === undefined) return null;
        if (doctype === "Purchase Order") return orders.get(String(name))?.[String(field)] ?? null;
        if (doctype === "Address") return (addresses.get(String(name)) as Record<string, unknown> | undefined)?.[String(field)] ?? null;
        throw new FrappeError(`frappe.db.get_value is not available here for ${String(doctype)}`);
      },
    },
    get_all: (...args: unknown[]) => {
      const k = kw(args);
      const doctype = args[0];
      const filters = (k.filters ?? (args.length > 1 && args[1] !== k ? args[1] : {})) as Record<string, unknown>;
      const fields = k.fields;
      if (doctype === "Purchase Receipt Item" && filters.parent === doc.name) {
        return (doc.items as PyObject[]).map((r) => pickFields(r as Record<string, unknown>, fields));
      }
      // Its "purchase_receipt" filter named no field the old Purchase Invoice had: nothing came back.
      if (doctype === "Purchase Invoice") return [];
      if (doctype === "Payment Schedule" && filters.parenttype === "Purchase Invoice") {
        return PURCHASE_INVOICE_PAYMENT_SCHEDULE.map((r) => pickFields(r, fields));
      }
      throw new FrappeError(`frappe.get_all is not available here for ${String(doctype)}`);
    },
  };
}

/** The text api.qrserver.com read from an <img src>: the address as the browser sent it (no line
 *  breaks, nothing after #), its query split at & and decoded (+ is a space), the last "data". */
export function qrServerData(src: string): string {
  let s = src.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[\t\n\r]/g, "");
  const hash = s.indexOf("#");
  if (hash >= 0) s = s.slice(0, hash);
  const q = s.indexOf("?");
  // The browser sent other characters as their UTF-8 bytes (%XX); the service read %XX and + back.
  const decode = (x: string) =>
    Buffer.from(
      (x.match(/%[0-9a-fA-F]{2}|[\s\S]/gu) ?? []).flatMap((t) => (t === "+" ? [32] : t.length === 3 && t[0] === "%" ? [parseInt(t.slice(1), 16)] : [...Buffer.from(t, "utf8")])),
    ).toString("utf8");
  let data = "";
  for (const part of (q >= 0 ? s.slice(q + 1) : "").split("&")) {
    const eq = part.indexOf("=");
    if (decode(eq < 0 ? part : part.slice(0, eq)) === "data") data = decode(eq < 0 ? "" : part.slice(eq + 1));
  }
  return data;
}

const QR_SRC = /src="(https?:\/\/api\.qrserver\.com\/v1\/create-qr-code\/[^"]*)"/g;
const LOGO_SRC = "/assets/pacific_group/images/pacific_logo.png";
/** The add-on's logo, as the PO sheets read it (pdf/render.ts SHEET_LOGO_URL). */
const LOGO_FILE = "/files/pacific_logo.png";

/** The QR images drawn here (the service's defaults: 200 × 200, error correction L), and the logo inlined. */
async function localImages(html: string): Promise<string> {
  const qr = new Map<string, string>();
  for (const m of html.matchAll(QR_SRC)) {
    const text = qrServerData(m[1]);
    if (!qr.has(m[1])) qr.set(m[1], await QRCode.toDataURL(text, { errorCorrectionLevel: "L", margin: 1, width: 200 }));
  }
  let out = html.replace(QR_SRC, (_m, src: string) => `src="${qr.get(src)}"`);
  if (out.includes(LOGO_SRC)) {
    const logo = await readStoredFile(LOGO_FILE);
    if (logo) out = out.split(LOGO_SRC).join(`data:image/png;base64,${logo.toString("base64")}`);
  }
  return out;
}

/** What Frappe's print style left to its Bootstrap (the grid and the page): its rules, so the formats lay
 *  out as they did; and the browser's printed page without the screen's grey gutter. */
const BOOTSTRAP_PRINT = `
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-size: 1rem; line-height: 1.5; color: #212529; background-color: #fff; }
p { margin-top: 0; margin-bottom: 1rem; }
b, strong { font-weight: bolder; }
img { vertical-align: middle; border-style: none; }
table { border-collapse: collapse; }
th { text-align: inherit; }
ul { margin-top: 0; margin-bottom: 1rem; }
.row { display: flex; flex-wrap: wrap; margin-right: -15px; margin-left: -15px; }
${Array.from({ length: 12 }, (_, i) => `.col-xs-${i + 1}, .col-md-${i + 1}`).join(", ")} { position: relative; width: 100%; padding-right: 15px; padding-left: 15px; }
${Array.from({ length: 12 }, (_, i) => `.col-xs-${i + 1} { flex: 0 0 ${((i + 1) / 12) * 100}%; max-width: ${((i + 1) / 12) * 100}%; }`).join("\n")}
@page { size: A4; margin: 15mm; }
@media print {
  .print-format-gutter { background: none; padding: 0; }
  .print-format { max-width: none; min-height: 0; padding: 0; margin: 0; border-radius: 0; }
}`;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type ReceiptPrint =
  | { ok: true; number: string; format: string; html: string }
  | { ok: false; status: number; title: string; error: string };

/** The receipt printed in a format (its name; the default when absent or unknown). */
export async function receiptPrint(id: string, formatName?: string | null, opts: { localImages?: boolean } = {}): Promise<ReceiptPrint> {
  const format = RECEIPT_PRINT_FORMATS.find((f) => f.name === formatName) ?? RECEIPT_PRINT_FORMATS.find((f) => f.name === DEFAULT_RECEIPT_PRINT_FORMAT)!;
  const r = await db.purchaseReceipt.findUnique({
    where: { id },
    select: {
      number: true, docStatus: true, legacy: true,
      items: { orderBy: { idx: "asc" }, select: { legacy: true } },
      taxes: { orderBy: { idx: "asc" }, select: { legacy: true } },
      serviceItems: { orderBy: { idx: "asc" }, select: { legacy: true } },
    },
  });
  if (!r) return { ok: false, status: 404, title: "Not Found", error: "Purchase Receipt not found" };
  // Print Settings on the old site: drafts print, cancelled documents do not.
  if (r.docStatus === "CANCELLED") return { ok: false, status: 403, title: "Not Permitted", error: "Not allowed to print cancelled documents" };

  const head = (r.legacy ?? {}) as Legacy;
  const rows = (list: { legacy: unknown }[]) => list.map((x) => (x.legacy ?? {}) as Legacy);
  const [items, taxes, services] = [rows(r.items), rows(r.taxes), rows(r.serviceItems)];
  const currencies: Currencies = Object.fromEntries(
    (await db.purchaseCurrency.findMany({ select: { code: true, symbol: true, fractionUnits: true } })).map((c) => [c.code, { symbol: c.symbol, fractionUnits: c.fractionUnits }]),
  );

  // What the templates look up: the receipt's addresses (as they are now) and its POs.
  const addressNames = [head.supplier_address, head.shipping_address, head.billing_address, head.dispatch_address].filter((x): x is string => typeof x === "string" && !!x);
  const orderNames = [...new Set(items.map((i) => i.purchase_order).filter((x): x is string => typeof x === "string" && !!x))];
  const [addressRows, orderRows] = await Promise.all([
    db.purchaseAddress.findMany({
      where: { code: { in: addressNames } },
      select: {
        code: true, legacy: true, addressTitle: true, addressType: true, addressLine1: true, addressLine2: true, city: true, state: true, country: true,
        pincode: true, emailId: true, phone: true, gstin: true, gstState: true, gstStateNumber: true, gstCategory: true,
      },
    }),
    db.purchaseOrder.findMany({ where: { number: { in: orderNames } }, select: { number: true, legacy: true, orderConfirmationNo: true } }),
  ]);
  const addresses = new Map(
    addressRows.map((a) => [
      a.code,
      docOf("Address", {
        ...((a.legacy ?? {}) as Legacy),
        name: a.code, address_title: a.addressTitle, address_type: a.addressType, address_line1: a.addressLine1, address_line2: a.addressLine2, city: a.city,
        state: a.state, country: a.country, pincode: a.pincode, email_id: a.emailId, phone: a.phone, gstin: a.gstin, gst_state: a.gstState,
        gst_state_number: a.gstStateNumber, gst_category: a.gstCategory,
      }, {}, currencies, null),
    ]),
  );
  const orders = new Map(orderRows.map((o) => [o.number, { ...((o.legacy ?? {}) as Legacy), order_confirmation_no: o.orderConfirmationNo }]));

  const child = (doctype: string, list: Legacy[]) => list.map((x) => docOf(doctype, x, {}, currencies, head));
  const doc = docOf("Purchase Receipt", head, {
    items: child("Purchase Receipt Item", items),
    taxes: child("Purchase Taxes and Charges", taxes),
    services_items: child("Services Items", services),
  }, currencies, null);

  let body: string;
  try {
    body = renderJinja(format.html, { doc, frappe: frappeHelpers(doc, addresses, orders) });
  } catch (e) {
    // The old print view showed the error in place of the print.
    const message = e instanceof Error ? e.message : String(e);
    body = `<div class="print-format-error"><h4>Error</h4><pre>${escapeHtml(message)}</pre></div>`;
  }
  // (The check against the old prints compares the text before the images are swapped.)
  if (opts.localImages !== false) {
    body = await localImages(body);
    // The page runs no script (its values are printed unescaped, as Frappe printed them). The only one a
    // format had — QR Codes' "$('.print-preview').css()" — did nothing on the old page either.
    body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  }
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(`Purchase Receipt ${r.number} - ${format.name}`)}</title>` +
    `<style>${FRAPPE_PRINT_CSS}\n\n${format.css}</style><style>${BOOTSTRAP_PRINT}</style></head>` +
    `<body><div class="print-format-gutter"><div class="print-format">${body}</div></div></body></html>`;
  return { ok: true, number: r.number, format: format.name, html };
}
