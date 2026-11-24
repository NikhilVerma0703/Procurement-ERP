import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { AgeingChart } from "@/components/purchase/stock/AgeingChart";
import { ReportFilters, type ReportFilterField } from "@/components/purchase/stock/ReportFilters";
import { ReportTable, type ReportColumn } from "@/components/purchase/stock/ReportTable";
import { siteToday } from "@/lib/purchase/format";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { defaultStockCompany } from "@/lib/purchase/stock/ledger-data";
import { itemHrefs } from "@/lib/purchase/stock/report-items";
import { plainText, stockAgeing } from "@/lib/purchase/stock/reports-more";
import { loadAgeing } from "@/lib/purchase/stock/reports-more-data";

// Stock › Stock Reports › Stock Ageing (owner, 24-11-2026): ERPNext 14.92's FIFO ageing of the stock
// held on a date (stock/reports-more.ts) — equal row for row, in the same order, to the old site's own
// answer of 24-11-2026 (npm run golden:stock), with its chart of the ten oldest items.

export const metadata: Metadata = { title: "Stock Ageing" };
export const dynamic = "force-dynamic";

const FIELDS: readonly ReportFilterField[] = [
  { name: "company", label: "Company", kind: "link", lookup: "company", required: true },
  { name: "to_date", label: "As On Date", kind: "date", required: true },
  { name: "warehouse", label: "Warehouse", kind: "link", lookup: "warehouse" },
  { name: "item_code", label: "Item", kind: "link", lookup: "stdItem" },
  { name: "brand", label: "Brand", kind: "data" },
  { name: "range1", label: "Ageing Range 1", kind: "int", required: true },
  { name: "range2", label: "Ageing Range 2", kind: "int", required: true },
  { name: "range3", label: "Ageing Range 3", kind: "int", required: true },
  { name: "show_warehouse_wise_stock", label: "Show Warehouse-wise Stock", kind: "check" },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 140) || null;
const intOr = (v: string | null, d: number) => (v && /^-?\d+$/.test(v) ? Number(v) : d);

export default async function StockAgeingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const sp = await searchParams;
  const toDate = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to_date) ?? "") ? one(sp.to_date)! : siteToday();
  const f = {
    company: one(sp.company) ?? (await defaultStockCompany(db)), toDate, warehouse: one(sp.warehouse), itemCode: one(sp.item_code), brand: one(sp.brand),
    range1: intOr(one(sp.range1), 30), range2: intOr(one(sp.range2), 60), range3: intOr(one(sp.range3), 90), showWarehouseWise: sp.show_warehouse_wise_stock === "1",
  };
  const { entries, items } = await loadAgeing(db, f);
  const { rows, chart } = stockAgeing(entries, items, f);
  const hrefs = await itemHrefs(db, rows.map((r) => r.itemCode));
  // The columns, the range labels from the ranges chosen (get_columns).
  const columns: ReportColumn[] = [
    { key: "itemCode", label: "Item Code", kind: "text", width: 100, link: "item" },
    { key: "itemName", label: "Item Name", kind: "text", width: 100 },
    { key: "description", label: "Description", kind: "text", width: 200 },
    { key: "itemGroup", label: "Item Group", kind: "text", width: 100 },
    { key: "brand", label: "Brand", kind: "text", width: 100 },
    ...(f.showWarehouseWise ? [{ key: "warehouse", label: "Warehouse", kind: "text" as const, width: 100 }] : []),
    { key: "qty", label: "Available Qty", kind: "float", width: 100 },
    { key: "averageAge", label: "Average Age", kind: "float", width: 100 },
    { key: "range1", label: `Age (0 - ${f.range1})`, kind: "float", width: 140 },
    { key: "range2", label: `Age (${f.range1 + 1} - ${f.range2})`, kind: "float", width: 140 },
    { key: "range3", label: `Age (${f.range2 + 1} - ${f.range3})`, kind: "float", width: 140 },
    { key: "range4", label: `Age (${f.range3 + 1} - Above)`, kind: "float", width: 140 },
    { key: "earliest", label: "Earliest", kind: "float", width: 80 },
    { key: "latest", label: "Latest", kind: "float", width: 80 },
    { key: "uom", label: "UOM", kind: "text", width: 100 },
  ];
  return (
    <>
      <PageHeader crumbs={["Stock", "Stock Reports"]} title="Stock Ageing" />
      <section className="po-card">
        <ReportFilters
          fields={FIELDS}
          values={{
            company: f.company, to_date: f.toDate, warehouse: f.warehouse, item_code: f.itemCode, brand: f.brand,
            range1: String(f.range1), range2: String(f.range2), range3: String(f.range3), show_warehouse_wise_stock: f.showWarehouseWise ? "1" : null,
          }}
        />
        {chart && <AgeingChart labels={chart.labels} values={chart.values} />}
        <ReportTable columns={columns} rows={rows.map((r) => ({ ...r, description: plainText(r.description), itemHref: hrefs.get(r.itemCode) ?? null }))} />
      </section>
    </>
  );
}
