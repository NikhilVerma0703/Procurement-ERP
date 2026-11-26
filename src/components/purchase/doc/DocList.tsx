"use client";

// A DocType's list, drawn as the old site's list view (owner, 24-11-2026: the Stock sections, and the
// Gate Entry List "looking different … some extra columns and icons"). What it shows is worked out
// on the server from the DocType's own definition (lib/purchase/doc/list-view.ts); this draws it:
//
//   header   ≡ (the sidebar) · List View ▾ · ↻ · ⋯ (Export, Toggle Sidebar) · "+ Add <DocType>", or Actions ▾
//            (Export, Assign To, Apply Assignment Rule, Add Tags, Delete) while rows are ticked;
//   sidebar  Filter By (Assigned To, Created By, Edit Filters), Tags, Save Filter (collab/ListSidebar.tsx);
//   filters  the standard filters (ID, the title, the "in standard filter" fields), then Filter (the
//            builder), the clear-filters button and the sort (order ⇅ and field ▾);
//   rows     ☐ ♥ the title in bold, Status, the columns that fit the window (4 / 6 / 10, as Frappe
//            chose them by width), the ID; on the right who it is assigned to ("-" for no one), when it last
//            changed, and its comment count; a click on a value or a pill filters the list by it;
//   count    "20 of 77", "20 of 1,000+" (click: the exact count); 20 / 100 / 500 / 2500 and Load More.
//
// Its state is the address bar (Frappe's route options: "status=Pending", "name=[\"like\",\"%25x%25\"]").

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, FilterX, Heart, List, Loader2, MessageSquare, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { bulkDeleteDocsAction } from "@/app/purchase/doc-actions";
import { bulkDeleteGateEntriesAction } from "@/app/purchase/gate-entries/actions";
import { bulkDeleteMastersAction } from "@/app/purchase/masters-actions";
import { applyAssignmentRuleAction } from "@/app/purchase/collab-actions";
import { AddTagsDialog, Assignees, AssignToDialog, TagPills } from "../collab/CollabDialogs";
import { ListWithSidebar, SidebarToggleButton, useToggleSidebar } from "../collab/ListLayout";
import { ListSidebar, type GroupField, type SavedFilter } from "../collab/ListSidebar";
import { useTagsShown } from "../collab/sidebar-state";
import { cn } from "@/lib/purchase/cn";
import { isLikedByMeFilter, likedByMeFilter, NO_LIKES, type LikeInfo, type LikeKind } from "@/lib/purchase/like-rules";
import {
  docListParams, DOC_PAGE_LENGTHS, DOCSTATUS_TITLE, filtersFromDataFilter, withFilters,
  type DocFilter, type DocListQuery, type ListCell, type ListColumnView, type ListRowView, type StandardFilter,
} from "@/lib/purchase/doc/list-view";
import type { ListField, ListFilter } from "@/lib/purchase/orders/list";
import type { MasterKey } from "@/lib/purchase/routes";
import { LinkInput } from "../form/controls";
import { ConfirmDialog } from "../form/Grid";
import { LikeButton } from "../likes/LikeButton";
import { deleteInBatches } from "../list/batches";
import { MessageDialog } from "../list/BulkDialogs";
import { FilterBuilder } from "../list/FilterBuilder";
import { CHECKBOX, ListSelection, useListSelection } from "../list/selection";
import { usePopover } from "../ui/usePopover";
import { QuickEntryDialog } from "../masters/QuickEntryDialog";
import { IndicatorPill } from "./IndicatorPill";

const MASTER_KEYS: ReadonlySet<string> = new Set<MasterKey>(["suppliers", "items", "addresses", "contacts", "taxTemplates", "paymentTermsTemplates", "paymentTerms", "terms"]);

export interface DocListRow extends ListRowView {
  likes: LikeInfo;
  /** Its open assignments (the row's avatars). */
  assignees: { email: string; name: string }[];
  /** Its tags (Show Tags). */
  tags: string[];
}

/** A standard filter, with the lookup its Link searches (api/purchase/lookup). */
export interface DocListStandardFilter extends StandardFilter {
  lookup?: string | null;
}

export interface DocListProps {
  doctype: string;
  crumbs: string[];
  /** The list's path; a record opens at `${basePath}/${id}`. */
  basePath: string;
  likeKind: LikeKind;
  viewer: string;
  canLike: boolean;
  /** May the user delete these records (Actions → Delete)? */
  canDelete: boolean;
  /** "+ Add <DocType>" (absent: records are not entered here). */
  newHref?: string | null;
  /** "+ Add <DocType>" opens this master's quick entry dialog instead (the old Supplier list). */
  quickEntry?: MasterKey;
  /** The page was opened with ?new=1: the dialog opens on arrival. */
  openQuickEntry?: boolean;
  columns: ListColumnView[];
  rows: DocListRow[];
  total: number;
  countText: string;
  /** "1,000+": a click asks for the exact count. */
  estimated: boolean;
  query: DocListQuery;
  defaults: { sort: string; order: "asc" | "desc" };
  standard: DocListStandardFilter[];
  /** The filter builder's fields. */
  filterFields: ListField[];
  sortOptions: { field: string; label: string }[];
  /** The ⋯ menu's Export (the filtered list as a file), when offered. */
  exportHref?: string | null;
  /** The view switcher's views (List View, and Tree for a tree DocType); List View alone when absent. */
  views?: { label: string; href: string; active: boolean }[];
  /** The server's clock (ISO), so "time ago" reads the same on both sides. */
  now: string;
  /** The sidebar's Edit Filters fields, and the saved filters. */
  groupFields: GroupField[];
  saved: SavedFilter[];
  canGlobal: boolean;
}

export function DocList(props: DocListProps) {
  return (
    <ListSelection rows={props.rows.map((r) => ({ id: r.id, name: r.name }))}>
      <DocListBody {...props} />
    </ListSelection>
  );
}

const TYPING_DELAY_MS = 350;
/** Frappe showed a column only from a window this wide (list-view.ts). */
const FROM: Record<ListColumnView["from"], string> = {
  0: "hidden md:flex",
  1367: "hidden min-[1367px]:flex",
  1920: "hidden min-[1920px]:flex",
};

const minute = (iso: string, now: Date) => {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  const days = Math.floor(diff / 86400);
  if (Number.isNaN(days) || days < 0) return "";
  if (days === 0) return diff < 60 ? "now" : diff < 3600 ? `${Math.floor(diff / 60)} m` : `${Math.floor(diff / 3600)} h`;
  if (days < 7) return `${days} d`;
  if (days < 31) return `${Math.floor(days / 7)} w`;
  if (days < 365) return `${Math.floor(days / 30)} M`;
  return `${Math.floor(days / 365)} y`;
};

function DocListBody(p: DocListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const { chosen, isSelected, allSelected, toggle, setAll, clear } = useListSelection();
  const menu = usePopover<HTMLDivElement>();
  const actions = usePopover<HTMLDivElement>();
  const sort = usePopover<HTMLDivElement>();
  const views = usePopover<HTMLDivElement>();
  const [confirming, setConfirming] = useState(false);
  const [collab, setCollab] = useState<"assign" | "tags" | null>(null);
  const [showTags, toggleTags] = useTagsShown();
  const toggleSidebar = useToggleSidebar();
  const [deleting, setDeleting] = useState(false);
  const [messages, setMessages] = useState<string[] | null>(null);
  const now = new Date(p.now);
  const q = p.query;
  // Every old list had its "List View ▾" switcher; here it offers the views this ERP has (the Report
  // view was not rebuilt, owner 17-11-2026: docs/05 §4).
  const viewList = p.views?.length ? p.views : [{ label: "List View", href: p.basePath, active: true }];
  const [adding, setAdding] = useState(false);
  // ?new=1 (a master's "New …" from elsewhere) opens the quick entry, then leaves the address as the list's.
  useEffect(() => {
    if (!p.openQuickEntry) return;
    setAdding(true);
    const params = docListParams(q, p.defaults).toString();
    router.replace(`${pathname}${params ? `?${params}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.openQuickEntry]);

  /** Goes to the list in a new state; a new condition starts again from the first page. */
  const go = (next: Partial<DocListQuery>, keepRows = false) => {
    const state: DocListQuery = { ...q, ...next, limit: keepRows ? next.limit ?? q.limit : next.limit ?? q.pageLength };
    const params = docListParams(state, p.defaults).toString();
    startTransition(() => router.replace(`${pathname}${params ? `?${params}` : ""}`, { scroll: false }));
  };
  // Once the exact count was asked for, the old list kept counting exactly (count_upper_bound = 0).
  const setFilters = (filters: DocFilter[]) => go({ filters });
  const applyDataFilter = (spec: string | undefined) => {
    if (!spec) return;
    const add = filtersFromDataFilter(spec);
    if (add.length) setFilters(withFilters(q.filters, add));
  };

  const likedByMe = q.filters.some((f) => isLikedByMeFilter(f as ListFilter, p.viewer));
  const toggleLikedByMe = () =>
    setFilters(likedByMe ? q.filters.filter((f) => !isLikedByMeFilter(f as ListFilter, p.viewer)) : [...q.filters, likedByMeFilter(p.viewer) as DocFilter]);

  const standardNames = new Set(p.standard.map((s) => s.fieldname));
  /** The builder holds the conditions the standard filters do not show. */
  const builderFilters = q.filters.filter((f) => !(standardNames.has(f.field) && isStandardShape(f, p.standard)) && f.field !== "_liked_by");
  const anyFilter = q.filters.length > 0;
  const sortLabel = p.sortOptions.find((s) => s.field === q.sort)?.label ?? q.sort;

  const exportChosen = () => {
    const picked = p.rows.filter((r) => isSelected(r.id));
    const head = p.columns.map((c) => c.label);
    const body = picked.map((r) =>
      p.columns.map((c, i) => (c.kind === "subject" ? r.subject : c.kind === "status" ? r.indicator?.label ?? "" : c.kind === "name" ? r.name : r.cells[i]?.text ?? "")),
    );
    const cell = (v: string) => {
      let t = v;
      if (/^[=+@\t\r]/.test(t)) t = `'${t}`;
      return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = "﻿" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.doctype}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Assign To / Add Tags / Apply Assignment Rule done: the ticks cleared and the list read again. */
  const collabDone = () => {
    setCollab(null);
    clear();
    startTransition(() => router.refresh());
  };
  const applyRule = async () => {
    const r = await applyAssignmentRuleAction(p.doctype, chosen.map((c) => c.id));
    if (!r.ok) return setMessages([r.error]);
    collabDone();
  };

  const runDelete = async () => {
    setDeleting(true);
    try {
      // A Gate Entry goes through its own rules (a submitted one is cancelled first; one a receipt names stays).
      // A Buying master goes through its own (a record still linked stays, docs/09).
      const run = (batch: string[]) =>
        p.likeKind === "gateEntries" ? bulkDeleteGateEntriesAction(batch)
          : MASTER_KEYS.has(p.likeKind) ? bulkDeleteMastersAction(p.likeKind, batch)
          : bulkDeleteDocsAction(p.likeKind, batch);
      const r = await deleteInBatches(chosen.map((c) => ({ id: c.id, name: c.name })), run);
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
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-gray-500">
            {p.crumbs.join(" › ")}
          </nav>
          <div className="flex min-w-0 items-center gap-3">
            <SidebarToggleButton />
            <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">{p.doctype}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {viewList.length > 0 && (
            <div ref={views.ref} className="relative">
              <button type="button" className="po-btn-secondary" aria-haspopup="menu" aria-expanded={views.open} onClick={() => views.setOpen(!views.open)}>
                <List className="h-4 w-4" aria-hidden />
                {viewList.find((v) => v.active)?.label ?? "List View"}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              {views.open && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {viewList.map((v) => (
                    <Link key={v.label} role="menuitem" href={v.href} className={cn("block px-3 py-1.5 text-[13px] hover:bg-gray-50", v.active ? "font-semibold text-gray-900" : "text-gray-700")} onClick={() => views.setOpen(false)}>
                      {v.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="po-btn-secondary px-2" title="Refresh" aria-label="Refresh" onClick={() => startTransition(() => router.refresh())}>
            <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} aria-hidden />
          </button>
          {(
            <div ref={menu.ref} className="relative">
              <button type="button" className="po-btn-secondary px-2" title="Menu" aria-label="Menu" aria-haspopup="menu" aria-expanded={menu.open} onClick={() => menu.setOpen(!menu.open)}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
              {menu.open && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {p.exportHref && (
                    <a role="menuitem" href={p.exportHref} className="block px-3 py-1.5 text-[13px] text-gray-800 hover:bg-gray-50" onClick={() => menu.setOpen(false)}>
                      Export
                    </a>
                  )}
                  <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50" onClick={() => { menu.setOpen(false); toggleSidebar(); }}>
                    Toggle Sidebar
                  </button>
                </div>
              )}
            </div>
          )}
          {chosen.length > 0 ? (
            <div ref={actions.ref} className="relative">
              <button type="button" className="po-btn-primary" aria-haspopup="menu" aria-expanded={actions.open} disabled={deleting} onClick={() => actions.setOpen(!actions.open)}>
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Actions <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              {actions.open && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50" onClick={() => { actions.setOpen(false); exportChosen(); }}>
                    Export
                  </button>
                  {[
                    { label: "Assign To", run: () => setCollab("assign") },
                    { label: "Apply Assignment Rule", run: () => void applyRule() },
                    { label: "Add Tags", run: () => setCollab("tags") },
                  ].map((it) => (
                    <button key={it.label} type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50" onClick={() => { actions.setOpen(false); it.run(); }}>
                      {it.label}
                    </button>
                  ))}
                  {p.canDelete && (
                    <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50" onClick={() => { actions.setOpen(false); setConfirming(true); }}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : p.quickEntry ? (
            <button type="button" className="po-btn-primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add {p.doctype}
            </button>
          ) : (
            p.newHref && (
              <Link href={p.newHref} className="po-btn-primary">
                <Plus className="h-4 w-4" aria-hidden /> Add {p.doctype}
              </Link>
            )
          )}
        </div>
      </div>

      <ListWithSidebar
        sidebar={
          <ListSidebar
            doctype={p.doctype}
            search={docListParams({ ...q, limit: q.pageLength, exact: false }, p.defaults).toString()}
            groupFields={p.groupFields}
            filters={q.filters}
            onFilters={(next) => setFilters(next as DocFilter[])}
            saved={p.saved}
            canGlobal={p.canGlobal}
            viewer={p.viewer}
            showTags={showTags}
            onToggleTags={toggleTags}
          />
        }
      >
      <section className="po-card">
        {/* The filter area: standard filters left; Filter, clear, and the sort right. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {p.standard.map((s) => (
              <StandardInput key={s.fieldname} spec={s} filters={q.filters} onSet={setFilters} />
            ))}
            {pending && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Loading" />}
          </div>
          <div className="flex items-center gap-2">
            <FilterBuilder
              fields={p.filterFields}
              filters={builderFilters as ListFilter[]}
              onApply={(f) => setFilters([...q.filters.filter((x) => !builderFilters.includes(x)), ...(f as DocFilter[])])}
            />
            {/* The old filter area always showed the clear button beside Filter (filter-x-button). */}
            <button type="button" onClick={() => anyFilter && setFilters([])} className="po-btn-secondary -ml-1 px-2 py-1.5" title="Clear filters" aria-label="Clear filters">
              <FilterX className="h-4 w-4" />
            </button>
            <div ref={sort.ref} className="relative flex">
              <button
                type="button"
                onClick={() => go({ order: q.order === "desc" ? "asc" : "desc" }, true)}
                className="po-btn-secondary rounded-r-none px-2 py-1.5"
                title={q.order === "desc" ? "Descending" : "Ascending"}
                aria-label={`Sort order: ${q.order === "desc" ? "descending" : "ascending"}`}
              >
                {q.order === "desc" ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => sort.setOpen(!sort.open)} className="po-btn-secondary -ml-px rounded-l-none py-1.5" aria-expanded={sort.open}>
                {sortLabel}
              </button>
              {sort.open && (
                <div className="absolute right-0 top-full z-20 mt-2 max-h-80 w-52 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg" role="menu">
                  {p.sortOptions.map((s) => (
                    <button
                      key={s.field}
                      type="button"
                      role="menuitemradio"
                      aria-checked={s.field === q.sort}
                      onClick={() => {
                        sort.setOpen(false);
                        go({ sort: s.field }, true);
                      }}
                      className={cn("block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50", s.field === q.sort ? "font-semibold text-brand-700" : "text-gray-700")}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* The heading row. */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5 text-xs text-gray-500">
          {chosen.length > 0 ? (
            <label className="flex min-w-0 flex-[2] items-center gap-2.5 font-medium text-gray-700">
              <input type="checkbox" className={CHECKBOX} checked={allSelected} onChange={(e) => setAll(e.target.checked)} title="Select All" />
              {chosen.length} items selected
            </label>
          ) : (
            <>
              <div className="flex min-w-0 flex-[2] items-center gap-2.5">
                <input type="checkbox" className={CHECKBOX} checked={false} disabled={p.rows.length === 0} onChange={(e) => setAll(e.target.checked)} title="Select All" aria-label="Select All" />
                <button type="button" className="hidden rounded p-0.5 hover:bg-gray-100 md:inline-flex" title="Likes" aria-label="Likes" aria-pressed={likedByMe} onClick={toggleLikedByMe}>
                  <Heart className={cn("h-3.5 w-3.5", likedByMe ? "fill-[#e24c4c] text-[#e24c4c]" : "text-gray-400")} aria-hidden />
                </button>
                <span className="truncate">{p.columns[0]?.label}</span>
              </div>
              {showTags && <div className="hidden min-w-0 flex-1 md:flex" />}
              {p.columns.slice(1).map((c, i) => (
                <div key={`${c.label}-${i}`} className={cn("min-w-0 flex-1 truncate", FROM[c.from], c.numeric && "justify-end text-right")}>
                  {c.label}
                </div>
              ))}
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center justify-end md:min-w-[150px]">
            {p.estimated ? (
              <button type="button" className="hover:text-gray-800" title="The count shown is an estimated count. Click here to see the accurate count." onClick={() => go({ exact: true }, true)}>
                {p.countText}
              </button>
            ) : (
              <span>{p.countText}</span>
            )}
          </div>
        </div>

        {p.rows.map((r) => (
          <div key={r.id} className="relative flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-[13px] hover:bg-gray-50">
            <div className="flex min-w-0 flex-[2] items-center gap-2">
              <span className="relative z-10 inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={isSelected(r.id)}
                  onChange={(e) => toggle(r.id, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                  aria-label={`Select ${r.name}`}
                />
                <LikeButton kind={p.likeKind} id={r.id} likes={r.likes ?? NO_LIKES} canLike={p.canLike} className="hidden md:inline-flex" />
              </span>
              <Link href={`${p.basePath}/${encodeURIComponent(r.id)}`} className="truncate font-semibold text-gray-900 after:absolute after:inset-0" title={r.subject}>
                {r.subject}
              </Link>
            </div>
            {showTags && (
              <div className="hidden min-w-0 flex-1 md:flex">
                <TagPills tags={r.tags} />
              </div>
            )}
            {p.columns.slice(1).map((c, i) => (
              <div key={`${c.label}-${i}`} className={cn("min-w-0 flex-1 items-center", FROM[c.from], c.numeric && "justify-end text-right")}>
                {c.kind === "status" ? (
                  r.indicator ? (
                    <button type="button" className="relative z-10 max-w-full" title={DOCSTATUS_TITLE[r.docstatus] ?? undefined} onClick={() => applyDataFilter(r.indicator?.filter)}>
                      <IndicatorPill label={r.indicator.label} colour={r.indicator.colour} />
                    </button>
                  ) : null
                ) : c.kind === "name" ? (
                  <span className="block truncate text-gray-600" title={r.name}>{r.name}</span>
                ) : (
                  <CellView cell={r.cells[i + 1]} onFilter={applyDataFilter} />
                )}
              </div>
            ))}
            <div className="ml-auto flex shrink-0 items-center justify-end gap-3 text-xs text-gray-500 md:min-w-[150px]">
              {/* Who it is assigned to; with no one, the old list's empty avatar "-". A click filters by the user. */}
              {r.assignees.length ? (
                <span className="hidden md:inline-flex lg:hidden xl:inline-flex">
                  <Assignees people={r.assignees} onFilter={(email) => setFilters([...q.filters.filter((f) => f.field !== "_assign"), { field: "_assign", op: "like", value: `%${email}%` }])} />
                </span>
              ) : (
                <span className="hidden h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 md:inline-flex lg:hidden xl:inline-flex" aria-hidden>
                  -
                </span>
              )}
              <span className="hidden md:inline" title={r.modifiedTitle} suppressHydrationWarning>{minute(r.modified, now)}</span>
              <span className={cn("hidden items-center gap-1 md:inline-flex", !r.comments && "text-gray-400")} title="Comments">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                {r.comments > 99 ? "99+" : r.comments}
              </span>
              <span className="md:hidden">{r.indicator && <IndicatorPill label={r.indicator.label} colour={r.indicator.colour} />}</span>
            </div>
          </div>
        ))}

        {p.rows.length === 0 && (
          <div className="px-6 py-16 text-center text-sm text-gray-500">
            {anyFilter ? (
              <>
                No {p.doctype} found with matching filters.{" "}
                <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setFilters([])}>
                  Clear filters
                </button>{" "}
                to see all {p.doctype}.
              </>
            ) : (
              <>
                <p>No {p.doctype} found</p>
                {p.newHref && (
                  <p className="mt-3">
                    <Link href={p.newHref} className="po-btn-primary">Create a new {p.doctype}</Link>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {p.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="group" aria-label="Rows per page">
              {DOC_PAGE_LENGTHS.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => go({ pageLength: n, limit: n }, true)}
                  aria-current={q.pageLength === n ? "true" : undefined}
                  className={cn("px-3 py-1.5 font-medium", i > 0 && "border-l border-gray-300", q.pageLength === n ? "bg-brand-50 text-brand-700" : "bg-white text-gray-700 hover:bg-gray-50")}
                >
                  {n}
                </button>
              ))}
            </div>
            {p.rows.length < p.total && (
              <button type="button" className="po-btn-secondary" onClick={() => go({ limit: q.limit + q.pageLength }, true)}>
                Load More
              </button>
            )}
          </div>
        )}
      </section>
      </ListWithSidebar>
      {collab === "assign" && <AssignToDialog doctype={p.doctype} ids={chosen.map((c) => c.id)} viewer={p.viewer} onDone={collabDone} onClose={() => setCollab(null)} />}
      {collab === "tags" && <AddTagsDialog doctype={p.doctype} ids={chosen.map((c) => c.id)} onDone={collabDone} onClose={() => setCollab(null)} />}
      {confirming && (
        <ConfirmDialog
          message={chosen.length > 1 ? `Delete ${chosen.length} items permanently?` : `Delete ${chosen.length} item permanently?`}
          busy={deleting}
          onNo={() => setConfirming(false)}
          onYes={() => void runDelete()}
        />
      )}
      {messages && <MessageDialog lines={messages} onClose={() => setMessages(null)} />}
      {adding && p.quickEntry && <QuickEntryDialog master={p.quickEntry} onClose={() => setAdding(false)} />}
    </>
  );
}

/** Is this condition the one a standard filter shows (its field, with its condition)? */
function isStandardShape(f: DocFilter, standard: StandardFilter[]): boolean {
  const s = standard.find((x) => x.fieldname === f.field);
  return Boolean(s && f.op === s.condition && typeof f.value === "string");
}

function CellView({ cell, onFilter }: { cell: ListCell | null | undefined; onFilter: (spec: string | undefined) => void }) {
  if (!cell) return null;
  if (cell.kind === "percent") {
    const v = Math.max(0, Math.min(100, cell.percent ?? 0));
    return (
      <div className="h-1.5 w-full rounded-full bg-gray-200" title={cell.title}>
        <div className="h-1.5 rounded-full bg-[#98d85b]" style={{ width: `${v}%` }} />
      </div>
    );
  }
  if (cell.kind === "check") {
    return (
      <button type="button" className="relative z-10" title={cell.title} onClick={() => onFilter(cell.filter)}>
        <span aria-hidden className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[10px]", cell.text === "1" ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white")}>
          {cell.text === "1" ? "✓" : ""}
        </span>
      </button>
    );
  }
  if (cell.kind === "text") return <span className="block truncate text-gray-700" title={cell.title}>{cell.text}</span>;
  if (!cell.text) return null;
  if (cell.kind === "pill") {
    return (
      <button type="button" className="relative z-10 max-w-full" title={cell.title} onClick={() => onFilter(cell.filter)}>
        <IndicatorPill label={cell.text} colour={cell.colour ?? "gray"} />
      </button>
    );
  }
  return (
    <button type="button" className="relative z-10 block max-w-full truncate text-left text-gray-700 hover:text-gray-900" title={cell.title} onClick={() => onFilter(cell.filter)}>
      {cell.text}
    </button>
  );
}

/** A standard filter's input: text ("like"), a Link's search, a Select, a Check, a Date. */
function StandardInput({ spec, filters, onSet }: { spec: DocListStandardFilter; filters: DocFilter[]; onSet: (f: DocFilter[]) => void }) {
  const current = filters.find((f) => f.field === spec.fieldname && f.op === spec.condition && typeof f.value === "string");
  const shown = current ? String(current.value).replace(/^%(.*)%$/, "$1") : "";
  const [text, setText] = useState(shown);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setText(shown), [shown]);
  const others = filters.filter((f) => f !== current);
  const set = (v: string) => {
    if (!v) return onSet(others);
    onSet([...others, { field: spec.fieldname, op: spec.condition, value: spec.condition === "like" ? `%${v}%` : v }]);
  };
  const input = "po-field-input w-full py-1.5 sm:w-40";
  if (spec.fieldtype === "Select") {
    const options = (spec.options ?? "").split("\n");
    return (
      <select aria-label={spec.label} className={cn(input, !shown && "text-gray-400")} value={shown} onChange={(e) => set(e.target.value)}>
        <option value="">{spec.label}</option>
        {options.filter(Boolean).map((o) => (
          <option key={o} value={o} className="text-gray-900">{o}</option>
        ))}
      </select>
    );
  }
  if (spec.fieldtype === "Check") {
    return (
      <label className="inline-flex items-center gap-2 text-[13px] text-gray-700">
        <input type="checkbox" className={CHECKBOX} checked={shown === "1"} onChange={(e) => set(e.target.checked ? "1" : "")} />
        {spec.label}
      </label>
    );
  }
  if (spec.fieldtype === "Date") {
    return <input type="date" aria-label={spec.label} title={spec.label} className={input} value={shown} onChange={(e) => set(e.target.value)} />;
  }
  if (spec.fieldtype === "Link" && spec.lookup) {
    return (
      <div className="w-full sm:w-44">
        <LinkInput type={spec.lookup} value={shown || null} placeholder={spec.label} onChange={(v) => set(v ?? "")} />
      </div>
    );
  }
  return (
    <input
      aria-label={spec.label}
      placeholder={spec.label}
      className={input}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => set(v.trim()), TYPING_DELAY_MS);
      }}
    />
  );
}
