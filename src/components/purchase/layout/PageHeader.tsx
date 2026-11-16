import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * A Purchase page's heading: the breadcrumb the original ERPNext screens
 * show above the title ("Buying › Purchase Order"), the title, and the
 * page's actions on the right (the original's "+ Add Purchase Order",
 * "Actions", "Create" … buttons).
 */
export function PageHeader({
  crumbs,
  title,
  badge,
  actions,
}: {
  crumbs?: readonly string[];
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-sm text-gray-500">
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              <span className={i === crumbs.length - 1 ? "text-gray-700" : undefined}>{c}</span>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">{title}</h1>
          {badge}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
