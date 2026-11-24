import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { StockSummaryList, type SummaryPage } from "@/components/purchase/stock/StockSummaryList";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { itemHrefs } from "@/lib/purchase/stock/report-items";
import { SUMMARY_SORTS, summaryRows, type SummarySort } from "@/lib/purchase/stock/reports-more";
import { loadSummary } from "@/lib/purchase/stock/reports-more-data";

// Stock › Stock Reports › Stock Summary (owner, 24-11-2026): the old page over the Bins
// (erpnext.stock.ItemDashboard and item_dashboard.get_data, stock/reports-more.ts), 20 a page, each
// page's bars scaled to its own largest figure as the old one appended them.

export const metadata: Metadata = { title: "Stock Summary" };
export const dynamic = "force-dynamic";

const PAGE = 20;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 140) || null;

export default async function StockSummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const sp = await searchParams;
  const sortKey = one(sp.sort);
  const sort: SummarySort = SUMMARY_SORTS.some((s) => s.key === sortKey) ? (sortKey as SummarySort) : "projected_qty";
  const order = one(sp.order) === "desc" ? "desc" : "asc";
  const limit = Math.min(Math.max(PAGE, Math.trunc(Number(one(sp.limit)) / PAGE) * PAGE || PAGE), 2000);
  const f = { warehouse: one(sp.warehouse), itemCode: one(sp.item_code), itemGroup: one(sp.item_group), sort, order: order as "asc" | "desc", limit };
  // One more than shown tells whether there is a further page (the old page read 21).
  const bins = await loadSummary(db, { ...f, start: 0, length: limit + 1 });
  const more = bins.length > limit;
  const shown = bins.slice(0, limit);
  const hrefs = await itemHrefs(db, shown.map((b) => b.itemCode));
  const pages: SummaryPage[] = [];
  for (let i = 0; i < shown.length; i += PAGE) {
    const { rows, maxCount } = summaryRows(shown.slice(i, i + PAGE));
    pages.push({ rows: rows.map((r) => ({ ...r, itemHref: hrefs.get(r.itemCode) ?? null })), maxCount });
  }
  return (
    <>
      <PageHeader crumbs={["Stock", "Stock Reports"]} title="Stock Summary" />
      <StockSummaryList pages={pages} more={more} filters={f} />
    </>
  );
}
