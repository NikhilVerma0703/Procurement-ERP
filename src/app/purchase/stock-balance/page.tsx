import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReportFilters, type ReportFilterField } from "@/components/purchase/stock/ReportFilters";
import { ReportTable, type ReportColumn } from "@/components/purchase/stock/ReportTable";
import { siteToday } from "@/lib/purchase/format";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { defaultStockCompany, loadItemDetails, loadLedger, loadOpeningVouchers } from "@/lib/purchase/stock/ledger-data";
import { parseStockFilters } from "@/lib/purchase/stock/report-filters";
import { stockBalance } from "@/lib/purchase/stock/reports";
import { masterPath } from "@/lib/purchase/routes";

// Stock › Stock Reports › Stock Balance (Phase II, owner 21-11-2026): the old report, computed from
// the imported ledger by lib/purchase/stock/reports.ts — equal row for row to the old site's own
// answers of 21-11-2026 (npm run golden:stock).

export const metadata: Metadata = { title: "Stock Balance" };
export const dynamic = "force-dynamic";

const FIELDS: readonly ReportFilterField[] = [
  { name: "company", label: "Company", kind: "link", lookup: "company" },
  { name: "from_date", label: "From Date", kind: "date", required: true },
  { name: "to_date", label: "To Date", kind: "date", required: true },
  { name: "item_group", label: "Item Group", kind: "link", lookup: "itemGroup" },
  { name: "item_code", label: "Item", kind: "link", lookup: "item" },
  { name: "warehouse", label: "Warehouse", kind: "link", lookup: "warehouse" },
];

const COLUMNS: readonly ReportColumn[] = [
  { key: "itemCode", label: "Item", kind: "text", width: 100, link: "item" },
  { key: "itemName", label: "Item Name", kind: "text", width: 150 },
  { key: "itemGroup", label: "Item Group", kind: "text", width: 100 },
  { key: "warehouse", label: "Warehouse", kind: "text", width: 100 },
  { key: "stockUom", label: "Stock UOM", kind: "text", width: 90 },
  { key: "balQty", label: "Balance Qty", kind: "float", width: 100 },
  { key: "balVal", label: "Balance Value", kind: "currency", width: 100 },
  { key: "openingQty", label: "Opening Qty", kind: "float", width: 100 },
  { key: "openingVal", label: "Opening Value", kind: "currency", width: 110 },
  { key: "inQty", label: "In Qty", kind: "float", width: 80, tone: "in" },
  { key: "inVal", label: "In Value", kind: "float", width: 80 },
  { key: "outQty", label: "Out Qty", kind: "float", width: 80, tone: "out" },
  { key: "outVal", label: "Out Value", kind: "float", width: 80 },
  { key: "valRate", label: "Valuation Rate", kind: "currency", width: 90 },
  { key: "company", label: "Company", kind: "text", width: 100 },
];

export default async function StockBalancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const f = parseStockFilters(await searchParams, siteToday(), await defaultStockCompany(db));
  const entries = await loadLedger(db, { company: f.company, toDate: f.toDate, itemCode: f.itemCode, itemGroup: f.itemGroup, warehouse: f.warehouse });
  const [items, opening] = await Promise.all([loadItemDetails(db, entries.map((e) => e.itemCode)), loadOpeningVouchers(db, f.toDate)]);
  const rows = stockBalance(entries, items, { fromDate: f.fromDate, toDate: f.toDate }, opening);
  // The report's Total row sums every number column, the valuation rate included (as the old one did).
  const total: Record<string, number> = {};
  for (const r of rows) for (const c of COLUMNS) if (c.kind !== "text") total[c.key] = (total[c.key] ?? 0) + (r[c.key as keyof typeof r] as number);
  return (
    <>
      <PageHeader crumbs={["Stock", "Stock Reports"]} title="Stock Balance" />
      <section className="po-card">
        <ReportFilters
          fields={FIELDS}
          values={{ company: f.company, from_date: f.fromDate, to_date: f.toDate, item_group: f.itemGroup, item_code: f.itemCode, warehouse: f.warehouse }}
        />
        <ReportTable
          columns={COLUMNS}
          rows={rows.map((r) => ({ ...r, itemHref: items.get(r.itemCode)?.id ? masterPath("items", items.get(r.itemCode)!.id!) : null }))}
          total={rows.length ? total : null}
        />
      </section>
    </>
  );
}
