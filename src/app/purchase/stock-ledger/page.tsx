import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReportFilters, type ReportFilterField } from "@/components/purchase/stock/ReportFilters";
import { ReportTable, type ReportColumn } from "@/components/purchase/stock/ReportTable";
import { siteToday } from "@/lib/purchase/format";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { defaultStockCompany, loadItemDetails, loadLedger, loadOpeningVouchers, loadPreviousEntry, voucherKey, voucherPages } from "@/lib/purchase/stock/ledger-data";
import { masterPath } from "@/lib/purchase/routes";
import { parseStockFilters } from "@/lib/purchase/stock/report-filters";
import { stockLedger } from "@/lib/purchase/stock/reports";

// Stock › Stock Reports › Stock Ledger (Phase II, owner 21-11-2026): every stock movement between
// the dates, as the old report listed them — equal entry for entry to the old site's own answer of
// 21-11-2026 (npm run golden:stock). With one item and one warehouse it opens with the "'Opening'"
// row (the balance before the From Date), as the old one did.

export const metadata: Metadata = { title: "Stock Ledger" };
export const dynamic = "force-dynamic";

const FIELDS: readonly ReportFilterField[] = [
  { name: "company", label: "Company", kind: "link", lookup: "company", required: true },
  { name: "from_date", label: "From Date", kind: "date", required: true },
  { name: "to_date", label: "To Date", kind: "date", required: true },
  { name: "warehouse", label: "Warehouse", kind: "link", lookup: "warehouse" },
  { name: "item_code", label: "Item", kind: "link", lookup: "item" },
  { name: "item_group", label: "Item Group", kind: "link", lookup: "itemGroup" },
  { name: "batch_no", label: "Batch No", kind: "data" },
  { name: "voucher_no", label: "Voucher #", kind: "data" },
];

const COLUMNS: readonly ReportColumn[] = [
  { key: "date", label: "Date", kind: "datetime", width: 150 },
  { key: "itemCode", label: "Item", kind: "text", width: 100, link: "item" },
  { key: "itemName", label: "Item Name", kind: "text", width: 100 },
  { key: "stockUom", label: "Stock UOM", kind: "text", width: 90 },
  { key: "inQty", label: "In Qty", kind: "float", width: 80, tone: "in" },
  { key: "outQty", label: "Out Qty", kind: "float", width: 80, tone: "out" },
  { key: "qtyAfterTransaction", label: "Balance Qty", kind: "float", width: 100 },
  { key: "warehouse", label: "Warehouse", kind: "text", width: 150 },
  { key: "itemGroup", label: "Item Group", kind: "text", width: 100 },
  { key: "brand", label: "Brand", kind: "text", width: 100 },
  { key: "description", label: "Description", kind: "text", width: 200 },
  { key: "incomingRate", label: "Incoming Rate", kind: "currency", width: 110 },
  { key: "valuationRate", label: "Avg Rate (Balance Stock)", kind: "currency", width: 180 },
  { key: "inOutRate", label: "Valuation Rate", kind: "currency", width: 140 },
  { key: "stockValue", label: "Balance Value", kind: "currency", width: 110 },
  { key: "stockValueDifference", label: "Value Change", kind: "currency", width: 110 },
  { key: "voucherType", label: "Voucher Type", kind: "text", width: 110 },
  { key: "voucherNo", label: "Voucher #", kind: "text", width: 100, link: "voucher" },
  { key: "batchNo", label: "Batch", kind: "text", width: 100 },
  { key: "serialNo", label: "Serial No", kind: "text", width: 100 },
  { key: "company", label: "Company", kind: "text", width: 110 },
];

/** The description as text (ERPNext stored the Item's HTML). */
const plain = (html: string | null) => (html ? html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : null);

export default async function StockLedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const f = parseStockFilters(await searchParams, siteToday(), await defaultStockCompany(db));
  let entries = await loadLedger(db, {
    company: f.company, fromDate: f.fromDate, toDate: f.toDate, itemCode: f.itemCode, itemGroup: f.itemGroup,
    warehouse: f.warehouse, batchNo: f.batchNo, voucherNo: f.voucherNo,
  });
  const items = await loadItemDetails(db, entries.map((e) => e.itemCode));
  for (const d of items.values()) d.description = plain(d.description);
  // The "'Opening'" row: one item in one warehouse (get_opening_balance). An Opening Stock
  // reconciliation on the From Date becomes the opening row instead of a movement.
  let opening: { qtyAfterTransaction: number; valuationRate: number; stockValue: number } | null = null;
  if (f.itemCode && f.warehouse) {
    opening = (await loadPreviousEntry(db, f.itemCode, f.warehouse, f.fromDate)) ?? { qtyAfterTransaction: 0, valuationRate: 0, stockValue: 0 };
    const openingStock = (await loadOpeningVouchers(db, f.toDate)).stockReconciliations;
    for (const e of [...entries]) {
      if (e.voucherType === "Stock Reconciliation" && e.postingDate === f.fromDate && openingStock.has(e.voucherNo)) {
        opening = { qtyAfterTransaction: e.qtyAfterTransaction, valuationRate: e.valuationRate, stockValue: e.stockValue };
        entries = entries.filter((x) => x !== e);
      }
    }
  }
  // Each row's item and voucher open their pages here (by record ID), as the old report's links did.
  const pages = await voucherPages(db, entries);
  const rows = stockLedger(entries, items, { batchFilter: !!f.batchNo, opening }).map((r) => {
    if ("opening" in r) return { ...r, itemCode: "'Opening'" };
    const id = items.get(r.itemCode)?.id;
    return { ...r, itemHref: id ? masterPath("items", id) : null, voucherHref: pages.get(voucherKey(r.voucherType, r.voucherNo)) ?? null };
  });
  return (
    <>
      <PageHeader crumbs={["Stock", "Stock Reports"]} title="Stock Ledger" />
      <section className="po-card">
        <ReportFilters
          fields={FIELDS}
          values={{
            company: f.company, from_date: f.fromDate, to_date: f.toDate, warehouse: f.warehouse, item_code: f.itemCode,
            item_group: f.itemGroup, batch_no: f.batchNo, voucher_no: f.voucherNo,
          }}
        />
        <ReportTable columns={COLUMNS} rows={rows as unknown as Record<string, unknown>[]} />
      </section>
    </>
  );
}
