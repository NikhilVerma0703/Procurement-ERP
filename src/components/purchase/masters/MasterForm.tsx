"use client";

// The form of a master record (Supplier, Item, Address, Contact, the
// templates), drawn from its layout (lib/purchase/masters/spec.ts) as Frappe
// drew a doctype's form:
//   * the breadcrumb, the title (the record's name, "New Supplier" before its
//     first save), an indicator ("Not Saved" while changed, else the screen's
//     own: Disabled, On Hold…), Save, and ⋯ (Reload, New, Delete);
//   * tabs, sections in columns, each field's control, child tables;
//   * Ctrl+S saves; leaving with changes asks first.
// The server action re-checks and writes; its refusal is shown beside the
// field it names, or as a toast.
import { Loader2, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckInput, DateInput, Field, LinkInput, NumberInput, ReadOnly, Section, SelectInput, TextArea, TextInput } from "@/components/purchase/form/controls";
import { ConfirmDialog, Grid } from "@/components/purchase/form/Grid";
import { HtmlEditor } from "@/components/purchase/form/HtmlEditor";
import { usePopover } from "@/components/purchase/ui/usePopover";
import { addressLines } from "@/lib/purchase/address";
import { cn } from "@/lib/purchase/cn";
import { isReadOnly, isRequired, isShown, newRow, type FieldSpec, type MasterSpec, type Row, type SectionSpec, type Value, type Values } from "@/lib/purchase/masters/spec";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";

export interface MasterFormProps {
  spec: MasterSpec;
  initial: Values;
  isNew: boolean;
  /** The heading: the record's name, or "New Supplier". */
  title: string;
  /** Buying › Supplier. */
  crumbs: { label: string; href?: string }[];
  /** The record's own indicator when it is saved and unchanged. */
  indicator?: { label: string; colour: "green" | "red" | "orange" | "gray" | "blue" } | null;
  /** May the user change it? */
  editable: boolean;
  /** Saves; a notice is a line Frappe showed after the save ("GST Category updated to …"). */
  onSave: (values: Values) => Promise<ActionResult<{ id: string; notices?: string[] }>>;
  /** Where a saved record lives (to open a new one after its first save). */
  recordHref: (id: string) => string;
  newHref?: string;
  onDelete?: () => Promise<ActionResult>;
  listHref: string;
  /** Content drawn in place of a section's fields, by its slot name. */
  slots?: Record<string, ReactNode>;
  /** Below the tabs (who created and edited it). */
  footer?: ReactNode;
  /** A field changed → the values the screen fetches or sets with it (its triggers and fetch_from). */
  onFieldChange?: (name: string, value: Value | Row[], values: Values, before: Values) => Promise<Partial<Values> | null | void> | Partial<Values> | null | void;
  /** Where a new record's first save goes, when not to the record (back to the supplier it was made from). */
  afterCreateHref?: (id: string) => string;
  /** More items for ⋯ (Rename, …). */
  menu?: { label: string; run: () => void; danger?: boolean }[];
  /** Buttons beside Save (Edit Full Form). */
  actions?: ReactNode;
  /** The values as they change, for a screen that switches layouts (quick entry → full form). */
  onValues?: (v: Values) => void;
  /** Frappe's form intro: a line above the form ("This Item is a Variant of …"). */
  intro?: ReactNode;
}

const PILL: Record<string, string> = {
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  orange: "bg-orange-50 text-orange-700",
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-50 text-blue-700",
};

let keySeq = 0;
const nextKey = () => `new-${++keySeq}`;

/**
 * A master form's values and errors, and the setter its controls call: it clears the field's
 * error and runs the screen's trigger, whose result is applied only while the field still holds
 * the value it ran for.
 */
export function useMasterValues(initial: Values, onFieldChange?: MasterFormProps["onFieldChange"]) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const latest = useRef(values);
  latest.current = values;
  const trigger = useRef(onFieldChange);
  trigger.current = onFieldChange;
  const set = useCallback((name: string, v: Value | Row[]) => {
    setValues((old) => ({ ...old, [name]: v }));
    setErrors((e) => {
      if (!e[name]) return e;
      const { [name]: _, ...rest } = e;
      return rest;
    });
    const run = trigger.current;
    if (!run) return;
    void Promise.resolve(run(name, v, { ...latest.current, [name]: v }, latest.current))
      .then((patch) => {
        // Still holding it: the same value, or a table set again with the same rows (a link
        // control may report its pick twice).
        const same = (x: Value | Row[] | undefined) => x === v || JSON.stringify(x) === JSON.stringify(v);
        if (patch && Object.keys(patch).length) setValues((old) => (same(old[name]) ? { ...old, ...(patch as Values) } : old));
      })
      .catch(() => toast.error("Could not fetch the details for this field. Check your connection and try again."));
  }, []);
  return { values, errors, setErrors, set, latest };
}

export function MasterForm(p: MasterFormProps) {
  const router = useRouter();
  const { values, errors, setErrors, set, latest } = useMasterValues(p.initial, p.onFieldChange);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tabs = p.spec.tabs.filter((t) => isShown(t, values, p.isNew));
  const [tab, setTabState] = useState(tabs[0]?.label ?? "");
  // The open tab outlives a save (the page reloads the record), as Frappe's form stayed on it.
  const pathname = usePathname();
  const tabKey = `po-tab:${pathname}`;
  const setTab = useCallback(
    (label: string) => {
      setTabState(label);
      try {
        sessionStorage.setItem(tabKey, label);
      } catch {
        /* storage blocked: the tab simply resets after a save */
      }
    },
    [tabKey],
  );
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(tabKey);
      if (saved && p.spec.tabs.some((t) => t.label === saved)) setTabState(saved);
    } catch {
      /* storage blocked */
    }
  }, [tabKey, p.spec.tabs]);
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(p.initial), [values, p.initial]);

  const onValues = useRef(p.onValues);
  onValues.current = p.onValues;
  useEffect(() => onValues.current?.(values), [values]);

  const save = useCallback(async () => {
    if (busy || !p.editable) return;
    setBusy(true);
    try {
      const r = await p.onSave(latest.current);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        // Open the tab of the first field the save refused.
        const first = Object.keys(r.fieldErrors ?? {})[0]?.split(".")[0];
        const owner = first && p.spec.tabs.find((t) => t.sections.some((s) => s.columns.flat().includes(first)));
        if (owner) setTab(owner.label);
        return;
      }
      setErrors({});
      toast.success("Saved");
      for (const n of r.value.notices ?? []) toast.info(n);
      if (p.isNew) router.replace(p.afterCreateHref?.(r.value.id) ?? p.recordHref(r.value.id));
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, p, router]);

  // Ctrl+S saves, as in Frappe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (p.isNew || dirty) void save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dirty, p.isNew, save]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const indicator = p.isNew || dirty ? { label: "Not Saved", colour: "orange" as const } : p.indicator;
  const shownTab = tabs.find((t) => t.label === tab) ?? tabs[0];

  return (
    <div>
      <div className="mb-4">
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-gray-500">
          {p.crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>›</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-gray-800">
                  {c.label}
                </Link>
              ) : (
                <span className={i === p.crumbs.length - 1 ? "text-gray-700" : undefined}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">{p.title}</h1>
            {indicator && (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", PILL[indicator.colour])}>
                <span aria-hidden>•</span>
                {indicator.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <MoreMenu
              items={[
                !p.isNew && { label: "Reload", run: () => router.refresh() },
                p.newHref && p.editable && { label: `New ${p.spec.doctype}`, run: () => router.push(p.newHref!) },
                ...(p.menu ?? []),
                !p.isNew && p.onDelete && p.editable && { label: "Delete", run: () => setConfirmDelete(true), danger: true },
              ]}
            />
            {p.actions}
            {p.editable && (p.isNew || dirty) && (
              <button type="button" className="po-btn-primary" disabled={busy} onClick={() => void save()}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Save
              </button>
            )}
          </div>
        </div>
      </div>

      {p.intro && <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-4 py-2.5 text-[13px] text-blue-900">{p.intro}</div>}
      <div className="po-card">
        {tabs.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-3 sm:px-4" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={shownTab?.label === t.label}
                className={cn("whitespace-nowrap border-b-2 px-2.5 py-3 text-[13px]", shownTab?.label === t.label ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800")}
                onClick={() => setTab(t.label)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {tabs.map((t) => (
          <div key={t.label} hidden={shownTab?.label !== t.label}>
            <SectionsView spec={p.spec} sections={t.sections} values={values} isNew={p.isNew} editable={p.editable && !busy} errors={errors} set={set} slots={p.slots} />
          </div>
        ))}
      </div>
      {p.footer}
      {confirmDelete && p.onDelete && (
        <ConfirmDialog
          message={`Permanently delete ${p.title}?`}
          busy={busy}
          onNo={() => setConfirmDelete(false)}
          onYes={async () => {
            setBusy(true);
            try {
              const r = await p.onDelete!();
              if (!r.ok) toast.error(r.error);
              else {
                toast.success("Deleted");
                router.push(p.listHref);
              }
            } finally {
              setBusy(false);
              setConfirmDelete(false);
            }
          }}
        />
      )}
    </div>
  );
}

/** A tab's sections: each a box of field columns (or the screen's own content), as Frappe laid them out. */
export function SectionsView({ spec, sections, values, isNew, editable, errors, set, slots }: {
  spec: MasterSpec;
  sections: SectionSpec[];
  values: Values;
  isNew: boolean;
  editable: boolean;
  errors: Record<string, string>;
  set: (name: string, v: Value | Row[]) => void;
  slots?: Record<string, ReactNode>;
}) {
  return (
    <>
      {sections.filter((s) => isShown(s, values, isNew)).map((s, i) => (
        <Section key={i} title={s.label} collapsible={s.collapsible} defaultOpen={!s.collapsible || sectionHasValue(spec, s.columns, values)}>
          {s.slot ? (
            (slots?.[s.slot] ?? null)
          ) : (
            <div className={cn("grid gap-x-6 gap-y-3", s.columns.length > 1 && "md:grid-cols-2", s.columns.length > 2 && "lg:grid-cols-3")}>
              {s.columns.map((col, ci) => (
                <div key={ci} className="space-y-3">
                  {col.map((name) => (
                    <FieldOrTable key={name} name={name} spec={spec} values={values} isNew={isNew} editable={editable} errors={errors} set={set} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Section>
      ))}
    </>
  );
}

/** Does a collapsible section hold a value? (Frappe opened those.) */
function sectionHasValue(spec: MasterSpec, columns: string[][], v: Values): boolean {
  return columns.flat().some((n) => {
    const x = v[n];
    if (Array.isArray(x)) return x.length > 0;
    return x !== null && x !== undefined && x !== "" && x !== false && x !== 0 && !(spec.fields[n]?.kind === "check" && !x);
  });
}

function FieldOrTable({ name, spec, values, isNew, editable, errors, set }: {
  name: string;
  spec: MasterSpec;
  values: Values;
  isNew: boolean;
  editable: boolean;
  errors: Record<string, string>;
  set: (name: string, v: Value | Row[]) => void;
}) {
  const f = spec.fields[name];
  if (f) {
    if (!isShown(f, values, isNew)) return null;
    return <FieldControl f={f} value={values[name] as Value} values={values} isNew={isNew} disabled={!editable || isReadOnly(f, values, isNew)} error={errors[name]} onChange={(v) => set(name, v)} />;
  }
  const t = spec.tables?.[name];
  if (!t || !isShown(t, values, isNew)) return null;
  const rows = (values[name] as Row[] | undefined) ?? [];
  const tableEditable = editable && !isReadOnly(t, values, isNew);
  const update = (i: number, col: string, v: Value) => set(name, rows.map((r, j) => (j === i ? { ...r, [col]: v } : r)));
  return (
    <div className="md:col-span-2">
      <Grid<Row>
        label={t.label}
        rows={rows}
        editable={tableEditable}
        onAdd={() => set(name, [...rows, newRow(t, nextKey())])}
        onDelete={(indices) => set(name, rows.filter((_, i) => !indices.includes(i)))}
        rowError={(i) => Object.keys(errors).some((k) => k.startsWith(`${name}.${i}.`))}
        columns={t.columns.map((c) => ({
          key: c.name,
          label: c.label,
          required: isRequired(c, values, isNew),
          width: c.width,
          align: c.kind === "float" || c.kind === "int" || c.kind === "currency" ? "right" : "left",
          cell: (row: Row, i: number) => (
            <FieldControl bare f={c} value={row[c.name]} values={{ ...values, ...row }} isNew={isNew} disabled={!tableEditable || isReadOnly(c, { ...values, ...row }, isNew)} error={errors[`${name}.${i}.${c.name}`]} onChange={(v) => update(i, c.name, v)} />
          ),
        }))}
      />
      {errors[name] && <p className="mt-1 text-[11px] text-red-600">{errors[name]}</p>}
    </div>
  );
}

function FieldControl({ f, value, values, isNew, disabled, error, onChange, bare }: {
  f: FieldSpec;
  value: Value | undefined;
  values: Values;
  isNew: boolean;
  disabled: boolean;
  error?: string;
  onChange: (v: Value) => void;
  /** In a grid cell: no label. */
  bare?: boolean;
}) {
  const str = value === null || value === undefined ? "" : String(value);
  let control: ReactNode;
  switch (f.kind) {
    case "check":
      control = <CheckInput label={bare ? "" : <span className={cn(f.bold && "font-semibold")}>{f.label}</span>} checked={Boolean(value)} disabled={disabled} onChange={onChange} />;
      return bare ? control : <div>{control}{error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}</div>;
    case "select":
      control = <SelectInput value={str} options={(f.options ?? []).filter((o) => o !== "")} blank={(f.options ?? []).includes("")} disabled={disabled} error={error} onChange={(v) => onChange(v ?? "")} />;
      break;
    case "link":
      {
        const type = f.linkOf ? f.linkOf(values) : (f.link ?? null);
        control = disabled || !type ? <ReadOnly value={str} /> : <LinkInput key={type} type={type} value={str || null} params={f.linkParams?.(values) ?? undefined} error={error} onChange={(v) => onChange(v ?? "")} />;
      }
      break;
    case "date":
      control = <DateInput value={str || null} disabled={disabled} error={error} onChange={(v) => onChange(v ?? "")} />;
      break;
    case "int":
    case "float":
    case "currency":
      control = <NumberInput value={typeof value === "number" ? value : value === null || value === undefined || value === "" ? null : Number(value)} decimals={f.kind === "int" ? 0 : (f.decimals ?? (f.kind === "currency" ? 2 : 3))} trim={f.kind !== "currency"} disabled={disabled} error={error} onChange={(v) => onChange(v)} />;
      break;
    case "text":
      control = disabled ? <ReadOnly value={str} multiline /> : <TextArea value={str} onChange={onChange} />;
      break;
    case "editor":
      control = <HtmlEditor value={str} onChange={onChange} disabled={disabled} label={f.label} minHeightClass="min-h-[140px]" />;
      break;
    case "readonly":
      // A stored address text (lines joined by <br>, as ERPNext rendered it) shows as its lines.
      control = <ReadOnly value={/<br\s*\/?>/i.test(str) ? addressLines(str).join("\n") : str} multiline />;
      break;
    case "autocomplete":
      control = <Autocomplete value={str} options={f.suggestions?.(values) ?? []} disabled={disabled} error={error} onChange={onChange} />;
      break;
    default:
      control = <TextInput value={str} disabled={disabled} error={error} onChange={onChange} />;
  }
  if (bare) return control;
  return (
    <Field label={f.label} required={isRequired(f, values, isNew)} error={error} description={f.description}>
      {control}
    </Field>
  );
}

/** Free text with the field's suggestions (Frappe's Autocomplete). */
function Autocomplete({ value, options, disabled, error, onChange }: { value: string; options: readonly string[]; disabled: boolean; error?: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <>
      <TextInput value={value} disabled={disabled} error={error} onChange={onChange} list={options.length ? id : undefined} />
      {options.length > 0 && (
        <datalist id={id}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  );
}

function MoreMenu({ items }: { items: (false | null | undefined | "" | { label: string; run: () => void; danger?: boolean })[] }) {
  const list = items.filter(Boolean) as { label: string; run: () => void; danger?: boolean }[];
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  if (!list.length) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" className="po-btn-secondary px-2.5" aria-label="More actions" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white py-1 text-[13px] shadow-lg" role="menu">
          {list.map((i) => (
            <li key={i.label}>
              <button
                type="button"
                role="menuitem"
                className={cn("block w-full px-3 py-1.5 text-left hover:bg-gray-50", i.danger ? "text-red-600" : "text-gray-700")}
                onClick={() => {
                  setOpen(false);
                  i.run();
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

