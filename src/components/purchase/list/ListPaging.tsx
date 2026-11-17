import Link from "next/link";
import { cn } from "@/lib/purchase/cn";
import { listHref, PAGE_LENGTHS, type ListQuery } from "@/lib/purchase/orders/list";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";

// The old list's footer: rows per page (20 / 100 / 500 / 2500) on the left,
// "Load More" on the right while more rows match. Load More shows the next
// page below the rows already shown.
export function ListPaging({ query, shown, total }: { query: ListQuery; shown: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-3 py-3">
      <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="group" aria-label="Rows per page">
        {PAGE_LENGTHS.map((n, i) => (
          <Link
            key={n}
            href={listHref(PURCHASE_PATHS.orders, { ...query, pageLength: n, limit: n })}
            scroll={false}
            aria-current={query.pageLength === n ? "true" : undefined}
            className={cn(
              "px-3 py-1.5 font-medium",
              i > 0 && "border-l border-gray-300",
              query.pageLength === n ? "bg-brand-50 text-brand-700" : "bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {n}
          </Link>
        ))}
      </div>
      {shown < total && (
        <Link
          href={listHref(PURCHASE_PATHS.orders, { ...query, limit: query.limit + query.pageLength })}
          scroll={false}
          className="po-btn-secondary"
        >
          Load More
        </Link>
      )}
    </div>
  );
}
