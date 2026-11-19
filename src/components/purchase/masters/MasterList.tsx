"use client";

// A master's list, as Frappe's list view showed it: the standard filters and
// a search above, then the rows (the title in bold opening the record, the
// screen's columns, a status pill, the ID and when it last changed), "20 of
// 625", and 20 / 100 / 500 with "Load More". Its state is the address bar
// (lib/purchase/masters/list-query.ts), so a filtered list can be bookmarked.
//
// As the old lists had them (owner decision 19-11-2026): a checkbox and a ♥
// before each title, the heading's checkbox ticking every row shown and its ♥
// showing only what you liked ("Liked By like %<you>%"). While rows are ticked
// the heading reads "N items selected" and "Add …" gives way to Actions:
// Export (the ticked rows' list columns as a .csv file) and Delete (each
// record through its own Delete). Frappe's Edit, Assign To, Apply Assignment
// Rule, Add Tags and Print are not offered (docs/09-masters.md).
import { ChevronDown, Heart, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { bulkDeleteMastersAction } from "@/app/purchase/masters-actions";
import { cn } from "@/lib/purchase/cn";
import { NO_LIKES } from "@/lib/purchase/like-rules";
import type { MasterKey } from "@/lib/purchase/routes";
import { ConfirmDialog } from "../form/Grid";
import { LikeButton } from "../likes/LikeButton";
import { deleteInBatches } from "../list/batches";
import { MessageDialog } from "../list/BulkDialogs";
import { CHECKBOX, ListSelection, useListSelection } from "../list/selection";
import { usePopover } from "../ui/usePopover";
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

type MasterListProps = {
  /** Which master (its likes, its Delete). */
  kind: MasterKey;
  /** The signed-in user's e-mail: their hearts are filled, and the ♥ heading filters by it. */
  viewer: string;
  canLike: boolean;
  /** May the user delete these records (the masters' writers)? */
  canDelete: boolean;
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
};

export function MasterList(props: MasterListProps) {
  return (
    <ListSelection rows={props.rows.map((r) => ({ id: r.id, name: r.name }))}>
      <MasterListBody {...props} />
    </ListSelection>
  );
}

/** The ticked rows' list columns as CSV (Excel opens it; the BOM keeps non-English text). */
function csvOf(head: string[], body: (string | null)[][]): string {
  const cell = (v: string | null) => {
    let t = v ?? "";
    // A value Excel would run as a formula is kept as text.
    if (/^[=+@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "\ufeff" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
}

function MasterListBody({ kind, viewer, canLike, canDelete, title, titleLabel, rows, total, query, shape, filters, columns, sorts, newHref, quickEntry, now }: MasterListProps) {
  const router = useRouter();
  const { chosen, isSelected, allSelected, toggle, setAll, clear } = useListSelection();
  const actions = usePopover<HTMLDivElement>();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [messages, setMessages] = useState<string[] | null>(null);
  const likedByMe = Boolean(query.likedBy) && query.likedBy!.toLowerCase() === viewer.toLowerCase();
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

  /** Actions → Export: the ticked rows as the list shows them, saved as "<Title>.csv". */
  const exportChosen = () => {
    const picked = rows.filter((r) => isSelected(r.id));
    const csv = csvOf(
      ["ID", titleLabel, ...columns.map((c) => c.label)],
      picked.map((r) => [r.name, r.title, ...columns.map((c) => r.cells[c.key] ?? null)]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Actions → Delete: each ticked record through its own Delete; what was refused, and why, after. */
  const runDelete = async () => {
    setDeleting(true);
    try {
      // In turns, so each request stays inside the server's time limit (list/batches.ts).
      const r = await deleteInBatches(chosen.map((c) => ({ id: c.id, name: c.name })), (batch) => bulkDeleteMastersAction(kind, batch));
      setConfirming(false);
      if (!r.ok) return setMessages([r.error]);
      if (r.value.failed.length) setMessages(r.value.failed.map((f) => f.error));
      if (r.value.done.length) {
        clear();
        router.refresh();
      }
    } catch {
      setConfirming(false);
      toast.error("The server could not be reached. What was done before that stays done; refresh to see it.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
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
        {chosen.length > 0 ? (
          <div ref={actions.ref} className="relative">
            <button type="button" className="po-btn-primary" aria-haspopup="menu" aria-expanded={actions.open} disabled={deleting} onClick={() => actions.setOpen(!actions.open)}>
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Actions <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            {actions.open && (
              <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50"
                  onClick={() => {
                    actions.setOpen(false);
                    exportChosen();
                  }}
                >
                  Export
                </button>
                {canDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      actions.setOpen(false);
                      setConfirming(true);
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ) : quickEntry ? (
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
                {chosen.length > 0 ? (
                  <th className="whitespace-nowrap px-4 py-2 font-normal">
                    <label className="inline-flex items-center gap-2.5 font-medium text-gray-700">
                      <input type="checkbox" className={CHECKBOX} checked={allSelected} onChange={(e) => setAll(e.target.checked)} title="Select All" />
                      {chosen.length} items selected
                    </label>
                  </th>
                ) : (
                  <th className="px-4 py-2 font-normal">
                    <span className="inline-flex items-center gap-2.5">
                      <input type="checkbox" className={CHECKBOX} checked={false} disabled={rows.length === 0} onChange={(e) => setAll(e.target.checked)} title="Select All" aria-label="Select All" />
                      <button
                        type="button"
                        className="hidden rounded p-0.5 hover:bg-gray-100 sm:inline-flex"
                        title="Likes"
                        aria-label="Likes"
                        aria-pressed={likedByMe}
                        onClick={() => go({ likedBy: likedByMe ? "" : viewer, limit: PAGE_SIZES[0] })}
                      >
                        <Heart className={cn("h-3.5 w-3.5", likedByMe ? "fill-[#e24c4c] text-[#e24c4c]" : "text-gray-400")} aria-hidden />
                      </button>
                      {titleLabel}
                    </span>
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c.key} className={cn("px-3 py-2 font-normal", c.align === "right" && "text-right", c.wide && "hidden md:table-cell")}>
                    {chosen.length > 0 ? "" : c.label}
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
                      <input
                        type="checkbox"
                        className={CHECKBOX}
                        checked={isSelected(r.id)}
                        onChange={(e) => toggle(r.id, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                        aria-label={`Select ${r.name}`}
                      />
                      <LikeButton kind={kind} id={r.id} likes={r.likes ?? NO_LIKES} canLike={canLike} className="hidden sm:inline-flex" />
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
      {confirming && (
        <ConfirmDialog
          message={chosen.length > 1 ? `Delete ${chosen.length} items permanently?` : `Delete ${chosen.length} item permanently?`}
          busy={deleting}
          onNo={() => setConfirming(false)}
          onYes={() => void runDelete()}
        />
      )}
      {messages && <MessageDialog lines={messages} onClose={() => setMessages(null)} />}
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
