"use client";

// Stock › Stock Reports › Stock Summary (owner, 24-11-2026), as the old "stock-balance" page drew its
// item dashboard (captured 24-11-2026): Warehouse, Item and Item Group filters and the sort (Projected
// qty, ascending, by default); each Bin as a row — its warehouse, its item (and name), the Reserved
// Qty bar and the Actual Qty bar (with the qty still awaited), each page of 20 scaled to its own
// largest figure; More for the next 20. A click on a warehouse or item filters by it; a click on the
// item already filtered opens it. The old Move / Add buttons made Stock Entries, which are not
// entered here (docs/12 §8, decision 5).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Loader2 } from "lucide-react";
import { cn } from "@/lib/purchase/cn";
import { SUMMARY_SORTS, type SummaryRow, type SummarySort } from "@/lib/purchase/stock/reports-more";
import { Field, LinkInput } from "../form/controls";
import { usePopover } from "../ui/usePopover";

export interface SummaryPage {
  rows: (SummaryRow & { itemHref: string | null })[];
  maxCount: number;
}

export function StockSummaryList({ pages, more, filters }: {
  pages: SummaryPage[];
  more: boolean;
  filters: { warehouse: string | null; itemCode: string | null; itemGroup: string | null; sort: SummarySort; order: "asc" | "desc"; limit: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const sort = usePopover<HTMLDivElement>();
  const go = (next: Partial<typeof filters>) => {
    const f = { ...filters, limit: 20, ...next };
    const q = new URLSearchParams();
    if (f.warehouse) q.set("warehouse", f.warehouse);
    if (f.itemCode) q.set("item_code", f.itemCode);
    if (f.itemGroup) q.set("item_group", f.itemGroup);
    if (f.sort !== "projected_qty") q.set("sort", f.sort);
    if (f.order !== "asc") q.set("order", f.order);
    if (f.limit !== 20) q.set("limit", String(f.limit));
    start(() => router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  };
  const rows = pages.flatMap((p) => p.rows.map((r) => ({ r, max: p.maxCount })));
  const pct = (v: number, max: number) => (max ? Math.trunc((v / max) * 100) : 0);
  return (
    <section className="po-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 p-3" aria-busy={pending}>
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Warehouse"><LinkInput type="warehouse" value={filters.warehouse} placeholder="Warehouse" onChange={(v) => go({ warehouse: v })} /></Field>
          <Field label="Item"><LinkInput type="stdItem" value={filters.itemCode} placeholder="Item" onChange={(v) => go({ itemCode: v })} /></Field>
          <Field label="Item Group"><LinkInput type="itemGroup" value={filters.itemGroup} placeholder="Item Group" onChange={(v) => go({ itemGroup: v })} /></Field>
        </div>
        <div ref={sort.ref} className="relative flex">
          <button
            type="button"
            onClick={() => go({ order: filters.order === "asc" ? "desc" : "asc" })}
            className="po-btn-secondary rounded-r-none px-2 py-1.5"
            title={filters.order === "asc" ? "ascending" : "descending"}
            aria-label={`Sort order: ${filters.order === "asc" ? "ascending" : "descending"}`}
          >
            {filters.order === "asc" ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => sort.setOpen(!sort.open)} className="po-btn-secondary -ml-px rounded-l-none py-1.5" aria-expanded={sort.open}>
            {SUMMARY_SORTS.find((s) => s.key === filters.sort)?.label}
          </button>
          {sort.open && (
            <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-gray-200 bg-white py-1 shadow-lg" role="menu">
              {SUMMARY_SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s.key === filters.sort}
                  onClick={() => {
                    sort.setOpen(false);
                    go({ sort: s.key });
                  }}
                  className={cn("block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50", s.key === filters.sort ? "font-semibold text-brand-700" : "text-gray-700")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {pending && <Loader2 className="mx-auto my-3 h-4 w-4 animate-spin text-gray-400" aria-label="Loading" />}
      <div className="divide-y divide-gray-100">
        {rows.map(({ r, max }, i) => (
          <div key={`${r.itemCode}-${r.warehouse}-${i}`} className="grid grid-cols-1 items-center gap-2 px-4 py-2.5 text-[13px] sm:grid-cols-[1fr_1.4fr_1.6fr]">
            <button type="button" className="truncate text-left text-gray-700 hover:underline" title={r.warehouse} onClick={() => go({ warehouse: r.warehouse })}>
              {r.warehouse}
            </button>
            {filters.itemCode === r.itemCode && r.itemHref ? (
              <Link href={r.itemHref} className="truncate text-gray-900 hover:underline" title={r.itemCode}>
                {r.itemCode}
                {r.itemName !== r.itemCode && <span className="text-gray-500"> ({r.itemName})</span>}
              </Link>
            ) : (
              <button type="button" className="truncate text-left text-gray-900 hover:underline" title={r.itemCode} onClick={() => go({ itemCode: r.itemCode })}>
                {r.itemCode}
                {r.itemName !== r.itemCode && <span className="text-gray-500"> ({r.itemName})</span>}
              </button>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
              <div title="Reserved Qty">
                <div className="mb-0.5 tabular-nums">{String(r.totalReserved)}</div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-[#a5c8f7]" style={{ width: `${pct(Math.abs(r.totalReserved), max) || 5}%` }} />
                </div>
              </div>
              {/* The old template printed the figures as they came, without separators ("4107.726"). */}
              <div title={`Actual Qty ${r.actualQty} / Waiting Qty ${r.pendingQty}`}>
                <div className="mb-0.5 tabular-nums">
                  {String(r.actualQty)} {r.pendingQty > 0 ? `(${r.pendingQty})` : ""}
                </div>
                <div className="flex h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-l-full bg-[#2490ef]" style={{ width: `${Math.max(0, pct(r.actualQty, max))}%` }} />
                  {r.pendingQty > 0 && <div className="h-2 bg-[#a5c8f7]" title="Projected Qty" style={{ width: `${pct(r.pendingQty, max)}%` }} />}
                </div>
              </div>
            </div>
          </div>
        ))}
        {!rows.length && <p className="p-6 text-sm text-gray-500">No Stock Available Currently</p>}
      </div>
      {more && (
        <div className="border-t border-gray-200 p-3">
          <button type="button" className="po-btn-secondary" onClick={() => go({ limit: filters.limit + 20 })}>
            More
          </button>
        </div>
      )}
    </section>
  );
}
