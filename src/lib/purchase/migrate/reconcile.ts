// The reconciliation report: does the database now hold exactly what the
// backup held? Every figure is compared against the backup itself, money with
// exact decimal arithmetic (no floating point), and every difference is named.
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Built } from "./build";
import type { DumpTable, Row } from "./dump";
import type { RestoredFile } from "./files";

// Exact decimals ----------------------------------------------------------
const SCALE = 1_000_000_000n;

/** A decimal string as an integer count of 1e-9 (ERPNext's numeric(21,9) grain). */
export function toNano(v: string | null | undefined): bigint {
  if (v === null || v === undefined || v.trim() === "") return 0n;
  const t = v.trim();
  if (/e/i.test(t)) return BigInt(Math.round(Number(t) * 1e9));
  const neg = t.startsWith("-");
  const [i, f = ""] = (neg ? t.slice(1) : t).split(".");
  const n = BigInt(i || "0") * SCALE + BigInt((f + "000000000").slice(0, 9) || "0");
  return neg ? -n : n;
}

/** Back to a decimal string with 2–9 decimals, for reading. */
export function fromNano(n: bigint): string {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const frac = (a % SCALE).toString().padStart(9, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / SCALE}.${frac.padEnd(2, "0")}`;
}

export const sumNano = (values: Iterable<string | null | undefined>) => {
  let s = 0n;
  for (const v of values) s += toNano(v);
  return s;
};

// The report ---------------------------------------------------------------
export interface Check {
  section: string;
  name: string;
  expected: string;
  actual: string;
  ok: boolean;
}

export interface Reconciliation {
  ok: boolean;
  checks: Check[];
  issues: string[];
  markdown: string;
}

/** Phase II: each stock table — [label, Built key, source table, Prisma delegate, parenttype filter]. */
const STOCK_ROWS: readonly [string, string, string, string, string?][] = [
  ["Stock entry types", "stockEntryTypes", "tabStock Entry Type", "purchaseStockEntryType"],
  ["Gate entries", "gateEntries", "tabGate Entry", "purchaseGateEntry"],
  ["Gate entry rows", "gateEntryItems", "tabGate Entry Item", "purchaseGateEntryItem"],
  ["Purchase receipts", "receipts", "tabPurchase Receipt", "purchaseReceipt"],
  ["Receipt lines", "receiptItems", "tabPurchase Receipt Item", "purchaseReceiptItem"],
  ["Receipt tax rows", "receiptTaxes", "tabPurchase Taxes and Charges", "purchaseReceiptTax", "Purchase Receipt"],
  ["Receipt services rows", "receiptServiceItems", "tabServices Items", "purchaseReceiptServiceItem", "Purchase Receipt"],
  ["Landed cost vouchers", "landedCostVouchers", "tabLanded Cost Voucher", "purchaseLandedCostVoucher"],
  ["Landed cost receipts", "landedCostReceipts", "tabLanded Cost Purchase Receipt", "purchaseLandedCostReceipt"],
  ["Landed cost items", "landedCostItems", "tabLanded Cost Item", "purchaseLandedCostItem"],
  ["Landed cost charges", "landedCostTaxes", "tabLanded Cost Taxes and Charges", "purchaseLandedCostTax"],
  ["Material requests", "materialRequests", "tabMaterial Request", "purchaseMaterialRequest"],
  ["Material request rows", "materialRequestItems", "tabMaterial Request Item", "purchaseMaterialRequestItem"],
  ["Stock entries", "stockEntries", "tabStock Entry", "purchaseStockEntry"],
  ["Stock entry rows", "stockEntryDetails", "tabStock Entry Detail", "purchaseStockEntryDetail"],
  ["Stock reconciliations", "stockReconciliations", "tabStock Reconciliation", "purchaseStockReconciliation"],
  ["Stock reconciliation rows", "stockReconciliationItems", "tabStock Reconciliation Item", "purchaseStockReconciliationItem"],
  ["Delivery notes", "deliveryNotes", "tabDelivery Note", "purchaseDeliveryNote"],
  ["Delivery note rows", "deliveryNoteItems", "tabDelivery Note Item", "purchaseDeliveryNoteItem"],
  ["Delivery note tax rows", "deliveryNoteTaxes", "tabSales Taxes and Charges", "purchaseDeliveryNoteTax", "Delivery Note"],
  ["Delivery note sales team rows", "deliveryNoteSalesTeam", "tabSales Team", "purchaseDeliveryNoteSalesTeam", "Delivery Note"],
  ["Packing slips", "packingSlips", "tabPacking Slip", "purchasePackingSlip"],
  ["Packing slip rows", "packingSlipItems", "tabPacking Slip Item", "purchasePackingSlipItem"],
  ["Packing slip sample rows", "packingSlipSampleItems", "tabSample Item", "purchasePackingSlipSampleItem", "Packing Slip"],
  ["Stock ledger entries", "stockLedgerEntries", "tabStock Ledger Entry", "purchaseStockLedgerEntry"],
  ["Bins", "bins", "tabBin", "purchaseBin"],
  ["Item prices", "itemPrices", "tabItem Price", "purchaseItemPrice"],
  ["Serial nos", "serialNos", "tabSerial No", "purchaseSerialNo"],
  ["Batches", "batches", "tabBatch", "purchaseBatch"],
  ["Quality inspections", "qualityInspections", "tabQuality Inspection", "purchaseQualityInspection"],
  ["Quality inspection readings", "qualityInspectionReadings", "tabQuality Inspection Reading", "purchaseQualityInspectionReading"],
];

const SPOT_CHECK_POS = [
  "PUR-ORD/25-26/02510", // Out-State IGST, the verified spot-check PO
  "PUR-ORD/25-26/02486", // Cost Overheads folded into the totals
  "PUR-ORD/25-26/02512", // In-State CGST/SGST
  "PUR-ORD/25-26/02263", // import, USD
  "PUR-ORD/25-26/01426", // 40 lines
  "PUR-ORD/25-26/02015-1", // amended
  "PUR-ORD/24-25/00001", // the first PO
];

export async function reconcile(
  db: PrismaClient,
  built: Built,
  tables: Map<string, DumpTable>,
  loaded: Record<string, number>,
  files: RestoredFile[],
): Promise<Reconciliation> {
  const checks: Check[] = [];
  const add = (section: string, name: string, expected: unknown, actual: unknown) =>
    checks.push({ section, name, expected: String(expected), actual: String(actual), ok: String(expected) === String(actual) });
  const src = (t: string) => tables.get(t)?.rows ?? [];
  const srcPo = (t: string) => src(t).filter((r) => r.parenttype === "Purchase Order");
  const PO = "Purchase Order";
  /** Timeline rows of the backup (Version, Comment, Communication) whose document matches. */
  const events = (doc: (doctype: string | null) => boolean) =>
    src("tabVersion").filter((r) => doc(r.ref_doctype)).length +
    src("tabComment").filter((r) => doc(r.reference_doctype)).length +
    src("tabCommunication").filter((r) => doc(r.reference_doctype)).length;

  // 1. Rows: what the backup had, what was inserted, what is stored ----------
  // `fromBackup` counts only records that came from the backup (they carry
  // `legacy`); placeholders the import had to add are counted apart.
  const fromBackup = { NOT: { legacy: { equals: Prisma.DbNull } } };
  const rows: [string, keyof typeof loaded, number, () => Promise<number>, () => Promise<number>][] = [
    ["Purchase orders", "orders", src("tabPurchase Order").length, () => db.purchaseOrder.count(), () => db.purchaseOrder.count()],
    ["PO lines", "orderItems", src("tabPurchase Order Item").length, () => db.purchaseOrderItem.count(), () => db.purchaseOrderItem.count()],
    ["PO tax rows", "orderTaxes", srcPo("tabPurchase Taxes and Charges").length, () => db.purchaseOrderTax.count(), () => db.purchaseOrderTax.count()],
    ["PO cost overheads", "orderCostOverheads", srcPo("tabServices Items").length, () => db.purchaseOrderCostOverhead.count(), () => db.purchaseOrderCostOverhead.count()],
    ["PO payment schedule rows", "orderPaymentSchedules", src("tabPayment Schedule").length, () => db.purchaseOrderPaymentSchedule.count(), () => db.purchaseOrderPaymentSchedule.count()],
    ["Suppliers", "suppliers", src("tabSupplier").length, () => db.purchaseSupplier.count({ where: fromBackup }), () => db.purchaseSupplier.count()],
    ["Items", "items", src("tabItem").length, () => db.purchaseItem.count({ where: fromBackup }), () => db.purchaseItem.count()],
    ["Addresses", "addresses", src("tabAddress").length, () => db.purchaseAddress.count(), () => db.purchaseAddress.count()],
    ["Contacts", "contacts", src("tabContact").length, () => db.purchaseContact.count(), () => db.purchaseContact.count()],
    ["Customers", "customers", src("tabCustomer").length, () => db.purchaseCustomer.count(), () => db.purchaseCustomer.count()],
    ["Item UOM conversions", "itemUomConversions", src("tabUOM Conversion Detail").length, () => db.purchaseItemUomConversion.count(), () => db.purchaseItemUomConversion.count()],
    ["Item tax rows", "itemTaxes", src("tabItem Tax").length, () => db.purchaseItemTax.count(), () => db.purchaseItemTax.count()],
    ["Item variant attributes", "itemVariantAttributes", src("tabItem Variant Attribute").length, () => db.purchaseItemVariantAttribute.count(), () => db.purchaseItemVariantAttribute.count()],
    ["GST HSN codes", "hsnCodes", src("tabGST HSN Code").length, () => db.purchaseHsnCode.count(), () => db.purchaseHsnCode.count()],
    ["PO timeline entries", "orderEvents", events((d) => d === PO), () => db.purchaseOrderEvent.count(), () => db.purchaseOrderEvent.count()],
    ["Stock document timeline entries", "docEvents", events((d) => d !== PO), () => db.purchaseDocEvent.count(), () => db.purchaseDocEvent.count()],
    ["PO attachments", "attachments", src("tabFile").filter((r) => r.is_folder !== "1").length, () => db.purchaseAttachment.count(), () => db.purchaseAttachment.count()],
    ["Users", "users", src("tabUser").length, () => db.purchaseUser.count(), () => db.purchaseUser.count()],
    // Phase II: the Stock module's documents (stock-build.ts). Every one is from the backup.
    ...STOCK_ROWS.map(([label, key, table, delegate, parentType]) => {
      const inBackup = src(table).filter((r) => !parentType || r.parenttype === parentType).length;
      const count = () => (db as unknown as Record<string, { count(): Promise<number> }>)[delegate].count();
      return [label, key, inBackup, count, count] as [string, keyof typeof loaded, number, () => Promise<number>, () => Promise<number>];
    }),
  ];
  for (const [label, key, inBackup, storedFromBackup, storedAll] of rows) {
    add("Rows", `${label}: in the backup → stored from it`, inBackup, await storedFromBackup());
    add("Rows", `${label}: inserted → stored`, loaded[key] ?? 0, await storedAll());
  }

  // 2. Money: every PO total, summed exactly ---------------------------------
  const moneyCols = ["grand_total", "base_grand_total", "net_total", "base_net_total", "total_taxes_and_charges", "rounded_total", "total_qty"] as const;
  for (const col of moneyCols) {
    const expected = fromNano(sumNano(src("tabPurchase Order").map((r) => r[col])));
    const [row] = await db.$queryRawUnsafe<{ s: string | null }[]>(`SELECT COALESCE(SUM(${col}), 0)::text AS s FROM purchase_orders`);
    add("Money", `Σ ${col} over all POs`, expected, fromNano(toNano(row?.s)));
  }
  const byCurrency = new Map<string, bigint>();
  for (const r of src("tabPurchase Order")) byCurrency.set(r.currency ?? "?", (byCurrency.get(r.currency ?? "?") ?? 0n) + toNano(r.grand_total));
  const dbByCurrency = await db.$queryRawUnsafe<{ currency: string; s: string }[]>(
    `SELECT currency, SUM(grand_total)::text AS s FROM purchase_orders GROUP BY currency`,
  );
  for (const [cur, s] of [...byCurrency.entries()].sort()) {
    add("Money", `Σ grand_total in ${cur}`, fromNano(s), fromNano(toNano(dbByCurrency.find((r) => r.currency === cur)?.s)));
  }
  const lineAmount = fromNano(sumNano(src("tabPurchase Order Item").map((r) => r.amount)));
  const [la] = await db.$queryRawUnsafe<{ s: string }[]>(`SELECT COALESCE(SUM(amount), 0)::text AS s FROM purchase_order_items`);
  add("Money", "Σ line amount over all POs", lineAmount, fromNano(toNano(la?.s)));

  // Phase II: the stock books, summed exactly. The ledger without its cancelled entries (as the
  // reports read it), the bins as they stood, the receipts' totals and quantities.
  const live = src("tabStock Ledger Entry").filter((r) => r.is_cancelled !== "1");
  for (const [label, values, sql] of [
    ["Σ actual_qty over the stock ledger", live.map((r) => r.actual_qty), "SELECT COALESCE(SUM(actual_qty), 0)::text AS s FROM purchase_stock_ledger_entries WHERE NOT is_cancelled"],
    ["Σ stock_value_difference over the stock ledger", live.map((r) => r.stock_value_difference), "SELECT COALESCE(SUM(stock_value_difference), 0)::text AS s FROM purchase_stock_ledger_entries WHERE NOT is_cancelled"],
    ["Σ actual_qty over the bins", src("tabBin").map((r) => r.actual_qty), "SELECT COALESCE(SUM(actual_qty), 0)::text AS s FROM purchase_bins"],
    ["Σ stock_value over the bins", src("tabBin").map((r) => r.stock_value), "SELECT COALESCE(SUM(stock_value), 0)::text AS s FROM purchase_bins"],
    ["Σ grand_total over the purchase receipts", src("tabPurchase Receipt").map((r) => r.grand_total), "SELECT COALESCE(SUM(grand_total), 0)::text AS s FROM purchase_receipts"],
    ["Σ received_qty over the receipt lines", src("tabPurchase Receipt Item").map((r) => r.received_qty), "SELECT COALESCE(SUM(received_qty), 0)::text AS s FROM purchase_receipt_items"],
    ["Σ applicable_charges over the landed cost items", src("tabLanded Cost Item").map((r) => r.applicable_charges), "SELECT COALESCE(SUM(applicable_charges), 0)::text AS s FROM purchase_landed_cost_items"],
  ] as const) {
    const [row] = await db.$queryRawUnsafe<{ s: string | null }[]>(sql);
    add("Stock", label, fromNano(sumNano(values)), fromNano(toNano(row?.s)));
  }

  // 3. Every PO has exactly its own lines and tax rows --------------------------
  const perParent = (rows: Row[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.parent ?? "", (m.get(r.parent ?? "") ?? 0) + 1);
    return m;
  };
  for (const [label, rows, sql] of [
    ["lines", src("tabPurchase Order Item"), "SELECT o.number, COUNT(i.id)::int AS n FROM purchase_orders o LEFT JOIN purchase_order_items i ON i.order_id = o.id GROUP BY o.number"],
    ["tax rows", srcPo("tabPurchase Taxes and Charges"), "SELECT o.number, COUNT(t.id)::int AS n FROM purchase_orders o LEFT JOIN purchase_order_taxes t ON t.order_id = o.id GROUP BY o.number"],
  ] as const) {
    const expected = perParent(rows);
    const got = new Map((await db.$queryRawUnsafe<{ number: string; n: number }[]>(sql)).map((r) => [r.number, r.n]));
    const wrong = [...new Set([...expected.keys(), ...got.keys()])].filter((po) => po && (expected.get(po) ?? 0) !== (got.get(po) ?? 0));
    add("Per PO", `POs whose ${label} differ from the backup`, 0, wrong.length === 0 ? 0 : `${wrong.length} (${wrong.slice(0, 5).join(", ")})`);
  }
  const [sums] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM purchase_orders o
       JOIN (SELECT order_id, SUM(amount) AS s FROM purchase_order_items GROUP BY order_id) l ON l.order_id = o.id
      WHERE l.s <> o.total`,
  );
  const srcMismatch = (() => {
    const s = new Map<string, bigint>();
    for (const r of src("tabPurchase Order Item")) s.set(r.parent!, (s.get(r.parent!) ?? 0n) + toNano(r.amount));
    return src("tabPurchase Order").filter((p) => s.has(p.name!) && s.get(p.name!) !== toNano(p.total)).length;
  })();
  add("Per PO", "POs where Σ line amount ≠ PO total (same as in the backup)", srcMismatch, sums?.n ?? 0);

  // 4. Relationships ------------------------------------------------------------
  const [orphanSupplier] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM purchase_orders o JOIN purchase_suppliers s ON s.id = o.supplier_id WHERE s.legacy IS NULL`,
  );
  add("Relations", "POs whose supplier is not in the backup (placeholder)", 0, orphanSupplier?.n ?? 0);
  const [orphanItem] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM purchase_order_items i JOIN purchase_items it ON it.id = i.item_id WHERE it.legacy IS NULL`,
  );
  add("Relations", "PO lines whose item is not in the backup (placeholder)", 0, orphanItem?.n ?? 0);
  const [suppliersWithPos] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(DISTINCT supplier_id)::int AS n FROM purchase_orders`);
  add("Relations", "Suppliers with POs (backup vs stored)", new Set(src("tabPurchase Order").map((r) => r.supplier)).size, suppliersWithPos?.n ?? 0);
  const [itemsOnPos] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(DISTINCT item_id)::int AS n FROM purchase_order_items`);
  add("Relations", "Items on PO lines (backup vs stored)", new Set(src("tabPurchase Order Item").map((r) => r.item_code)).size, itemsOnPos?.n ?? 0);
  const [amended] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM purchase_orders WHERE amended_from_id IS NOT NULL`);
  add("Relations", "Amended POs linked to their original", src("tabPurchase Order").filter((r) => r.amended_from).length, amended?.n ?? 0);

  // 5. Spot checks: named POs, field by field -----------------------------------
  for (const number of SPOT_CHECK_POS) {
    const s = src("tabPurchase Order").find((r) => r.name === number);
    if (!s) continue;
    const d = await db.purchaseOrder.findUnique({
      where: { number },
      include: { supplier: true, _count: { select: { items: true, taxes: true, costOverheads: true } }, amendedFrom: true },
    });
    const sLines = src("tabPurchase Order Item").filter((r) => r.parent === number).length;
    const sTaxes = srcPo("tabPurchase Taxes and Charges").filter((r) => r.parent === number).length;
    const fmt = (v: { toString(): string } | null | undefined) => fromNano(toNano(v?.toString()));
    const actual = d
      ? `${d.supplier.code} | ${d.transactionDate.toISOString().slice(0, 10)} | ${d.currency} ${fmt(d.grandTotal)} | ${fmt(d.roundedTotal)} | ${d._count.items} lines | ${d._count.taxes} taxes | amended from ${d.amendedFrom?.number ?? "-"}`
      : "(missing)";
    const expected = `${s.supplier} | ${s.transaction_date} | ${s.currency} ${fromNano(toNano(s.grand_total))} | ${fromNano(toNano(s.rounded_total))} | ${sLines} lines | ${sTaxes} taxes | amended from ${s.amended_from || "-"}`;
    add("Spot checks", number, expected, actual);
  }

  // 6. Files ------------------------------------------------------------------
  add("Files", "Attachments and logo restored from the archives", files.length, files.filter((f) => f.storagePath).length);

  const ok = checks.every((c) => c.ok);
  return { ok, checks, issues: built.issues, markdown: toMarkdown(ok, checks, built.issues, files) };
}

function toMarkdown(ok: boolean, checks: Check[], issues: string[], files: RestoredFile[]): string {
  const lines: string[] = [];
  lines.push(`# ERPNext import — reconciliation report`, "");
  lines.push(`**Verdict:** ${ok ? "✅ every check matches the backup" : "⚠ differences found — see the ✗ rows"}`, "");
  let section = "";
  for (const c of checks) {
    if (c.section !== section) {
      section = c.section;
      lines.push(`## ${section}`, "", "| | Check | Backup | Stored |", "|---|---|---|---|");
    }
    lines.push(`| ${c.ok ? "✓" : "✗"} | ${c.name} | ${c.expected.replace(/\|/g, "/")} | ${c.actual.replace(/\|/g, "/")} |`);
    const next = checks[checks.indexOf(c) + 1];
    if (!next || next.section !== section) lines.push("");
  }
  lines.push(`## Restored files`, "");
  for (const f of files) lines.push(`- ${f.storagePath ? "✓" : "✗ not found in the archives:"} ${f.fileUrl}${f.storagePath ? ` → ${f.storagePath} (${f.bytes} bytes)` : ""}`);
  lines.push("", `## Issues met during the import (${issues.length})`, "");
  if (issues.length === 0) lines.push("None.");
  const grouped = new Map<string, string[]>();
  for (const i of issues) {
    const key = i.replace(/^[^:]+: /, "").replace(/"[^"]*"/g, '"…"');
    grouped.set(key, [...(grouped.get(key) ?? []), i]);
  }
  for (const [key, list] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`- **${list.length}×** ${key}`);
    for (const i of list.slice(0, 5)) lines.push(`  - ${i}`);
    if (list.length > 5) lines.push(`  - … and ${list.length - 5} more`);
  }
  return lines.join("\n") + "\n";
}
