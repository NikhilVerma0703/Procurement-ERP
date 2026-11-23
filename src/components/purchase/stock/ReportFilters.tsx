"use client";

// A stock report's filter bar (Phase II, owner 21-11-2026): the old query reports' row of filters,
// each change re-running the report (the address changes; the page reads it). Links search the
// module's lookup API, as the PO form's do.

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DateInput, Field, LinkInput, TextInput } from "@/components/purchase/form/controls";

export type ReportFilterField =
  | { name: string; label: string; kind: "link"; lookup: string; required?: boolean; params?: Record<string, string> }
  | { name: string; label: string; kind: "date"; required?: boolean }
  | { name: string; label: string; kind: "data" };

export function ReportFilters({ fields, values }: { fields: readonly ReportFilterField[]; values: Record<string, string | null> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const set = (name: string, v: string | null) => {
    const next = new URLSearchParams();
    for (const f of fields) {
      const val = f.name === name ? v : values[f.name];
      if (val) next.set(f.name, val);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className="po-report-filters grid grid-cols-2 gap-3 border-b border-gray-200 p-3 sm:grid-cols-3 lg:grid-cols-6" aria-busy={pending}>
      {fields.map((f) => (
        <Field key={f.name} label={f.label} required={"required" in f && f.required}>
          {f.kind === "link" ? (
            <LinkInput type={f.lookup} value={values[f.name]} params={f.params} placeholder={f.label} onChange={(v) => set(f.name, v)} />
          ) : f.kind === "date" ? (
            <DateInput value={values[f.name]} onChange={(v) => v && set(f.name, v)} />
          ) : (
            <DataFilter value={values[f.name]} placeholder={f.label} onCommit={(v) => set(f.name, v)} />
          )}
        </Field>
      ))}
    </div>
  );
}

/** A Data filter: typed freely, applied when left (as Frappe's filters apply on change). */
function DataFilter({ value, placeholder, onCommit }: { value: string | null; placeholder: string; onCommit: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? "");
  const commit = () => {
    const v = text.trim() || null;
    if (v !== (value ?? null)) onCommit(v);
  };
  return (
    <div onKeyDown={(e) => e.key === "Enter" && commit()}>
      <TextInput value={text} placeholder={placeholder} onChange={setText} onBlur={commit} />
    </div>
  );
}
