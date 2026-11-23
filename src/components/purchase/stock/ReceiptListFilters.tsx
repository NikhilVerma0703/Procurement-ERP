"use client";

// The Purchase Receipt list's standard filters, as the old list showed them above its rows: ID,
// Title, Company, Status (Phase II, owner 21-11-2026). A change re-runs the list (the address
// changes; the page reads it), back on its first page.

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LinkInput, TextInput } from "@/components/purchase/form/controls";

export interface ReceiptFilterValues {
  name: string | null;
  title: string | null;
  company: string | null;
  status: string | null;
  page_length: string | null;
}

function Typed({ value, placeholder, onCommit }: { value: string | null; placeholder: string; onCommit: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? "");
  const commit = () => {
    const v = text.trim() || null;
    if (v !== (value ?? null)) onCommit(v);
  };
  return (
    <div onKeyDown={(e) => e.key === "Enter" && commit()} className="w-40">
      <TextInput value={text} placeholder={placeholder} onChange={setText} onBlur={commit} />
    </div>
  );
}

export function ReceiptListFilters({ values, statuses }: { values: ReceiptFilterValues; statuses: readonly string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const set = (key: keyof ReceiptFilterValues, v: string | null) => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...values, [key]: v })) if (val) next.set(k, val);
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3" aria-busy={pending}>
      <Typed value={values.name} placeholder="ID" onCommit={(v) => set("name", v)} />
      <Typed value={values.title} placeholder="Title" onCommit={(v) => set("title", v)} />
      <div className="w-52">
        <LinkInput type="company" value={values.company} placeholder="Company" onChange={(v) => set("company", v)} />
      </div>
      <select
        aria-label="Status"
        className="po-input w-40 rounded-md border border-transparent bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] text-gray-900"
        value={values.status ?? ""}
        onChange={(e) => set("status", e.target.value || null)}
      >
        <option value="">Status</option>
        {statuses.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
