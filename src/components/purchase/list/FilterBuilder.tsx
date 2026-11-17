"use client";

import { useState } from "react";
import { Filter, Plus, X } from "lucide-react";
import { cn } from "@/lib/purchase/cn";
import {
  IS_VALUES, LIST_FIELDS, OPERATORS, OPERATORS_BY_TYPE, fieldByKey, normaliseFilter, type ListFilter, type Operator,
} from "@/lib/purchase/orders/list";
import { usePopover } from "../ui/usePopover";

// The old list's filter builder ("Filter" / "N filters"): any field, ERPNext's
// operators, a value; conditions are edited here and applied together.

interface Draft {
  field: string;
  op: Operator;
  value: string;
  value2: string;
}

const defaultOp = (field: string): Operator => (fieldByKey(field)?.type === "data" ? "like" : "=");
const blank = (): Draft => ({ field: "name", op: "like", value: "", value2: "" });

function toDraft(f: ListFilter): Draft {
  const v = f.value;
  if (f.op === "between" && Array.isArray(v)) return { field: f.field, op: f.op, value: v[0], value2: v[1] };
  if (Array.isArray(v)) return { field: f.field, op: f.op, value: v.join(", "), value2: "" };
  // The builder shows "like" values without the % it adds.
  const plain = (f.op === "like" || f.op === "not like") && v.startsWith("%") && v.endsWith("%") && v.length > 1 ? v.slice(1, -1) : v;
  return { field: f.field, op: f.op, value: plain, value2: "" };
}

function fromDraft(d: Draft): ListFilter | null {
  if (d.op === "between") return normaliseFilter(d.field, d.op, [d.value, d.value2]);
  // As ERPNext does: a "like" without a wildcard matches anywhere.
  const value = (d.op === "like" || d.op === "not like") && d.value && !d.value.includes("%") ? `%${d.value}%` : d.value;
  return normaliseFilter(d.field, d.op, value);
}

function ValueInput({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const f = fieldByKey(draft.field)!;
  const input = "po-field-input py-1.5";
  if (draft.op === "is") {
    return (
      <select className={input} value={draft.value || "set"} onChange={(e) => onChange({ ...draft, value: e.target.value })}>
        {IS_VALUES.map((v) => (
          <option key={v} value={v}>
            {v === "set" ? "Set" : "Not Set"}
          </option>
        ))}
      </select>
    );
  }
  if (f.type === "select" && (draft.op === "=" || draft.op === "!=")) {
    return (
      <select className={input} value={draft.value} onChange={(e) => onChange({ ...draft, value: e.target.value })}>
        <option value="" />
        {f.options!.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  const type = f.type === "date" || f.type === "datetime" ? "date" : f.type === "number" || f.type === "percent" ? "number" : "text";
  if (draft.op === "between") {
    return (
      <div className="flex gap-1">
        <input type={type} className={input} value={draft.value} onChange={(e) => onChange({ ...draft, value: e.target.value })} aria-label="From" />
        <input type={type} className={input} value={draft.value2} onChange={(e) => onChange({ ...draft, value2: e.target.value })} aria-label="To" />
      </div>
    );
  }
  const multi = draft.op === "in" || draft.op === "not in";
  return (
    <input
      type={multi ? "text" : type}
      className={input}
      value={draft.value}
      placeholder={multi ? "values separated by commas" : f.type === "select" ? f.options!.join(", ") : ""}
      onChange={(e) => onChange({ ...draft, value: e.target.value })}
      aria-label="Value"
    />
  );
}

export function FilterBuilder({ filters, onApply }: { filters: ListFilter[]; onApply: (filters: ListFilter[]) => void }) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const openBuilder = () => {
    setDrafts(filters.length ? filters.map(toDraft) : [blank()]);
    setOpen(true);
  };
  const set = (i: number, d: Draft) => setDrafts((all) => all.map((x, j) => (j === i ? d : x)));
  const apply = (list: Draft[]) => {
    onApply(list.map(fromDraft).filter((f): f is ListFilter => f !== null));
    setOpen(false);
  };
  const label = filters.length ? `${filters.length} filter${filters.length === 1 ? "" : "s"}` : "Filter";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openBuilder())}
        className={cn("po-btn-secondary py-1.5", filters.length > 0 && "border-brand-300 bg-brand-50 text-brand-700")}
        aria-expanded={open}
      >
        <Filter className="h-4 w-4" aria-hidden />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(92vw,640px)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <div className="space-y-2">
            {drafts.map((d, i) => {
              const type = fieldByKey(d.field)!.type;
              return (
                <div key={i} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_auto] items-center gap-2">
                  <select
                    className="po-field-input py-1.5"
                    value={d.field}
                    aria-label="Field"
                    onChange={(e) => set(i, { field: e.target.value, op: defaultOp(e.target.value), value: "", value2: "" })}
                  >
                    {LIST_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="po-field-input py-1.5"
                    value={d.op}
                    aria-label="Condition"
                    onChange={(e) => set(i, { ...d, op: e.target.value as Operator, value: e.target.value === "is" ? "set" : d.value })}
                  >
                    {OPERATORS_BY_TYPE[type].map((op) => (
                      <option key={op} value={op}>
                        {OPERATORS[op]}
                      </option>
                    ))}
                  </select>
                  <ValueInput draft={d} onChange={(nd) => set(i, nd)} />
                  <button
                    type="button"
                    onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                    aria-label="Remove this filter"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <button type="button" onClick={() => setDrafts((all) => [...all, blank()])} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              <Plus className="h-4 w-4" aria-hidden />
              Add a Filter
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => apply([])} className="po-btn-secondary py-1.5">
                Clear Filters
              </button>
              <button type="button" onClick={() => apply(drafts)} className="po-btn-primary py-1.5">
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
