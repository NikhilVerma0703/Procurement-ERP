"use client";

// The Gate Entry list's filter bar: its one standard filter, ID (Frappe's "name like %…%"), applied a
// moment after typing stops, from the first page again.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

export function GateEntryListFilters({ name }: { name: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(name ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setValue(name ?? ""), [name]);

  const apply = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (v.trim()) p.set("name", v.trim());
      else p.delete("name");
      p.delete("limit");
      startTransition(() => router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false }));
    }, 350);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
      <input
        aria-label="ID"
        placeholder="ID"
        className="po-field-input w-full py-1.5 sm:w-44"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          apply(e.target.value);
        }}
      />
      {pending && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Loading" />}
    </div>
  );
}
