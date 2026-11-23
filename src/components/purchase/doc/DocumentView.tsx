// A document's form, read-only, drawn exactly as the old site's form (Phase II, owner 21-11-2026).
// What shows — tabs, sections, columns, fields, grids, labels — is lib/purchase/doc/visible.ts
// (the captured layout, its conditions, Frappe's read-only rules); this draws it in the old form's
// look: the label above a light-grey value, a checkbox beside its label, grids with "No.". Server
// component; the tab strip is the only client part.

import Link from "next/link";
import type { ReactNode } from "react";
import { Field, ReadOnly, Section } from "@/components/purchase/form/controls";
import type { DoctypeLayout, LayoutField } from "@/lib/purchase/doc/layout";
import { displayValue } from "@/lib/purchase/doc/values";
import { cellShown, HTML_TYPES, TEXT_TYPES, visibleForm, type FormRules, type Row, type ShownField } from "@/lib/purchase/doc/visible";
import { sanitizeHtml } from "@/lib/purchase/html";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import { FormTabs } from "./FormTabs";

export interface ViewOptions extends FormRules {
  /** The document's currency (Currency fields show its symbol). */
  currency?: string | null;
  /** Where a value opens, when that record has a page here. `table` is the child table's fieldname. */
  href?: (table: string | null, f: LayoutField, value: string, row: Row) => string | null;
  /** Content for a tab the layout leaves empty (Connections), by its label. */
  tabContent?: Record<string, ReactNode>;
  /** The title a link shows instead of the name (DocTypes with "show title in link"). */
  linkTitle?: (table: string | null, f: LayoutField, value: string) => string | undefined;
}

/** Long text that is itself HTML (a tax break-up table) renders as it is; plain text keeps its lines. */
const asHtml = (v: string) => (/<[a-z][\s\S]*>/i.test(v) ? v : v.replace(/\n/g, "<br>"));

const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);

function Value({ s, doc, o }: { s: ShownField; doc: Row; o: ViewOptions }) {
  const f = s.field;
  if (HTML_TYPES.has(f.fieldtype)) {
    return <div className="po-html rounded-md bg-[#f4f5f6] px-3 py-2 text-[13px] text-gray-800" dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(s.value), { tables: true }) }} />;
  }
  if (TEXT_TYPES.has(f.fieldtype)) {
    return <ReadOnly value={<span dangerouslySetInnerHTML={{ __html: sanitizeHtml(asHtml(String(s.value)), { tables: true }) }} />} multiline />;
  }
  const link = typeof s.value === "string" && (f.fieldtype === "Link" || f.fieldtype === "Dynamic Link");
  const text = (link && o.linkTitle?.(null, f, s.value as string)) || displayValue(f, s.value, o.currency ?? "INR");
  const href = link ? o.href?.(null, f, s.value as string, doc) : null;
  return (
    <ReadOnly
      value={href ? <Link href={href} className="hover:underline">{text}</Link> : text}
      align={NUMERIC.has(f.fieldtype) ? "right" : "left"}
      className={f.bold ? "font-semibold" : undefined}
    />
  );
}

function Grid({ s, doc, o }: { s: ShownField; doc: Row; o: ViewOptions }) {
  const g = s.grid!;
  return (
    <div className="col-span-full">
      <div className="mb-1 text-xs text-gray-600">{s.label}</div>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              <th className="w-12 border-b border-gray-200 px-2 py-2 font-medium">No.</th>
              {g.columns.map(({ field: c, label }) => (
                <th key={c.fieldname} className={`border-b border-gray-200 px-2 py-2 font-medium ${NUMERIC.has(c.fieldtype) ? "text-right" : ""}`}>
                  {label}
                  {c.reqd && <span className="ml-0.5 text-red-500">*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r, i) => (
              <tr key={String(r.name ?? i)} className="border-b border-gray-100 last:border-b-0">
                <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                {g.columns.map(({ field: c }) => {
                  const v = r[c.fieldname];
                  const on = cellShown(c, r, doc);
                  const text = !on ? "" : c.fieldtype === "Check" ? (v ? "✓" : "") : displayValue(c, v, o.currency ?? "INR");
                  const href = on && typeof v === "string" && c.fieldtype === "Link" ? o.href?.(s.field.fieldname, c, v, r) : null;
                  return (
                    <td key={c.fieldname} className={`px-2 py-1.5 ${NUMERIC.has(c.fieldtype) ? "text-right tabular-nums" : ""} ${c.bold || c.fieldname === "item_code" ? "font-semibold" : ""}`}>
                      {href ? <Link href={href} className="hover:underline">{text}</Link> : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldView({ s, doc, o }: { s: ShownField; doc: Row; o: ViewOptions }) {
  if (s.grid) return <Grid s={s} doc={doc} o={o} />;
  if (s.field.fieldtype === "Heading") return <h4 className="text-[13px] font-semibold text-gray-800">{s.label}</h4>;
  if (s.field.fieldtype === "Check") {
    return (
      <div className="flex items-center gap-2 py-1 text-[13px] text-gray-700">
        <span aria-hidden className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[10px] ${s.value ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white"}`}>
          {s.value ? "✓" : ""}
        </span>
        <span>{s.label}</span>
      </div>
    );
  }
  return (
    <Field label={s.label} required={s.field.reqd}>
      <Value s={s} doc={doc} o={o} />
    </Field>
  );
}

export function DocumentView({ layout, doc, options = {} }: { layout: DoctypeLayout; doc: Row; options?: ViewOptions }) {
  const tabs = visibleForm(layout, doc, options, LAYOUTS)
    .map((t) => {
      const extra = options.tabContent?.[t.label];
      if (!t.sections.length && !extra) return null;
      return {
        label: t.label,
        content: (
          <div>
            {extra /* a tab's own content (the Connections dashboard) comes first, as Frappe drew it */}
            {t.sections.map((s, i) => {
              const wide = s.columns.length === 1 && s.columns[0].some((f) => f.grid);
              return (
                <Section key={`${s.label ?? ""}-${i}`} title={s.label ?? undefined} collapsible={s.collapsible} defaultOpen={s.open}>
                  <div className={`grid gap-x-6 gap-y-3 ${s.columns.length >= 3 ? "md:grid-cols-3" : s.columns.length === 2 ? "md:grid-cols-2" : ""}`}>
                    {s.columns.map((c, j) => (
                      <div key={j} className={`flex min-w-0 flex-col gap-3 ${wide ? "md:col-span-full" : ""}`}>
                        {c.map((f) => <FieldView key={f.field.fieldname} s={f} doc={doc} o={options} />)}
                      </div>
                    ))}
                  </div>
                </Section>
              );
            })}
          </div>
        ),
      };
    })
    .filter((t): t is { label: string; content: React.JSX.Element } => t !== null);
  return <FormTabs tabs={tabs} />;
}
