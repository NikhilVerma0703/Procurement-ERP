import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IndicatorPill } from "@/components/purchase/doc/IndicatorPill";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { GateEntryListFilters } from "@/components/purchase/stock/GateEntryListFilters";
import { cn } from "@/lib/purchase/cn";
import { timeAgoMini } from "@/lib/purchase/format";
import { gateEntryPath, orderPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { GATE_ENTRY_PAGE_SIZES, gateEntryListParams, listGateEntries, parseGateEntryListQuery } from "@/lib/purchase/stock/gate-entries";
import { gateEntryIndicator, listCountLabel } from "@/lib/purchase/stock/gate-entry-meta";

// The Gate Entry List (owner, 23-11-2026: "From the search box we search Gate Entry List — this is
// Thiru R's part"), as the old list showed it to him (captured 23-11-2026): ID, Status, Po No, when
// each was last changed; newest created first; the ID filter; "+ Add Gate Entry"; 20 / 100 / 500 /
// 2500 a page and Load More; the count "20 of 1,000+". Every gate entry of the old site is here.

export const metadata: Metadata = { title: "Gate Entry" };
export const dynamic = "force-dynamic";

export default async function GateEntryListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const q = parseGateEntryListQuery(await searchParams);
  const { rows, total } = await listGateEntries(db, q);
  const now = new Date();
  const href = (over: Parameters<typeof gateEntryListParams>[1]) => {
    const p = gateEntryListParams(q, over).toString();
    return p ? `?${p}` : "?";
  };
  return (
    <>
      <PageHeader
        crumbs={["Stock", "Stock Transactions"]}
        title="Gate Entry"
        actions={<Link href={`${PURCHASE_PATHS.gateEntries}/new`} className="po-btn-primary">+ Add Gate Entry</Link>}
      />
      <section className="po-card">
        <Suspense>
          <GateEntryListFilters name={q.name} />
        </Suspense>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="text-left text-xs text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Po No</th>
                <th className="px-3 py-2 text-right font-medium text-gray-400">
                  {rows.length} of {listCountLabel(total)}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ind = gateEntryIndicator(r.docStatus);
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-gray-900">
                      <Link href={gateEntryPath(r.id)} className="hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-3 py-2"><IndicatorPill label={ind.label} colour={ind.colour} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {r.orderId ? <Link href={orderPath(r.orderId)} className="hover:underline">{r.orderNumber}</Link> : r.orderNumber}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-gray-400" title={r.updatedAt.toISOString()}>{timeAgoMini(r.updatedAt, now)}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-gray-500">No Gate Entry found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-3 py-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="group" aria-label="Rows per page">
              {GATE_ENTRY_PAGE_SIZES.map((n, i) => (
                <Link
                  key={n}
                  href={href({ pageLength: n, limit: n })}
                  scroll={false}
                  aria-current={q.pageLength === n ? "true" : undefined}
                  className={cn("px-3 py-1.5 font-medium", i > 0 && "border-l border-gray-300", q.pageLength === n ? "bg-brand-50 text-brand-700" : "bg-white text-gray-700 hover:bg-gray-50")}
                >
                  {n}
                </Link>
              ))}
            </div>
            {rows.length < total && (
              <Link href={href({ limit: q.limit + q.pageLength })} scroll={false} className="po-btn-secondary">
                Load More
              </Link>
            )}
          </div>
        )}
      </section>
    </>
  );
}
