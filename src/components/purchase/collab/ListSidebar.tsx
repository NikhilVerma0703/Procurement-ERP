"use client";

// The list sidebar of the old site (Frappe 14.101.1, list_sidebar.html; owner, 26-11-2026: "Build all of them"),
// top to bottom:
//   Filter By   Assigned To ⇕ · Created By ⇕ · a dropdown for each field Edit Filters added · "Edit Filters"
//               Each dropdown counts the list's records by the field (under the list's other conditions),
//               with a Search box; a click filters the list by that value, a second click on the ticked one
//               takes the filter off (list_sidebar_group_by.js).
//   Tags ⇕      each tag with its count, then "No Tags"; a click filters by it. "Show Tags" / "Hide Tags"
//               shows each row's tags (list_view.js toggle_tags).
//   Save Filter a name, Enter saves the list's conditions under it ("Press Enter to save", "Duplicate Filter
//               Name"; "Is Global" for those who manage the module); the saved ones below, "Hide Saved" /
//               "Show Saved"; a click applies one, its × removes it after a confirm (list_filter.js).
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { toast } from "sonner";
import { deleteSavedFilterAction, groupByCountsAction, saveFilterAction, tagStatsAction } from "@/app/purchase/collab-actions";
import { cn } from "@/lib/purchase/cn";
import { ConfirmDialog } from "../form/Grid";
import { Modal } from "../list/BulkDialogs";
import { usePopover } from "../ui/usePopover";
import { useGroupByFields } from "./sidebar-state";

export interface SidebarFilter {
  field: string;
  op: string;
  value: string | string[];
}

export interface GroupField {
  fieldname: string;
  label: string;
  fieldtype: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
}

export interface ListSidebarProps {
  doctype: string;
  /** The list's address-bar query (its conditions), for the counts. */
  search: string;
  /** The fields Edit Filters offers (Select, Link, Data, Int and Check fields, as Frappe offered). */
  groupFields: GroupField[];
  /** The conditions in force. */
  filters: SidebarFilter[];
  onFilters: (next: SidebarFilter[]) => void;
  saved: SavedFilter[];
  canGlobal: boolean;
  viewer: string;
  showTags: boolean;
  onToggleTags: () => void;
}

const BTN = "flex w-full items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-[13px] text-gray-800 shadow-sm hover:bg-gray-50";
const ACTION = "block px-1 py-1 text-left text-[12px] text-brand-700 hover:underline";

const without = (filters: SidebarFilter[], field: string) => filters.filter((f) => f.field !== field);
const valueOf = (f: SidebarFilter | undefined) => (f ? String(Array.isArray(f.value) ? f.value[0] ?? "" : f.value).replace(/^%|%$/g, "") : null);

export function ListSidebar(p: ListSidebarProps) {
  const [extra, saveExtra] = useGroupByFields(p.doctype);
  const [editing, setEditing] = useState(false);
  const fields = useMemo(() => {
    const known = new Map(p.groupFields.map((f) => [f.fieldname, f]));
    return [
      { fieldname: "assigned_to", label: "Assigned To", fieldtype: "" },
      { fieldname: "owner", label: "Created By", fieldtype: "" },
      ...extra.flatMap((f) => (known.has(f) ? [known.get(f)!] : [])),
    ];
  }, [extra, p.groupFields]);

  /** apply_filter: "" → "is not set", Assigned To → like %user%, else "=". A ticked value only comes off. */
  const pick = (fieldname: string, value: string | null, selected: boolean) => {
    const field = fieldname === "assigned_to" ? "_assign" : fieldname;
    const rest = without(p.filters, field);
    if (selected) return p.onFilters(rest);
    const f: SidebarFilter = value === null || value === "" ? { field, op: "is", value: "not set" } : field === "_assign" ? { field, op: "like", value: `%${value}%` } : { field, op: "=", value };
    p.onFilters([...rest, f]);
  };

  return (
    <aside className="w-full space-y-5 text-[13px]" aria-label="List sidebar">
      <section>
        <h3 className="mb-2 px-1 text-xs font-medium text-gray-500">Filter By</h3>
        <div className="space-y-2">
          {fields.map((f) => (
            <GroupByDropdown
              key={f.fieldname}
              doctype={p.doctype}
              search={p.search}
              field={f}
              viewer={p.viewer}
              selected={valueOf(p.filters.find((x) => x.field === (f.fieldname === "assigned_to" ? "_assign" : f.fieldname)))}
              onPick={pick}
            />
          ))}
        </div>
        <button type="button" className={ACTION} onClick={() => setEditing(true)}>
          Edit Filters
        </button>
      </section>

      <section>
        <TagsDropdown
          doctype={p.doctype}
          search={p.search}
          onPick={(tag) => {
            const rest = without(p.filters, "_user_tags");
            p.onFilters([...rest, tag === "No Tags" ? { field: "_user_tags", op: "not like", value: "%,%" } : { field: "_user_tags", op: "like", value: `%${tag}%` }]);
          }}
        />
        <button type="button" className={ACTION} onClick={p.onToggleTags}>
          {p.showTags ? "Hide Tags" : "Show Tags"}
        </button>
      </section>

      <SaveFilter doctype={p.doctype} filters={p.filters} onFilters={p.onFilters} saved={p.saved} canGlobal={p.canGlobal} />

      {editing && (
        <SelectFiltersDialog
          doctype={p.doctype}
          fields={p.groupFields}
          chosen={extra}
          onSave={(next) => {
            saveExtra(next);
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </aside>
  );
}

type Count = { name: string | null; count: number };

function GroupByDropdown({ doctype, search, field, viewer, selected, onPick }: {
  doctype: string;
  search: string;
  field: GroupField;
  viewer: string;
  selected: string | null;
  onPick: (field: string, value: string | null, selected: boolean) => void;
}) {
  const pop = usePopover<HTMLDivElement>();
  const [rows, setRows] = useState<Count[] | null>(null);
  const [q, setQ] = useState("");
  const open = async () => {
    if (pop.open) return pop.setOpen(false);
    pop.setOpen(true);
    setRows(null);
    setQ("");
    const r = await groupByCountsAction(doctype, field.fieldname, search);
    setRows(r.ok ? r.value : []);
    if (!r.ok) toast.error(r.error);
  };
  const label = (c: Count) => (c.name === null ? "Not Set" : c.name === viewer ? "Me" : field.fieldtype === "Check" ? (c.name === "0" ? "No" : "Yes") : c.name);
  const isSelected = (c: Count) => selected !== null && (c.name ?? "") === selected;
  const shown = (rows ?? []).filter((c) => !q || (c.name ?? "").toLowerCase().includes(q.toLowerCase()) || label(c).toLowerCase().includes(q.toLowerCase()));
  const ordered = [...shown.filter(isSelected), ...shown.filter((c) => !isSelected(c))];
  return (
    <div ref={pop.ref} className="relative">
      <button type="button" className={BTN} aria-haspopup="menu" aria-expanded={pop.open} onClick={() => void open()}>
        <span className="truncate">{field.label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
      </button>
      {pop.open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-60 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {rows === null ? (
            <div className="px-3 py-2 text-xs text-gray-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">No filters found</div>
          ) : (
            <>
              <div className="px-2 pb-1">
                <input type="text" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs" autoFocus />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {ordered.map((c) => (
                  <button
                    key={c.name ?? "\u0000"}
                    type="button"
                    role="menuitem"
                    className={cn("flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[13px] hover:bg-gray-50", isSelected(c) && "font-medium")}
                    onClick={() => {
                      pop.setOpen(false);
                      onPick(field.fieldname, c.name, isSelected(c));
                    }}
                  >
                    {isSelected(c) && <Check className="h-3 w-3 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate" title={c.name ?? undefined}>{label(c)}</span>
                    <span className="shrink-0 text-gray-500">{c.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TagsDropdown({ doctype, search, onPick }: { doctype: string; search: string; onPick: (tag: string) => void }) {
  const pop = usePopover<HTMLDivElement>();
  const [rows, setRows] = useState<[string, number][] | null>(null);
  const [q, setQ] = useState("");
  const open = async () => {
    if (pop.open) return pop.setOpen(false);
    pop.setOpen(true);
    setRows(null);
    setQ("");
    const r = await tagStatsAction(doctype, search);
    setRows(r.ok ? r.value : []);
    if (!r.ok) toast.error(r.error);
  };
  const shown = (rows ?? []).filter(([t]) => !q || t.toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={pop.ref} className="relative">
      <button type="button" className={BTN} aria-haspopup="menu" aria-expanded={pop.open} onClick={() => void open()}>
        <span className="truncate">Tags</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
      </button>
      {pop.open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-60 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="px-2 pb-1">
            <input type="text" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs" autoFocus />
          </div>
          {rows === null ? (
            <div className="px-3 py-2 text-xs text-gray-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">No records tagged.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {shown.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[13px] hover:bg-gray-50"
                  onClick={() => {
                    pop.setOpen(false);
                    onPick(tag);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{tag}</span>
                  <span className="shrink-0 text-gray-500">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Edit Filters: "Select Filters", the DocType's fields in two columns, a Search, Save. */
function SelectFiltersDialog({ doctype, fields, chosen, onSave, onClose }: { doctype: string; fields: GroupField[]; chosen: string[]; onSave: (f: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState(() => new Set(chosen));
  const [q, setQ] = useState("");
  const sorted = useMemo(() => [...fields].sort((a, b) => a.label.localeCompare(b.label)), [fields]);
  const shown = sorted.filter((f) => !q || f.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal
      title="Select Filters"
      onClose={onClose}
      footer={
        <button type="button" className="po-btn-primary" onClick={() => onSave(sorted.filter((f) => picked.has(f.fieldname)).map((f) => f.fieldname))}>
          Save
        </button>
      }
    >
      <input type="text" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px]" />
      <div className="mb-2 text-xs text-gray-500">{doctype}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {shown.map((f) => (
          <label key={f.fieldname} className="flex items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-gray-300"
              checked={picked.has(f.fieldname)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(f.fieldname);
                else next.delete(f.fieldname);
                setPicked(next);
              }}
            />
            <span className="truncate">{f.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function SaveFilter({ doctype, filters, onFilters, saved, canGlobal }: { doctype: string; filters: SidebarFilter[]; onFilters: (f: SidebarFilter[]) => void; saved: SavedFilter[]; canGlobal: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [global, setGlobal] = useState(false);
  const [showSaved, setShowSaved] = useState(true);
  const [applied, setApplied] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SavedFilter | null>(null);
  const busy = useRef(false);
  const duplicate = saved.some((s) => s.name === name.trim());

  const save = async () => {
    const n = name.trim();
    if (!n || duplicate || busy.current) return;
    busy.current = true;
    try {
      const r = await saveFilterAction(doctype, n, JSON.stringify(filters.map((f) => [f.field, f.op, f.value])), global);
      if (!r.ok) return void toast.error(r.error);
      setName("");
      setGlobal(false);
      setShowSaved(true);
      startTransition(() => router.refresh());
    } finally {
      busy.current = false;
    }
  };
  const apply = (s: SavedFilter) => {
    setApplied(s.id);
    try {
      const raw = JSON.parse(s.query) as unknown;
      const list = Array.isArray(raw) ? raw.filter((x): x is [string, string, string | string[]] => Array.isArray(x) && x.length === 3) : [];
      onFilters(list.map(([field, op, value]) => ({ field: String(field), op: String(op), value })));
    } catch {
      onFilters([]);
    }
  };

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-medium text-gray-500">Save Filter</h3>
      <input
        type="text"
        placeholder="Filter Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
        className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] placeholder:text-gray-400"
        maxLength={140}
      />
      {name.trim() && <p className="mt-1 px-1 text-[11px] text-gray-500">{duplicate ? "Duplicate Filter Name" : "Press Enter to save"}</p>}
      {canGlobal && name.trim() && (
        <label className="mt-1 flex items-center gap-2 px-1 text-[12px] text-gray-700">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
          Is Global
        </label>
      )}
      {saved.length > 0 && (
        <>
          <button type="button" className={ACTION} onClick={() => setShowSaved(!showSaved)}>
            {showSaved ? "Hide Saved" : "Show Saved"}
          </button>
          {showSaved && (
            <div className="mt-1 space-y-1.5">
              {saved.map((s) => (
                <div key={s.id} className={cn("flex items-center justify-between gap-1 rounded-md border px-2.5 py-1 text-[13px]", applied === s.id ? "border-brand-100 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-800")}>
                  <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => apply(s)} title={s.name}>
                    {s.name}
                  </button>
                  <button type="button" className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s)}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {removing && (
        <ConfirmDialog
          message={
            <>
              Are you sure you want to remove the <b>{removing.name}</b> filter?
            </>
          }
          onNo={() => setRemoving(null)}
          onYes={async () => {
            const s = removing;
            setRemoving(null);
            const r = await deleteSavedFilterAction(doctype, s.id);
            if (!r.ok) return void toast.error(r.error);
            // remove_filters: the saved filter's conditions come off the list too.
            if (applied === s.id) setApplied(null);
            try {
              const raw = JSON.parse(s.query) as unknown;
              const fieldsOf = new Set(Array.isArray(raw) ? raw.map((x) => (Array.isArray(x) ? String(x[0]) : "")) : []);
              if (fieldsOf.size) onFilters(filters.filter((f) => !fieldsOf.has(f.field)));
            } catch {
              /* nothing to take off */
            }
            startTransition(() => router.refresh());
          }}
        />
      )}
    </section>
  );
}
