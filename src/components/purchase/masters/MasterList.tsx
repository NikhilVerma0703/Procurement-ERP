"use client";

// A master's list, as Frappe's list view showed it: the standard filters and
// a search above, then the rows (the title in bold opening the record, the
// screen's columns, a status pill, the ID and when it last changed), "20 of
// 625", and 20 / 100 / 500 with "Load More". Its state is the address bar
// (lib/purchase/masters/list-query.ts), so a filtered list can be bookmarked.
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/purchase/cn";
import type { MasterKey } from "@/lib/purchase/routes";
import { QuickEntryDialog } from "./QuickEntryDialog";
import { formatCount, timeAgoMini } from "@/lib/purchase/format";
import { masterQueryParams, PAGE_SIZES, type ListColumnSpec, type ListFilterSpec, type ListRow, type ListShape, type MasterListQuery } from "@/lib/purchase/masters/list-query";

export type { ListColumnSpec, ListFilterSpec, ListRow };

const PILL: Record<string, string> = {
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  orange: "bg-orange-50 text-orange-700",
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-50 text-blue-700",
};

export function MasterList({ title, titleLabel, rows, total, query, shape, filters, columns, sorts, newHref, quickEntry, now }: {
  title: string;
  /** The title column's heading ("Supplier Name"). */
  titleLabel: string;
  rows: ListRow[];
  total: number;
  query: MasterListQuery;
  shape: ListShape;
  filters: ListFilterSpec[];
  columns: ListColumnSpec[];
  sorts: { key: string; label: string }[];
  newHref?: string;
  /** New opens this master's quick entry dialog (?new=1 opens it on arrival). */
  quickEntry?: MasterKey;
  now: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (quickEntry && search.get("new") === "1") {
      setAdding(true);
      router.replace(pathname);
    }
  }, [quickEntry, search, router, pathname]);
  const [q, setQ] = useState(query.q);
  useEffect(() => setQ(query.q), [query.q]);

  const go = (next: Partial<MasterListQuery>) => {
    const params = masterQueryParams({ ...query, ...next }, shape);
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-gray-500">
            Buying › {title}
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-pacific-dark">{title}</h1>
        </div>
        {quickEntry ? (
          <button type="button" className="po-btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add {title}
          </button>
        ) : (
          newHref && (
            <Link href={newHref} className="po-btn-primary">
              <Plus className="h-4 w-4" aria-hidden /> Add {title}
            </Link>
          )
        )}
      </div>
      <section className="po-card">
        <form
          className="flex flex-wrap items-end gap-2 border-b border-gray-200 px-3 py-3 sm:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q, limit: PAGE_SIZES[0] });
          }}
        >
          <label className="relative min-w-[180px] flex-1 sm:max-w-[240px]">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-gray-400" aria-hidden />
            <input className="w-full rounded-md border border-transparent bg-[#f4f5f6] py-1.5 pl-8 pr-2.5 text-[13px] focus:border-gray-300 focus:bg-white focus:outline-none" placeholder="ID or name" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== query.q && go({ q, limit: PAGE_SIZES[0] })} />
          </label>
          {filters.map((f) =>
            f.options ? (
              <label key={f.key} className="min-w-[150px]">
                <span className="sr-only">{f.label}</span>
                <select className="w-full rounded-md border border-transparent bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] focus:border-gray-300 focus:bg-white focus:outline-none" value={query.filters[f.key] ?? ""} onChange={(e) => go({ filters: { ...query.filters, [f.key]: e.target.value }, limit: PAGE_SIZES[0] })}>
                  <option value="">{f.label}</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <FilterText key={f.key} label={f.label} value={query.filters[f.key] ?? ""} onSet={(v) => go({ filters: { ...query.filters, [f.key]: v }, limit: PAGE_SIZES[0] })} />
            ),
          )}
          <div className="ml-auto flex items-center gap-1 text-[13px]">
            <label>
              <span className="sr-only">Sort by</span>
              <select className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px]" value={query.sort} onChange={(e) => go({ sort: e.target.value })}>
                {sorts.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-gray-600 hover:bg-gray-50" aria-label={query.order === "asc" ? "Ascending" : "Descending"} title={query.order === "asc" ? "Ascending" : "Descending"} onClick={() => go({ order: query.order === "asc" ? "desc" : "asc" })}>
              {query.order === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="px-4 py-2 font-normal">{titleLabel}</th>
                {columns.map((c) => (
                  <th key={c.key} className={cn("px-3 py-2 font-normal", c.align === "right" && "text-right", c.wide && "hidden md:table-cell")}>
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-normal">
                  {formatCount(rows.length)} of {formatCount(total)}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-10 text-center text-sm text-gray-400">
                    No {title} found
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/70">
                  <td className="max-w-[320px] px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Link href={r.href} className="truncate font-medium text-gray-900 hover:underline" title={r.title}>
                        {r.title}
                      </Link>
                      {r.pill && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", PILL[r.pill.colour])}>{r.pill.label}</span>}
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className={cn("max-w-[240px] truncate px-3 py-2 text-gray-700", c.align === "right" && "text-right", c.wide && "hidden md:table-cell")} title={r.cells[c.key] ?? undefined}>
                      {r.cells[c.key] ?? ""}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-gray-500">
                    <span className="mr-3 hidden truncate align-middle sm:inline-block sm:max-w-[200px]" title={r.name}>
                      {r.name}
                    </span>
                    <span suppressHydrationWarning>{timeAgoMini(r.updatedAt, new Date(now))}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
          <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
            {PAGE_SIZES.map((n) => (
              <button key={n} type="button" className={cn("px-2.5 py-1", query.limit === n ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50")} onClick={() => go({ limit: n })}>
                {n}
              </button>
            ))}
          </div>
          {rows.length < total && (
            <button type="button" className="po-btn-secondary text-xs" onClick={() => go({ limit: query.limit + (PAGE_SIZES.includes(query.limit as 20) ? query.limit : PAGE_SIZES[0]) })}>
              Load More
            </button>
          )}
        </div>
      </section>
      {adding && quickEntry && <QuickEntryDialog master={quickEntry} onClose={() => setAdding(false)} />}
    </>
  );
}

function FilterText({ label, value, onSet }: { label: string; value: string; onSet: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="min-w-[150px]">
      <span className="sr-only">{label}</span>
      <input
        className="w-full rounded-md border border-transparent bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] focus:border-gray-300 focus:bg-white focus:outline-none"
        placeholder={label}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSet(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSet(v);
          }
        }}
      />
    </label>
  );
}
