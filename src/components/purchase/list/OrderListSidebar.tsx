"use client";

// The Purchase Order list's sidebar (collab/ListSidebar.tsx), reading and writing the list's conditions in
// the address bar: a condition the quick-filter bar holds (ID, Supplier, Supplier Name, Company, Status) goes
// back into it, as Frappe put a standard field's filter in its box; the rest go to the filter builder.
import { useRouter } from "next/navigation";
import { allFilters, listHref, listQueryToParams, normaliseFilter, QUICK_FILTERS, type ListFilter, type ListQuery, type QuickKey } from "@/lib/purchase/orders/list";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { ListSidebar, type GroupField, type SavedFilter, type SidebarFilter } from "../collab/ListSidebar";
import { useTagsShown } from "../collab/sidebar-state";

const QUICK = new Set<string>(QUICK_FILTERS.map((q) => q.key));
const LIKE_QUICK = new Set(["name", "supplier_name"]);

/** A condition as the quick bar would hold it (its value), or null when it belongs to the builder. */
function asQuick(f: SidebarFilter): string | null {
  if (!QUICK.has(f.field) || Array.isArray(f.value)) return null;
  if (LIKE_QUICK.has(f.field)) return f.op === "like" && /^%[^%]+%$/.test(f.value) ? f.value.slice(1, -1) : null;
  return f.op === "=" ? f.value : null;
}

export function OrderListSidebar({ query, viewer, saved, canGlobal, groupFields }: { query: ListQuery; viewer: string; saved: SavedFilter[]; canGlobal: boolean; groupFields: GroupField[] }) {
  const router = useRouter();
  const [showTags, toggleTags] = useTagsShown();
  const filters: SidebarFilter[] = allFilters(query).map((f) => ({ field: f.field, op: f.op, value: f.value }));
  const params = listQueryToParams(query);
  params.delete("limit");

  const onFilters = (next: SidebarFilter[]) => {
    const quick: ListQuery["quick"] = {};
    const builder: ListFilter[] = [];
    for (const f of next) {
      const q = asQuick(f);
      if (q !== null && !quick[f.field as QuickKey]) quick[f.field as QuickKey] = q;
      else {
        const n = normaliseFilter(f.field, f.op, f.value);
        if (n) builder.push(n);
      }
    }
    router.push(listHref(PURCHASE_PATHS.orders, { ...query, quick, filters: builder, limit: query.pageLength }));
  };

  return (
    <ListSidebar
      doctype="Purchase Order"
      search={params.toString()}
      groupFields={groupFields}
      filters={filters}
      onFilters={onFilters}
      saved={saved}
      canGlobal={canGlobal}
      viewer={viewer}
      showTags={showTags}
      onToggleTags={toggleTags}
    />
  );
}
