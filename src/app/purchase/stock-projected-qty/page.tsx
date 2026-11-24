import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReportFilters, type ReportFilterField } from "@/components/purchase/stock/ReportFilters";
import { ReportTable, type ReportColumn } from "@/components/purchase/stock/ReportTable";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { defaultStockCompany } from "@/lib/purchase/stock/ledger-data";
import { itemHrefs } from "@/lib/purchase/stock/report-items";
import { plainText, stockProjectedQty, totalRow } from "@/lib/purchase/stock/reports-more";
import { loadProjectedQty } from "@/lib/purchase/stock/reports-more-data";

// Stock › Stock Reports › Stock Projected Qty (owner, 24-11-2026): ERPNext 14.92's report over the
// Bins (stock/reports-more.ts) — equal row for row, in the same order, to the old site's own answer
// of 24-11-2026 (npm run golden:stock). Its "Include UOM" filter is not built (as Stock Balance's).

export const metadata: Metadata = { title: "Stock Projected Qty" };
export const dynamic = "force-dynamic";

const FIELDS: readonly ReportFilterField[] = [
  { name: "company", label: "Company", kind: "link", lookup: "company" },
  { name: "warehouse", label: "Warehouse", kind: "link", lookup: "warehouse" },
  { name: "item_code", label: "Item", kind: "link", lookup: "stdItem" },
  { name: "item_group", label: "Item Group", kind: "link", lookup: "itemGroup" },
  { name: "brand", label: "Brand", kind: "data" },
];

const COLUMNS: readonly ReportColumn[] = [
  { key: "itemCode", label: "Item Code", kind: "text", width: 140, link: "item" },
  { key: "itemName", label: "Item Name", kind: "text", width: 100 },
  { key: "description", label: "Description", kind: "text", width: 200 },
  { key: "itemGroup", label: "Item Group", kind: "text", width: 100 },
  { key: "brand", label: "Brand", kind: "text", width: 100 },
  { key: "warehouse", label: "Warehouse", kind: "text", width: 120 },
  { key: "stockUom", label: "UOM", kind: "text", width: 100 },
  { key: "actualQty", label: "Actual Qty", kind: "float", width: 100 },
  { key: "plannedQty", label: "Planned Qty", kind: "float", width: 100 },
  { key: "indentedQty", label: "Requested Qty", kind: "float", width: 110 },
  { key: "orderedQty", label: "Ordered Qty", kind: "float", width: 100 },
  { key: "reservedQty", label: "Reserved Qty", kind: "float", width: 100 },
  { key: "reservedQtyForProduction", label: "Reserved for Production", kind: "float", width: 100 },
  { key: "reservedQtyForProductionPlan", label: "Reserved for Production Plan", kind: "float", width: 100 },
  { key: "reservedQtyForSubContract", label: "Reserved for Sub Contracting", kind: "float", width: 100 },
  { key: "reservedQtyForPos", label: "Reserved for POS Transactions", kind: "float", width: 100 },
  { key: "projectedQty", label: "Projected Qty", kind: "float", width: 100 },
  { key: "reOrderLevel", label: "Reorder Level", kind: "float", width: 100 },
  { key: "reOrderQty", label: "Reorder Qty", kind: "float", width: 100 },
  { key: "shortageQty", label: "Shortage Qty", kind: "float", width: 100 },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 140) || null;

export default async function StockProjectedQtyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const sp = await searchParams;
  const f = { company: one(sp.company) ?? (await defaultStockCompany(db)), warehouse: one(sp.warehouse), itemCode: one(sp.item_code), itemGroup: one(sp.item_group), brand: one(sp.brand) };
  const { bins, items } = await loadProjectedQty(db, { itemCode: f.itemCode, warehouse: f.warehouse });
  const rows = stockProjectedQty(bins, items, f);
  const hrefs = await itemHrefs(db, rows.map((r) => r.itemCode));
  const view = rows.map((r) => ({ ...r, description: plainText(r.description), itemHref: hrefs.get(r.itemCode) ?? null }));
  const total = rows.length ? totalRow(COLUMNS.filter((c) => c.kind === "float").map((c) => c.key), rows as unknown as Record<string, unknown>[]) : null;
  return (
    <>
      <PageHeader crumbs={["Stock", "Stock Reports"]} title="Stock Projected Qty" />
      <section className="po-card">
        <ReportFilters fields={FIELDS} values={{ company: f.company, warehouse: f.warehouse, item_code: f.itemCode, item_group: f.itemGroup, brand: f.brand }} />
        <ReportTable columns={COLUMNS} rows={view} total={total} />
      </section>
    </>
  );
}
