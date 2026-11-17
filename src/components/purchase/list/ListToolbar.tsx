"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, FilterX, Loader2 } from "lucide-react";
import { PO_STATUSES } from "@/lib/purchase/calc/status";
import { cn } from "@/lib/purchase/cn";
import { listHref, QUICK_FILTERS, SORT_FIELDS, type ListFilter, type ListQuery, type QuickKey, type SortKey } from "@/lib/purchase/orders/list";
import { usePopover } from "../ui/usePopover";
import { FilterBuilder } from "./FilterBuilder";

// The bar above the list, as on the old site: quick filters (ID, Supplier,
// Supplier Name, Company, Status), the filter builder, "clear filters", and
// the sort order and field. Every change rewrites the address, and the page
// (a server component) reads it; typing waits a moment before it applies.

const TYPING_DELAY_MS = 350;

export function ListToolbar({ query, suppliers, companies }: { query: ListQuery; suppliers: { code: string; name: string }[]; companies: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState<ListQuery["quick"]>(query.quick);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sort = usePopover<HTMLDivElement>();

  // The address changed elsewhere (a link, Back): show what it says.
  useEffect(() => setTyped(query.quick), [query.quick]);

  /** Goes to the list in a new state; a new search starts again from the first page. */
  const go = (next: Partial<ListQuery>) =>
    startTransition(() => router.replace(listHref(pathname, { ...query, ...next, limit: next.limit ?? query.pageLength }), { scroll: false }));

  const setQuick = (key: QuickKey, value: string, delay = TYPING_DELAY_MS) => {
    const quick = { ...typed, [key]: value };
    if (!value) delete quick[key];
    setTyped(quick);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ quick }), delay);
  };

  const anyFilter = query.filters.length > 0 || Object.keys(query.quick).length > 0;
  const sortLabel = SORT_FIELDS.find((s) => s.key === query.sort)?.label ?? "";
  const input = "po-field-input w-full py-1.5 sm:w-36";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map(({ key, label }) =>
          key === "status" ? (
            <select
              key={key}
              aria-label={label}
              className={cn(input, !typed.status && "text-gray-400")}
              value={typed.status ?? ""}
              onChange={(e) => setQuick("status", e.target.value, 0)}
            >
              <option value="">{label}</option>
              {PO_STATUSES.map((s) => (
                <option key={s} value={s} className="text-gray-900">
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={key}
              aria-label={label}
              placeholder={label}
              className={input}
              value={typed[key] ?? ""}
              list={key === "supplier" ? "po-suppliers" : key === "company" ? "po-companies" : undefined}
              onChange={(e) => setQuick(key, e.target.value)}
            />
          ),
        )}
        <datalist id="po-suppliers">
          {suppliers.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name !== s.code ? s.name : undefined}
            </option>
          ))}
        </datalist>
        <datalist id="po-companies">
          {companies.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Loading" />}
      </div>

      <div className="flex items-center gap-2">
        <FilterBuilder filters={query.filters} onApply={(filters: ListFilter[]) => go({ filters })} />
        {anyFilter && (
          <button type="button" onClick={() => go({ quick: {}, filters: [] })} className="po-btn-secondary px-2 py-1.5" title="Clear filters" aria-label="Clear filters">
            <FilterX className="h-4 w-4" />
          </button>
        )}
        <div ref={sort.ref} className="relative flex">
          <button
            type="button"
            onClick={() => go({ order: query.order === "desc" ? "asc" : "desc", limit: query.limit })}
            className="po-btn-secondary rounded-r-none px-2 py-1.5"
            title={query.order === "desc" ? "Descending" : "Ascending"}
            aria-label={`Sort order: ${query.order === "desc" ? "descending" : "ascending"}`}
          >
            {query.order === "desc" ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => sort.setOpen(!sort.open)} className="po-btn-secondary -ml-px rounded-l-none py-1.5" aria-expanded={sort.open}>
            {sortLabel}
          </button>
          {sort.open && (
            <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg" role="menu">
              {SORT_FIELDS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s.key === query.sort}
                  onClick={() => {
                    sort.setOpen(false);
                    go({ sort: s.key as SortKey });
                  }}
                  className={cn("block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50", s.key === query.sort ? "font-semibold text-brand-700" : "text-gray-700")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
