"use client";

// The tab strip of a document's form (Details, Address & Contact, Terms, More Info, Connections…),
// as the old ERPNext form drew it. Phase II, owner 21-11-2026. The panels are rendered on the
// server; this only switches between them.

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/purchase/cn";

export function FormTabs({ tabs }: { tabs: { label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  if (tabs.length === 1) return <>{tabs[0].content}</>;
  return (
    <div>
      <div className="flex gap-6 overflow-x-auto border-b border-gray-200 px-4 sm:px-5" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 py-3 text-[13px] transition",
              i === active ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={i !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
