import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReportFilters, type ReportFilterField } from "@/components/purchase/stock/ReportFilters";
import { ReportTable, type ReportColumn } from "@/components/purchase/stock/ReportTable";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { defaultStockCompany } from "@/lib/purchase/stock/ledger-data";
import { warehouseWiseStockBalance } from "@/lib/purchase/stock/reports-more";
import { loadWarehouseBalance } from "@/lib/purchase/stock/reports-more-data";

// Stock › Stock Reports › Warehouse Wise Stock Balance (owner, 24-11-2026): the value of each
// warehouse's ledger entries, as a tree (ERPNext 14.92's report, stock/reports-more.ts) — equal to the
// old site's own answer of 24-11-2026 on all 29 warehouses, in its order (npm run golden:stock).

export const metadata: Metadata = { title: "Warehouse Wise Stock Balance" };
export const dynamic = "force-dynamic";

const FIELDS: readonly ReportFilterField[] = [
  { name: "company", label: "Company", kind: "link", lookup: "company", required: true },
  { name: "show_disabled_warehouses", label: "Show Disabled Warehouses", kind: "check" },
];

const COLUMNS: readonly ReportColumn[] = [
  { key: "name", label: "Warehouse", kind: "text", width: 200, tree: true },
  { key: "stockBalance", label: "Stock Balance", kind: "float", width: 150 },
];

export default async function WarehouseWiseStockBalancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const sp = await searchParams;
  const company = (Array.isArray(sp.company) ? sp.company[0] : sp.company)?.trim().slice(0, 140) || (await defaultStockCompany(db));
  const showDisabled = sp.show_disabled_warehouses === "1";
  const { warehouses, balance } = await loadWarehouseBalance(db, { company, showDisabled });
  const rows = warehouseWiseStockBalance(warehouses, balance);
  return (
    <>
      <PageHeader crumbs={["Stock", "Stock Reports"]} title="Warehouse Wise Stock Balance" />
      <section className="po-card">
        <ReportFilters fields={FIELDS} values={{ company, show_disabled_warehouses: showDisabled ? "1" : null }} />
        <ReportTable columns={COLUMNS} rows={rows as unknown as Record<string, unknown>[]} />
      </section>
    </>
  );
}
