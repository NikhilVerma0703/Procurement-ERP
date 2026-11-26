// A Purchase Order printed in one of the old site's print formats (owner, 26-11-2026: "Our Procurement team
// generally uses the 'Purchase Order Template' print format … The final printed Purchase Order must look the
// same as the original website's"). Each of the PO's eleven Jinja formats runs as the old site ran it
// (print/jinja.ts, standard-print.ts renderCustomFormat), and Frappe's Standard print too, over the PO as
// Frappe loaded it for printing: its old row with its current values on top (orders/record.ts
// orderSnapshot: every field under its ERPNext fieldname), its items, taxes, services and payment schedule,
// and its addresses as they are now. The page is assembled as the old print page (receipt-print.ts
// printPage). Checked against the old site's own output (scripts/check-po-prints.ts).
import "server-only";
import { gstBreakupHtml } from "../doc/gst-breakup";
import { orderRecord, currencyDisplay } from "../orders/load";
import { orderSnapshot } from "../orders/record";
import { db } from "../server/db";
import { DEFAULT_PO_PRINT_FORMAT, PO_PRINT_FORMATS } from "./po-formats";
import { printPage, type PrintViewOptions, type ReceiptPrint } from "./receipt-print";
import { LETTER_HEAD_LOGO, renderCustomFormat, renderStandardPrint, type PrintRecord } from "./standard-print";
import { addressRecords, printSystem } from "./standard-print-data";

type Legacy = Record<string, unknown>;

const TABLES = ["items", "taxes", "services_items", "payment_schedule"] as const;

/** The PO as its print read it, with the system values the print looks up; null when there is none. */
export async function orderPrintRecord(id: string) {
  const o = await orderRecord(id);
  if (!o) return null;
  const snapshot = orderSnapshot(o, await currencyDisplay(o.company.defaultCurrency ?? "INR"));
  const raw = (cells: Record<string, { raw: unknown }>) => Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.raw]));
  const values: Legacy = {
    ...((o.legacy ?? {}) as Legacy),
    ...raw(snapshot.header),
    name: o.number,
    docstatus: snapshot.docStatus,
  };
  // Each row: its old row (when it was imported) under its current values.
  const legacyRows: Record<(typeof TABLES)[number], { id: string; legacy?: unknown }[]> = {
    items: o.items, taxes: o.taxes, services_items: o.costOverheads, payment_schedule: o.paymentSchedule,
  };
  const children: Record<string, Legacy[]> = {};
  for (const t of TABLES) {
    const old = new Map(legacyRows[t].map((r) => [r.id, (r.legacy ?? {}) as Legacy]));
    children[t] = (snapshot.tables[t]?.rows ?? []).map((r) => ({ ...(old.get(r.name) ?? {}), ...raw(r.values), idx: r.idx }));
  }
  const record: PrintRecord = { doctype: "Purchase Order", values, children };
  const titles: Record<string, string> = {};
  if (o.taxesAndCharges) {
    const t = await db.purchaseTaxTemplate.findUnique({ where: { code: o.taxesAndCharges.code }, select: { code: true, title: true } });
    if (t) titles[`Purchase Taxes and Charges Template::${t.code}`] = t.title;
  }
  const addressNames = [values.supplier_address, values.shipping_address, values.billing_address, values.dispatch_address].filter((x): x is string => typeof x === "string" && !!x);
  const addresses = await addressRecords(addressNames);
  // India Compliance built the GST Breakup each time the PO was loaded (never stored): the same here, as for
  // a receipt (GST Settings: HSN-wise; the currency precision).
  const supplierAddressState =
    values.gst_category === "Unregistered" && typeof values.supplier_address === "string" ? ((addresses[values.supplier_address]?.gst_state_number as string | null) ?? null) : null;
  values.gst_breakup_table = gstBreakupHtml({ ...values, items: children.items }, { hsnWise: true, precision: 3, supplierAddressState }) ?? values.gst_breakup_table ?? null;
  return { record, number: o.number, docStatus: o.docStatus, system: await printSystem(titles), addresses };
}

/** The PO printed in a format (its name; the old default, PDF PO, when absent or unknown). */
export async function orderPrint(id: string, formatName?: string | null, opts: PrintViewOptions = {}): Promise<ReceiptPrint> {
  const loaded = await orderPrintRecord(id);
  if (!loaded) return { ok: false, status: 404, title: "Not Found", error: "Purchase Order not found" };
  // Print Settings on the old site: drafts print, cancelled documents do not.
  if (loaded.docStatus === "CANCELLED") return { ok: false, status: 403, title: "Not Permitted", error: "Not allowed to print cancelled documents" };
  if (formatName === "Standard") {
    const body = renderStandardPrint(loaded.record, loaded.system, {
      letterHead: opts.letterhead === "" ? null : LETTER_HEAD_LOGO,
      compactItemPrint: opts.compactItemPrint, printUomAfterQuantity: opts.printUomAfterQuantity, printTaxesWithZeroAmount: opts.printTaxesWithZeroAmount,
    });
    return { ok: true, number: loaded.number, format: "Standard", html: await printPage(`Purchase Order ${loaded.number} - Standard`, "", body, opts) };
  }
  const format = PO_PRINT_FORMATS.find((f) => f.name === formatName) ?? PO_PRINT_FORMATS.find((f) => f.name === DEFAULT_PO_PRINT_FORMAT)!;
  let body: string;
  try {
    body = renderCustomFormat(format.html, loaded.record, loaded.system, { addresses: loaded.addresses });
  } catch (e) {
    // The old print view showed the error in place of the print.
    const message = (e instanceof Error ? e.message : String(e)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    body = `<div class="print-format-error"><h4>Error</h4><pre>${message}</pre></div>`;
  }
  return { ok: true, number: loaded.number, format: format.name, html: await printPage(`Purchase Order ${loaded.number} - ${format.name}`, format.css, body, opts) };
}
