// npm run export:data -- --out "<folder>"
//
// Every record of the old site this ERP carries, as readable Excel workbooks grouped by the old
// site's own menus (owner, 23-11-2026: "take proper files of all the POs, suppliers, stock items,
// receipts, gate entries — Buying › Purchase Order, Stock › Items and Pricing, Stock Transactions,
// Stock Reports, Gate Entry List, Receipts"). Read from the local database, which holds exactly the
// old site's backup it was imported from (npm run verify:erpnext); the backup itself stays the
// complete record. Each imported row is written whole, as the old site held it: every field, in the
// old form's order, headed by the old form's label (the captured layouts, src/lib/purchase/doc/
// layouts). Numbers are written as numbers and dates as dates, so Excel can sum and filter them.
//
// COMPANY DATA: write it outside the repository (e.g. the Downloads folder), never into git.
import { mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { LAYOUTS } from "../src/lib/purchase/doc/layouts";
import type { DoctypeLayout, LayoutField } from "../src/lib/purchase/doc/layout";

const db = new PrismaClient();

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

/** One sheet: a table's rows, typed by a captured layout when the old DocType has one. */
interface Sheet {
  name: string;
  /** SQL returning one json object per row, in the sheet's order (column `r`). */
  sql: string;
  /** The old DocType whose layout heads and types the columns (rows that are the old site's own). */
  doctype?: string;
}
interface Book {
  file: string;
  sheets: Sheet[];
}

/** A table that keeps the old site's row whole in `legacy`: parents newest first, child rows by parent and order. */
const legacy = (table: string, kind: "parent" | "child", where = "TRUE"): string =>
  kind === "parent"
    ? `SELECT legacy AS r FROM ${table} WHERE ${where} ORDER BY legacy->>'creation' DESC NULLS LAST, legacy->>'name'`
    : `SELECT legacy AS r FROM ${table} WHERE ${where} ORDER BY legacy->>'parent', (legacy->>'idx')::int NULLS LAST`;

const BOOKS: Book[] = [
  {
    file: "1 Buying - Purchase Order.xlsx",
    sheets: [
      { name: "Purchase Order", doctype: "Purchase Order", sql: legacy("purchase_orders", "parent") },
      { name: "Purchase Order Item", doctype: "Purchase Order Item", sql: legacy("purchase_order_items", "child") },
      { name: "Purchase Taxes and Charges", doctype: "Purchase Taxes and Charges", sql: legacy("purchase_order_taxes", "child") },
      { name: "Services Items", doctype: "Services Items", sql: legacy("purchase_order_cost_overheads", "child") },
      { name: "Payment Schedule", doctype: "Payment Schedule", sql: legacy("purchase_order_payment_schedules", "child") },
      {
        name: "Connections",
        sql: `SELECT jsonb_build_object('Purchase Order', o.number, 'Linked DocType', l.doc_type, 'Linked Document', l.doc_name,
                'Date', l.doc_date, 'Status', l.doc_status) AS r
              FROM purchase_order_links l JOIN purchase_orders o ON o.id = l.order_id ORDER BY o.number, l.doc_type, l.doc_name`,
      },
    ],
  },
  {
    file: "2 Buying - Supplier, Address, Contact.xlsx",
    sheets: [
      { name: "Supplier", doctype: "Supplier", sql: legacy("purchase_suppliers", "parent") },
      { name: "Supplier Group", sql: `SELECT jsonb_build_object('Supplier Group', code, 'Parent Supplier Group', parent_code, 'Is Group', CASE WHEN is_group THEN 1 ELSE 0 END) AS r FROM purchase_supplier_groups ORDER BY code` },
      { name: "Address", doctype: "Address", sql: legacy("purchase_addresses", "parent") },
      {
        name: "Address Links",
        sql: `SELECT jsonb_build_object('Address', a.code, 'Link Document Type', l.link_doctype, 'Link Name', l.link_name, 'Link Title', l.link_title) AS r
              FROM purchase_address_links l JOIN purchase_addresses a ON a.id = l.address_id ORDER BY a.code, l.idx`,
      },
      { name: "Contact", doctype: "Contact", sql: legacy("purchase_contacts", "parent") },
      {
        name: "Contact Email",
        sql: `SELECT jsonb_build_object('Contact', c.code, 'Email ID', e.email_id, 'Is Primary', CASE WHEN e.is_primary THEN 1 ELSE 0 END) AS r
              FROM purchase_contact_emails e JOIN purchase_contacts c ON c.id = e.contact_id ORDER BY c.code, e.idx`,
      },
      {
        name: "Contact Phone",
        sql: `SELECT jsonb_build_object('Contact', c.code, 'Number', p.phone, 'Is Primary Phone', CASE WHEN p.is_primary_phone THEN 1 ELSE 0 END,
                'Is Primary Mobile', CASE WHEN p.is_primary_mobile_no THEN 1 ELSE 0 END) AS r
              FROM purchase_contact_phones p JOIN purchase_contacts c ON c.id = p.contact_id ORDER BY c.code, p.idx`,
      },
      {
        name: "Contact Links",
        sql: `SELECT jsonb_build_object('Contact', c.code, 'Link Document Type', l.link_doctype, 'Link Name', l.link_name, 'Link Title', l.link_title) AS r
              FROM purchase_contact_links l JOIN purchase_contacts c ON c.id = l.contact_id ORDER BY c.code, l.idx`,
      },
      { name: "Customer", sql: legacy("purchase_customers", "parent") },
    ],
  },
  {
    file: "3 Buying - Templates and Terms.xlsx",
    sheets: [
      { name: "Purchase Tax Template", doctype: "Purchase Taxes and Charges Template", sql: legacy("purchase_tax_templates", "parent") },
      {
        name: "Purchase Tax Template Rows",
        sql: `SELECT jsonb_build_object('Template', t.code, 'No.', r.idx, 'Type', r.charge_type, 'Account Head', a.code, 'Description', r.description,
                'Rate', r.rate, 'Amount', r.tax_amount, 'Consider Tax or Charge for', r.category, 'Add or Deduct', r.add_deduct_tax,
                'Is this Tax included in Basic Rate?', CASE WHEN r.included_in_print_rate THEN 1 ELSE 0 END, 'GST Tax Type', r.gst_tax_type) AS r
              FROM purchase_tax_template_rows r JOIN purchase_tax_templates t ON t.id = r.template_id LEFT JOIN purchase_accounts a ON a.id = r.account_head_id
              ORDER BY t.code, r.idx`,
      },
      { name: "Item Tax Template", sql: legacy("purchase_item_tax_templates", "parent") },
      {
        name: "Item Tax Template Rates",
        sql: `SELECT jsonb_build_object('Item Tax Template', t.code, 'Tax Type', a.code, 'Tax Rate', r.tax_rate) AS r
              FROM purchase_item_tax_template_rates r JOIN purchase_item_tax_templates t ON t.id = r.template_id LEFT JOIN purchase_accounts a ON a.id = r.account_id
              ORDER BY t.code, r.idx`,
      },
      { name: "Payment Terms Template", doctype: "Payment Terms Template", sql: legacy("purchase_payment_terms_templates", "parent") },
      {
        name: "Payment Terms Template Rows",
        sql: `SELECT jsonb_build_object('Template', t.code, 'No.', r.idx, 'Payment Term', pt.code, 'Description', r.description, 'Invoice Portion', r.invoice_portion,
                'Mode of Payment', r.mode_of_payment, 'Due Date Based On', r.due_date_based_on, 'Credit Days', r.credit_days, 'Credit Months', r.credit_months,
                'Discount Type', r.discount_type, 'Discount', r.discount) AS r
              FROM purchase_payment_terms_template_rows r JOIN purchase_payment_terms_templates t ON t.id = r.template_id
              LEFT JOIN purchase_payment_terms pt ON pt.id = r.payment_term_id ORDER BY t.code, r.idx`,
      },
      { name: "Payment Term", doctype: "Payment Term", sql: legacy("purchase_payment_terms", "parent") },
      {
        name: "Terms and Conditions",
        sql: `SELECT jsonb_build_object('Title', code, 'Disabled', CASE WHEN disabled THEN 1 ELSE 0 END, 'Buying', CASE WHEN buying THEN 1 ELSE 0 END,
                'Selling', CASE WHEN selling THEN 1 ELSE 0 END, 'Terms and Conditions', terms, 'Created By', created_by, 'Created On', created_at) AS r
              FROM purchase_terms_templates ORDER BY code`,
      },
      { name: "Tax Category", sql: `SELECT jsonb_build_object('Tax Category', code, 'Title', title, 'Disabled', CASE WHEN disabled THEN 1 ELSE 0 END) AS r FROM purchase_tax_categories ORDER BY code` },
      { name: "Account", sql: legacy("purchase_accounts", "parent") },
      { name: "Cost Center", sql: legacy("purchase_cost_centers", "parent") },
      { name: "Company", sql: legacy("purchase_companies", "parent") },
    ],
  },
  {
    file: "4 Stock - Items and Pricing.xlsx",
    sheets: [
      { name: "Item", doctype: "Item", sql: legacy("purchase_items", "parent") },
      { name: "Item Group", sql: `SELECT jsonb_build_object('Item Group', code, 'Parent Item Group', parent_code, 'Is Group', CASE WHEN is_group THEN 1 ELSE 0 END) AS r FROM purchase_item_groups ORDER BY code` },
      {
        name: "Item UOM Conversion",
        sql: `SELECT jsonb_build_object('Item Code', i.code, 'UOM', u.uom, 'Conversion Factor', u.conversion_factor) AS r
              FROM purchase_item_uom_conversions u JOIN purchase_items i ON i.id = u.item_id ORDER BY i.code, u.idx`,
      },
      {
        name: "Item Defaults",
        sql: `SELECT jsonb_build_object('Item Code', i.code, 'Company', c.code, 'Default Warehouse', w.code, 'Default Expense Account', a.code,
                'Default Buying Cost Center', cc.code, 'Default Supplier', d.default_supplier, 'Default Price List', d.default_price_list) AS r
              FROM purchase_item_defaults d JOIN purchase_items i ON i.id = d.item_id LEFT JOIN purchase_companies c ON c.id = d.company_id
              LEFT JOIN purchase_warehouses w ON w.id = d.default_warehouse_id LEFT JOIN purchase_accounts a ON a.id = d.expense_account_id
              LEFT JOIN purchase_cost_centers cc ON cc.id = d.buying_cost_center_id ORDER BY i.code, d.idx`,
      },
      {
        name: "Item Tax",
        sql: `SELECT jsonb_build_object('Item Code', i.code, 'Item Tax Template', t.code, 'Tax Category', tc.code, 'Valid From', x.valid_from,
                'Minimum Net Rate', x.minimum_net_rate, 'Maximum Net Rate', x.maximum_net_rate) AS r
              FROM purchase_item_taxes x JOIN purchase_items i ON i.id = x.item_id LEFT JOIN purchase_item_tax_templates t ON t.id = x.item_tax_template_id
              LEFT JOIN purchase_tax_categories tc ON tc.id = x.tax_category_id ORDER BY i.code, x.idx`,
      },
      {
        name: "Item Variant Attribute",
        sql: `SELECT jsonb_build_object('Item Code', i.code, 'Attribute', v.attribute, 'Attribute Value', v.attribute_value, 'Variant Of', v.variant_of,
                'Numeric Values', CASE WHEN v.numeric_values THEN 1 ELSE 0 END, 'From Range', v.from_range, 'To Range', v.to_range, 'Increment', v.increment) AS r
              FROM purchase_item_variant_attributes v JOIN purchase_items i ON i.id = v.item_id ORDER BY i.code, v.idx`,
      },
      { name: "Item Attribute", sql: legacy("purchase_item_attributes", "parent") },
      { name: "Price List", doctype: "Price List", sql: legacy("purchase_price_lists", "parent") },
      { name: "Item Price", doctype: "Item Price", sql: legacy("purchase_item_prices", "parent") },
      { name: "UOM", sql: `SELECT jsonb_build_object('UOM Name', name, 'Must be Whole Number', CASE WHEN must_be_whole_number THEN 1 ELSE 0 END, 'Enabled', CASE WHEN enabled THEN 1 ELSE 0 END) AS r FROM purchase_uoms ORDER BY name` },
    ],
  },
  {
    file: "5 Stock - Stock Transactions.xlsx",
    sheets: [
      { name: "Material Request", doctype: "Material Request", sql: legacy("purchase_material_requests", "parent") },
      { name: "Material Request Item", doctype: "Material Request Item", sql: legacy("purchase_material_request_items", "child") },
      { name: "Stock Entry", doctype: "Stock Entry", sql: legacy("purchase_stock_entries", "parent") },
      { name: "Stock Entry Detail", doctype: "Stock Entry Detail", sql: legacy("purchase_stock_entry_details", "child") },
      { name: "Delivery Note", doctype: "Delivery Note", sql: legacy("purchase_delivery_notes", "parent") },
      { name: "Delivery Note Item", doctype: "Delivery Note Item", sql: legacy("purchase_delivery_note_items", "child") },
      { name: "Delivery Note Taxes", doctype: "Sales Taxes and Charges", sql: legacy("purchase_delivery_note_taxes", "child") },
      { name: "Delivery Note Sales Team", doctype: "Sales Team", sql: legacy("purchase_delivery_note_sales_team", "child") },
    ],
  },
  {
    file: "6 Stock - Purchase Receipt.xlsx",
    sheets: [
      { name: "Purchase Receipt", doctype: "Purchase Receipt", sql: legacy("purchase_receipts", "parent") },
      { name: "Purchase Receipt Item", doctype: "Purchase Receipt Item", sql: legacy("purchase_receipt_items", "child") },
      { name: "Purchase Taxes and Charges", doctype: "Purchase Taxes and Charges", sql: legacy("purchase_receipt_taxes", "child") },
      { name: "Services Items", doctype: "Services Items", sql: legacy("purchase_receipt_service_items", "child") },
    ],
  },
  {
    file: "7 Gate Entry.xlsx",
    sheets: [
      { name: "Gate Entry", doctype: "Gate Entry", sql: legacy("purchase_gate_entries", "parent") },
      { name: "Gate Entry Item", doctype: "Gate Entry Item", sql: legacy("purchase_gate_entry_items", "child") },
    ],
  },
  {
    file: "8 Stock - Stock Reports (ledger and bins).xlsx",
    sheets: [
      { name: "Stock Ledger Entry", doctype: "Stock Ledger Entry", sql: `SELECT legacy AS r FROM purchase_stock_ledger_entries ORDER BY legacy->>'posting_date' DESC, legacy->>'posting_time' DESC, legacy->>'creation' DESC` },
      { name: "Bin (stock per warehouse)", doctype: "Bin", sql: `SELECT legacy AS r FROM purchase_bins ORDER BY legacy->>'item_code', legacy->>'warehouse'` },
      { name: "Warehouse", doctype: "Warehouse", sql: legacy("purchase_warehouses", "parent") },
    ],
  },
  {
    file: "9 Stock - Other Records.xlsx",
    sheets: [
      { name: "Landed Cost Voucher", doctype: "Landed Cost Voucher", sql: legacy("purchase_landed_cost_vouchers", "parent") },
      { name: "LCV Purchase Receipts", doctype: "Landed Cost Purchase Receipt", sql: legacy("purchase_landed_cost_receipts", "child") },
      { name: "LCV Items", doctype: "Landed Cost Item", sql: legacy("purchase_landed_cost_items", "child") },
      { name: "LCV Taxes and Charges", doctype: "Landed Cost Taxes and Charges", sql: legacy("purchase_landed_cost_taxes", "child") },
      { name: "Quality Inspection", doctype: "Quality Inspection", sql: legacy("purchase_quality_inspections", "parent") },
      { name: "Quality Inspection Reading", doctype: "Quality Inspection Reading", sql: legacy("purchase_quality_inspection_readings", "child") },
      { name: "Serial No", doctype: "Serial No", sql: legacy("purchase_serial_nos", "parent") },
      { name: "Batch", doctype: "Batch", sql: legacy("purchase_batches", "parent") },
      { name: "Stock Reconciliation", doctype: "Stock Reconciliation", sql: legacy("purchase_stock_reconciliations", "parent") },
      { name: "Stock Reconciliation Item", doctype: "Stock Reconciliation Item", sql: legacy("purchase_stock_reconciliation_items", "child") },
      { name: "Packing Slip", doctype: "Packing Slip", sql: legacy("purchase_packing_slips", "parent") },
      { name: "Packing Slip Item", doctype: "Packing Slip Item", sql: legacy("purchase_packing_slip_items", "child") },
      { name: "Packing Slip Sample Item", doctype: "Sample Item", sql: legacy("purchase_packing_slip_sample_items", "child") },
      { name: "Stock Entry Type", doctype: "Stock Entry Type", sql: legacy("purchase_stock_entry_types", "parent") },
    ],
  },
  {
    file: "10 History - timelines of every document.xlsx",
    sheets: [
      {
        name: "Purchase Order history",
        sql: `SELECT jsonb_build_object('Purchase Order', order_number, 'Kind', kind::text, 'When', to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
                'By', by_email, 'Subject', subject, 'Content', content, 'Details', data::text, 'Source', source) AS r
              FROM purchase_order_events ORDER BY order_number, at`,
      },
      {
        name: "Stock documents history",
        sql: `SELECT jsonb_build_object('DocType', doctype, 'Document', doc_name, 'Kind', kind::text, 'When', to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
                'By', by_email, 'Subject', subject, 'Content', content, 'Details', data::text, 'Source', source) AS r
              FROM purchase_doc_events ORDER BY doctype, doc_name, at`,
      },
      { name: "Old site users", sql: legacy("purchase_users", "parent") },
    ],
  },
];

// --- writing ---------------------------------------------------------------------------------------

const NUMERIC = new Set(["Float", "Currency", "Percent", "Int", "Check", "Rating"]);
const STANDARD_FIRST = ["name"];
const STANDARD_LAST = ["docstatus", "parent", "parentfield", "parenttype", "idx", "owner", "creation", "modified_by", "modified"];
const STANDARD_LABEL: Record<string, string> = {
  name: "ID", docstatus: "DocStatus (0 Draft · 1 Submitted · 2 Cancelled)", parent: "Parent", parentfield: "Parent Field",
  parenttype: "Parent Type", idx: "No.", owner: "Created By", creation: "Created On", modified_by: "Last Updated By", modified: "Last Updated On",
};
const MAX_CELL = 32_000; // Excel's cell limit is 32,767 characters.

interface Column {
  key: string;
  header: string;
  type: string | null;
}

/** The sheet's columns: the layout's fields in the old form's order, then anything else the rows hold. */
function columnsOf(rows: Record<string, unknown>[], layout: DoctypeLayout | undefined): Column[] {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const out: Column[] = [];
  const used = new Set<string>();
  const labels = new Map<string, number>();
  const push = (key: string, label: string | undefined, type: string | null) => {
    if (used.has(key)) return;
    used.add(key);
    const base = label || key;
    const n = (labels.get(base) ?? 0) + 1;
    labels.set(base, n);
    out.push({ key, header: n > 1 ? `${base} (${key})` : base, type });
  };
  for (const k of STANDARD_FIRST) if (keys.has(k)) push(k, STANDARD_LABEL[k], null);
  const fields = new Map<string, LayoutField>((layout?.fields ?? []).map((f) => [f.fieldname, f]));
  for (const f of layout?.fields ?? []) {
    if (!keys.has(f.fieldname)) continue;
    if (["Tab Break", "Section Break", "Column Break", "Table", "Table MultiSelect", "HTML", "Button"].includes(f.fieldtype)) continue;
    push(f.fieldname, f.label, f.fieldtype);
  }
  for (const k of keys) if (!used.has(k) && !STANDARD_LAST.includes(k)) push(k, fields.get(k)?.label, fields.get(k)?.fieldtype ?? null);
  for (const k of STANDARD_LAST) if (keys.has(k)) push(k, STANDARD_LABEL[k], k === "docstatus" || k === "idx" ? "Int" : null);
  return out;
}

function cellOf(c: Column, v: unknown): unknown {
  if (v === null || v === undefined || v === "") return null;
  if (c.type && NUMERIC.has(c.type)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
  }
  if (c.type === "Date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00Z`);
  if (typeof v === "object") v = JSON.stringify(v);
  const s = String(v);
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL)} …[cut: ${s.length} characters in all; the full text is in the backup]` : s;
}

async function writeBook(dir: string, book: Book): Promise<{ file: string; sheets: { name: string; rows: number }[] }> {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: join(dir, book.file), useStyles: true, useSharedStrings: false });
  wb.creator = "Procurement ERP";
  const counts: { name: string; rows: number }[] = [];
  for (const s of book.sheets) {
    const rows = (await db.$queryRawUnsafe<{ r: Record<string, unknown> | null }[]>(s.sql)).map((x) => x.r ?? {});
    const cols = columnsOf(rows, s.doctype ? LAYOUTS[s.doctype] : undefined);
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.min(40, Math.max(10, c.header.length + 2)),
      style: c.type === "Date" ? { numFmt: "dd-mm-yyyy" } : c.type === "Currency" ? { numFmt: "#,##0.00#" } : undefined,
    }));
    ws.getRow(1).font = { bold: true };
    if (cols.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    ws.getRow(1).commit();
    for (const r of rows) ws.addRow(cols.map((c) => cellOf(c, r[c.key]))).commit();
    await ws.commit();
    counts.push({ name: s.name, rows: rows.length });
    process.stdout.write(`  ${book.file} › ${s.name}: ${rows.length}\n`);
  }
  await wb.commit();
  return { file: book.file, sheets: counts };
}

/** The old site's own report answers captured live (data/erpnext-live), one sheet per report. */
async function writeLiveReports(dir: string, source: string): Promise<{ file: string; sheets: { name: string; rows: number }[] } | null> {
  if (!existsSync(source)) return null;
  const data = JSON.parse(readFileSync(source, "utf8")) as {
    capturedAt: string;
    reports: Record<string, { report_name: string; filters: Record<string, unknown>; columns: { label: string; fieldname: string; fieldtype?: string }[]; result: unknown[] }>;
  };
  const file = `8b Stock - Stock Reports (the old site's own answers, ${data.capturedAt.slice(0, 10)}).xlsx`;
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: join(dir, file), useStyles: true, useSharedStrings: false });
  const counts: { name: string; rows: number }[] = [];
  for (const [key, rep] of Object.entries(data.reports)) {
    const filters = Object.entries(rep.filters ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
    const name = `${rep.report_name}${key.endsWith("fy2526") ? " FY25-26" : ""}`.slice(0, 31);
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }] });
    const cols: Column[] = rep.columns.map((c) => ({ key: c.fieldname, header: c.label || c.fieldname, type: c.fieldtype ?? null }));
    ws.columns = cols.map((c) => ({ key: c.key, width: Math.min(40, Math.max(10, c.header.length + 2)), style: c.type === "Date" ? { numFmt: "dd-mm-yyyy" } : undefined }));
    ws.addRow([`${rep.report_name} — filters: ${filters} — captured ${data.capturedAt}`]).commit();
    const head = ws.addRow(cols.map((c) => c.header));
    head.font = { bold: true };
    head.commit();
    for (const r of rep.result) {
      const row = Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c.key, (r as unknown[])[i]])) : (r as Record<string, unknown>);
      ws.addRow(cols.map((c) => cellOf(c, row[c.key]))).commit();
    }
    await ws.commit();
    counts.push({ name, rows: rep.result.length });
    process.stdout.write(`  ${file} › ${name}: ${rep.result.length}\n`);
  }
  await wb.commit();
  return { file, sheets: counts };
}

async function main() {
  const out = arg("out");
  if (!out) throw new Error('Give the folder to write into: npm run export:data -- --out "<folder>"');
  mkdirSync(out, { recursive: true });
  const [run] = await db.$queryRawUnsafe<{ source_file: string; finished_at: Date }[]>(
    `SELECT source_file, finished_at FROM purchase_import_runs WHERE status = 'ok' ORDER BY finished_at DESC LIMIT 1`,
  );
  console.log(`From the local database, loaded from ${run?.source_file ?? "(no import run recorded)"}`);
  const done = [];
  for (const b of BOOKS) done.push(await writeBook(out, b));
  const liveDir = join(process.cwd(), "data", "erpnext-live");
  const live = existsSync(liveDir) ? readdirSync(liveDir).filter((f) => f.startsWith("live-stock-reports-")).sort().pop() : undefined;
  if (live) {
    const r = await writeLiveReports(out, join(liveDir, live));
    if (r) done.push(r);
  }
  console.log(JSON.stringify({ source: run?.source_file ?? null, books: done }, null, 1));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
