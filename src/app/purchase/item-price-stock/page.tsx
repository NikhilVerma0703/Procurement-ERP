import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReportFilters, type ReportFilterField } from "@/components/purchase/stock/ReportFilters";
import { ReportTable, type ReportColumn } from "@/components/purchase/stock/ReportTable";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { itemHrefs } from "@/lib/purchase/stock/report-items";
import { itemPriceStock } from "@/lib/purchase/stock/reports-more";
import { loadItemPriceStock } from "@/lib/purchase/stock/reports-more-data";

// Stock › Stock Reports › Item Price Stock (owner, 24-11-2026): each Item Price beside the stock of
// its item in every warehouse (ERPNext 14.92's report, stock/reports-more.ts) — equal row for row,
// in the same order, to the old site's own answer of 24-11-2026 (npm run golden:stock).

export const metadata: Metadata = { title: "Item Price Stock" };
export const dynamic = "force-dynamic";

const FIELDS: readonly ReportFilterField[] = [{ name: "item_code", label: "Item", kind: "link", lookup: "stdItem" }];

const COLUMNS: readonly ReportColumn[] = [
  { key: "itemCode", label: "Item Code", kind: "text", width: 120, link: "item" },
  { key: "itemName", label: "Item Name", kind: "text", width: 120 },
  { key: "brand", label: "Brand", kind: "text", width: 100 },
  { key: "warehouse", label: "Warehouse", kind: "text", width: 120 },
  { key: "stockAvailable", label: "Stock Available", kind: "float", width: 120 },
  { key: "buyingPriceList", label: "Buying Price List", kind: "text", width: 120 },
  { key: "buyingRate", label: "Buying Rate", kind: "currency", width: 120 },
  { key: "sellingPriceList", label: "Selling Price List", kind: "text", width: 120 },
  { key: "sellingRate", label: "Selling Rate", kind: "currency", width: 120 },
];

export default async function ItemPriceStockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const sp = await searchParams;
  const itemCode = (Array.isArray(sp.item_code) ? sp.item_code[0] : sp.item_code)?.trim().slice(0, 140) || null;
  const { prices, bins } = await loadItemPriceStock(db, { itemCode });
  const rows = itemPriceStock(prices, bins, { itemCode });
  const hrefs = await itemHrefs(db, rows.map((r) => r.itemCode));
  return (
    <>
      <PageHeader crumbs={["Stock", "Stock Reports"]} title="Item Price Stock" />
      <section className="po-card">
        <ReportFilters fields={FIELDS} values={{ item_code: itemCode }} />
        <ReportTable columns={COLUMNS} rows={rows.map((r) => ({ ...r, itemHref: hrefs.get(r.itemCode) ?? null }))} />
      </section>
    </>
  );
}
