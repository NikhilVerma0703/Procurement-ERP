"use client";

// A document's form, editable, drawn exactly as the old site's form (Phase II, owner 21-11-2026):
// the same tabs, sections, columns, labels and grids as the read-only DocumentView (the captured
// layout and lib/purchase/doc/visible.ts), with an input wherever the user may type — what the
// caller's `editable` allows: a draft's fields that are not read only, a submitted document's
// "allow on submit" ones. Frappe's edit-mode rule: an editable field shows even when empty, a
// read-only one only with a value. A grid shows its in-list-view columns; a row's pencil opens the
// row's own form with all its fields, as Frappe's grid row editor did.
//
// Generic: the document's behaviour (what a change fetches or recomputes) belongs to the caller's
// `binding` (e.g. stock/ReceiptForm.tsx), as the old site's form scripts belonged to each DocType.

import Link from "next/link";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CheckInput, DateInput, Field, LinkInput, NumberInput, ReadOnly, Section, SelectInput, TextArea, TextInput } from "@/components/purchase/form/controls";
import { HtmlEditor } from "@/components/purchase/form/HtmlEditor";
import { cn } from "@/lib/purchase/cn";
import type { DoctypeLayout, LayoutField } from "@/lib/purchase/doc/layout";
import { displayValue } from "@/lib/purchase/doc/values";
import { cellShown, HTML_TYPES, TEXT_TYPES, visibleForm, type ChildLayouts, type FormRules, type Row, type ShownField } from "@/lib/purchase/doc/visible";
import { sanitizeHtml } from "@/lib/purchase/html";
import { FormTabs } from "./FormTabs";

export interface LookupSpec {
  /** The lookup route's type (api/purchase/lookup). */
  type: string;
  params?: Record<string, string | null | undefined>;
}

export interface FormBinding {
  /** May the user type in this field? `table` is the child table's fieldname (null for the document). */
  editable: (table: string | null, f: LayoutField, row?: Row) => boolean;
  /** What a Link field searches (its set_query), from the document and the row. Null: free text. */
  lookup?: (table: string | null, f: LayoutField, row?: Row) => LookupSpec | null;
  setField: (fieldname: string, value: unknown) => void;
  setCell: (table: string, index: number, fieldname: string, value: unknown) => void;
  addRow?: (table: string) => void;
  deleteRows?: (table: string, indexes: number[]) => void;
  /** Messages by field: "fieldname", or "table.index.fieldname" for a row's. */
  errors?: Record<string, string>;
}

export interface FormOptions extends FormRules {
  /** The document's currency (Currency fields show its symbol). */
  currency?: string | null;
  href?: (table: string | null, f: LayoutField, value: string, row: Row) => string | null;
  tabContent?: Record<string, ReactNode>;
  linkTitle?: (table: string | null, f: LayoutField, value: string) => string | undefined;
}

const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);
const asHtml = (v: string) => (/<[a-z][\s\S]*>/i.test(v) ? v : v.replace(/\n/g, "<br>"));
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const numberOf = (v: unknown) => (typeof v === "number" ? v : v === null || v === undefined || v === "" ? 0 : Number(v) || 0);

/** A field's value shown read-only, as DocumentView shows it. */
function ReadValue({ f, value, row, table, o }: { f: LayoutField; value: unknown; row: Row; table: string | null; o: FormOptions }) {
  if (HTML_TYPES.has(f.fieldtype)) {
    return <div className="po-html rounded-md bg-[#f4f5f6] px-3 py-2 text-[13px] text-gray-800" dangerouslySetInnerHTML={{ __html: sanitizeHtml(str(value), { tables: true }) }} />;
  }
  if (TEXT_TYPES.has(f.fieldtype)) {
    return <ReadOnly value={<span dangerouslySetInnerHTML={{ __html: sanitizeHtml(asHtml(str(value)), { tables: true }) }} />} multiline />;
  }
  const link = typeof value === "string" && value !== "" && (f.fieldtype === "Link" || f.fieldtype === "Dynamic Link");
  const text = (link && o.linkTitle?.(table, f, value as string)) || displayValue(f, value, o.currency ?? "INR");
  const href = link ? o.href?.(table, f, value as string, row) : null;
  return (
    <ReadOnly
      value={href ? <Link href={href} className="hover:underline">{text}</Link> : text || " "}
      align={NUMERIC.has(f.fieldtype) ? "right" : "left"}
      className={f.bold ? "font-semibold" : undefined}
    />
  );
}

/** The input for one field, by its type (Frappe's controls). */
function Control({ f, value, onChange, lookup, error }: {
  f: LayoutField;
  value: unknown;
  onChange: (v: unknown) => void;
  lookup: LookupSpec | null;
  error?: string;
}) {
  switch (f.fieldtype) {
    case "Link":
      return lookup ? (
        <LinkInput type={lookup.type} params={lookup.params} value={str(value) || null} onChange={(v) => onChange(v ?? "")} error={error} />
      ) : (
        <TextInput value={str(value)} onChange={onChange} error={error} />
      );
    case "Select": {
      const options = (f.options ?? "").split("\n");
      const blank = options.includes("");
      return <SelectInput value={str(value) || null} options={options.filter((o) => o !== "")} blank={blank} onChange={(v) => onChange(v ?? "")} error={error} />;
    }
    case "Date":
      return <DateInput value={str(value) || null} onChange={(v) => onChange(v ?? "")} error={error} />;
    case "Int":
      return <NumberInput value={numberOf(value)} decimals={0} onChange={onChange} error={error} />;
    case "Float":
    case "Percent":
      return <NumberInput value={numberOf(value)} decimals={f.precision ? Number(f.precision) : 3} onChange={onChange} error={error} />;
    case "Currency":
      return <NumberInput value={numberOf(value)} decimals={3} trim={false} onChange={onChange} error={error} />;
    case "Small Text":
    case "Text":
    case "Long Text":
    case "Code":
      return <TextArea value={str(value)} onChange={onChange} rows={f.fieldtype === "Small Text" ? 3 : 5} />;
    case "Text Editor":
    case "HTML Editor":
      return <HtmlEditor value={str(value)} onChange={onChange} label={f.label ?? f.fieldname} minHeightClass="min-h-[120px]" />;
    default:
      return <TextInput value={str(value)} onChange={onChange} error={error} />;
  }
}

function FieldBlock({ f, label, value, row, table, editable, onChange, lookup, error, o }: {
  f: LayoutField;
  label: string;
  value: unknown;
  row: Row;
  table: string | null;
  editable: boolean;
  onChange: (v: unknown) => void;
  lookup: LookupSpec | null;
  error?: string;
  o: FormOptions;
}) {
  if (f.fieldtype === "Heading") return <h4 className="text-[13px] font-semibold text-gray-800">{label}</h4>;
  if (f.fieldtype === "Check") {
    return <CheckInput label={label} checked={Boolean(numberOf(value))} disabled={!editable} onChange={(v) => onChange(v ? 1 : 0)} />;
  }
  return (
    <Field label={label} required={f.reqd} error={error} description={editable ? f.description : undefined}>
      {editable ? <Control f={f} value={value} onChange={onChange} lookup={lookup} error={error} /> : <ReadValue f={f} value={value} row={row} table={table} o={o} />}
    </Field>
  );
}

/** One section list (a tab's content, or a row editor's), as the read-only form lays it out. */
function Sections({ tab, doc, table, rowIndex, binding, o, childLayouts }: {
  tab: ReturnType<typeof visibleForm>[number];
  doc: Row;
  table: string | null;
  rowIndex: number | null;
  binding: FormBinding;
  o: FormOptions;
  childLayouts: ChildLayouts;
}) {
  const set = (fieldname: string, v: unknown) => (table === null ? binding.setField(fieldname, v) : binding.setCell(table, rowIndex!, fieldname, v));
  const errorOf = (fieldname: string) => binding.errors?.[table === null ? fieldname : `${table}.${rowIndex}.${fieldname}`];
  return (
    <>
      {tab.sections.map((s, i) => {
        const wide = s.columns.length === 1 && s.columns[0].some((f) => f.grid);
        return (
          <Section key={`${s.label ?? ""}-${i}`} title={s.label ?? undefined} collapsible={s.collapsible} defaultOpen={s.open}>
            <div className={`grid gap-x-6 gap-y-3 ${s.columns.length >= 3 ? "md:grid-cols-3" : s.columns.length === 2 ? "md:grid-cols-2" : ""}`}>
              {s.columns.map((c, j) => (
                <div key={j} className={`flex min-w-0 flex-col gap-3 ${wide ? "md:col-span-full" : ""}`}>
                  {c.map((sf) =>
                    sf.grid && table === null ? (
                      <EditGrid key={sf.field.fieldname} s={sf} doc={doc} binding={binding} o={o} childLayouts={childLayouts} />
                    ) : (
                      <FieldBlock
                        key={sf.field.fieldname}
                        f={sf.field}
                        label={sf.label}
                        value={doc[sf.field.fieldname]}
                        row={doc}
                        table={table}
                        editable={binding.editable(table, sf.field, table === null ? undefined : doc)}
                        onChange={(v) => set(sf.field.fieldname, v)}
                        lookup={binding.lookup?.(table, sf.field, table === null ? undefined : doc) ?? null}
                        error={errorOf(sf.field.fieldname)}
                        o={o}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </Section>
        );
      })}
    </>
  );
}

/** A child table: its in-list-view columns, typed in place; the pencil opens the whole row. */
function EditGrid({ s, doc, binding, o, childLayouts }: { s: ShownField; doc: Row; binding: FormBinding; o: FormOptions; childLayouts: ChildLayouts }) {
  const g = s.grid!;
  const table = s.field.fieldname;
  const rows = Array.isArray(doc[table]) ? (doc[table] as Row[]) : [];
  const canEdit = binding.editable(null, s.field);
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setSelected((sel) => sel.filter((i) => i < rows.length)), [rows.length]);
  const childLayout = childLayouts[s.field.options ?? ""];
  return (
    <div className="col-span-full">
      <div className="mb-1 text-xs text-gray-600">
        {s.label}
        {s.field.reqd && <span className="ml-0.5 text-red-500">*</span>}
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              {canEdit && (
                <th className="w-8 border-b border-gray-200 px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    className="h-3.5 w-3.5 accent-gray-800"
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={(e) => setSelected(e.target.checked ? rows.map((_, i) => i) : [])}
                  />
                </th>
              )}
              <th className="w-12 border-b border-gray-200 px-2 py-2 font-medium">No.</th>
              {g.columns.map(({ field: c, label }) => (
                <th key={c.fieldname} className={`border-b border-gray-200 px-2 py-2 font-medium ${NUMERIC.has(c.fieldtype) ? "text-right" : ""}`}>
                  {label}
                  {c.reqd && <span className="ml-0.5 text-red-500">*</span>}
                </th>
              ))}
              <th className="w-8 border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={g.columns.length + 3} className="px-2 py-6 text-center text-gray-400">No Data</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={String(r.name ?? i)} className="border-b border-gray-100 align-top last:border-b-0">
                {canEdit && (
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Select row ${i + 1}`}
                      className="h-3.5 w-3.5 accent-gray-800"
                      checked={selected.includes(i)}
                      onChange={(e) => setSelected((sel) => (e.target.checked ? [...sel, i] : sel.filter((x) => x !== i)))}
                    />
                  </td>
                )}
                <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                {g.columns.map(({ field: c, label }) => {
                  const on = cellShown(c, r, doc);
                  const editable = on && binding.editable(table, c, r);
                  const v = r[c.fieldname];
                  const error = binding.errors?.[`${table}.${i}.${c.fieldname}`];
                  if (editable) {
                    return (
                      <td key={c.fieldname} className="po-grid-cell min-w-[110px] px-1 py-1" aria-label={`${label} (row ${i + 1})`}>
                        {c.fieldtype === "Check" ? (
                          <CheckInput label="" checked={Boolean(numberOf(v))} onChange={(x) => binding.setCell(table, i, c.fieldname, x ? 1 : 0)} />
                        ) : (
                          <Control f={c} value={v} onChange={(x) => binding.setCell(table, i, c.fieldname, x)} lookup={binding.lookup?.(table, c, r) ?? null} error={error} />
                        )}
                      </td>
                    );
                  }
                  const text = !on ? "" : c.fieldtype === "Check" ? (v ? "✓" : "") : (typeof v === "string" && c.fieldtype === "Link" && o.linkTitle?.(table, c, v)) || displayValue(c, v, o.currency ?? "INR");
                  const href = on && typeof v === "string" && v && c.fieldtype === "Link" ? o.href?.(table, c, v, r) : null;
                  return (
                    <td key={c.fieldname} className={cn("px-2 py-1.5", NUMERIC.has(c.fieldtype) && "text-right tabular-nums", (c.bold || c.fieldname === "item_code") && "font-semibold", error && "text-red-600")}>
                      {href ? <Link href={href} className="hover:underline">{text}</Link> : text}
                    </td>
                  );
                })}
                <td className="px-1 py-1.5 text-right">
                  {childLayout && (
                    <button type="button" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Edit" aria-label={`Edit row ${i + 1}`} onClick={() => setOpen(i)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (binding.addRow || binding.deleteRows) && (
        <div className="mt-2 flex gap-2">
          {selected.length > 0 && binding.deleteRows && (
            <button
              type="button"
              className="po-btn-secondary inline-flex items-center gap-1 text-xs text-red-600"
              onClick={() => {
                binding.deleteRows!(table, [...selected].sort((a, b) => a - b));
                setSelected([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {binding.addRow && (
            <button type="button" className="po-btn-secondary inline-flex items-center gap-1 text-xs" onClick={() => binding.addRow!(table)}>
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          )}
        </div>
      )}
      {open !== null && open < rows.length && childLayout && (
        <RowEditor
          title={`Editing Row #${open + 1}`}
          layout={childLayout}
          row={rows[open]}
          parent={doc}
          table={table}
          index={open}
          binding={binding}
          o={o}
          onClose={() => setOpen(null)}
          onMove={(d) => setOpen((x) => (x === null ? x : Math.min(rows.length - 1, Math.max(0, x + d))))}
        />
      )}
    </div>
  );
}

/** A grid row's own form (all its fields, sections and conditions), over the page. */
function RowEditor({ title, layout, row, parent, table, index, binding, o, onClose, onMove }: {
  title: string;
  layout: DoctypeLayout;
  row: Row;
  parent: Row;
  table: string;
  index: number;
  binding: FormBinding;
  o: FormOptions;
  onClose: () => void;
  onMove: (delta: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.ctrlKey && e.key === "ArrowDown") onMove(1);
      if (e.ctrlKey && e.key === "ArrowUp") onMove(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onMove]);
  const tabs = visibleForm(layout, row, { ...o, parent, editable: (_t, f) => binding.editable(table, f, row) }, {});
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {tabs.map((t) => (
          <Sections key={t.label} tab={t} doc={row} table={table} rowIndex={index} binding={binding} o={o} childLayouts={{}} />
        ))}
        <div className="flex justify-between border-t border-gray-200 px-5 py-3 text-xs text-gray-500">
          <span>Ctrl + Up / Down: previous / next row</span>
          <button type="button" className="po-btn-secondary text-xs" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function DocumentForm({ layout, childLayouts, doc, binding, options = {} }: {
  layout: DoctypeLayout;
  childLayouts: ChildLayouts;
  doc: Row;
  binding: FormBinding;
  options?: FormOptions;
}) {
  const shown = visibleForm(layout, doc, { ...options, editable: (t, f) => binding.editable(t, f) }, childLayouts);
  const tabs = shown
    .map((t) => {
      const extra = options.tabContent?.[t.label];
      // Frappe 14 hid a tab only when its own condition hid it (tab.js), not for having nothing to show —
      // the old Stock Entry shows its empty Supplier Info and Accounting Dimensions tabs. The Connections
      // tab is the dashboard: shown with its content.
      if (!t.sections.length && !extra && t.label === "Connections") return null;
      return {
        label: t.label,
        content: (
          <div>
            {extra}
            <Sections tab={t} doc={doc} table={null} rowIndex={null} binding={binding} o={options} childLayouts={childLayouts} />
          </div>
        ),
      };
    })
    .filter((t): t is { label: string; content: React.JSX.Element } => t !== null);
  return <FormTabs tabs={tabs} />;
}
