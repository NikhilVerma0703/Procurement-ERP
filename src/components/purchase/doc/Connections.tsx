// A document's Connections tab, drawn as Frappe's form dashboard (Phase II, owner 21-11-2026): the
// groups side by side, each linked DocType with a count badge when documents link to this one. A
// link opens the one linked document when there is exactly one and it has a page here.

import Link from "next/link";
import type { ConnectionGroup } from "@/lib/purchase/stock/connections";

export function Connections({ groups }: { groups: ConnectionGroup[] }) {
  return (
    <section className="border-b border-gray-200 px-4 py-4 sm:px-5">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{g.label}</div>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((i) => (
                <li key={i.doctype} className="flex items-center gap-2 text-[13px]">
                  {i.count > 0 && (
                    <span className="min-w-[1.25rem] rounded-full bg-gray-800 px-1.5 text-center text-[11px] font-medium leading-5 text-white">{i.count}</span>
                  )}
                  {i.href ? (
                    <Link href={i.href} className="text-gray-900 hover:underline">{i.doctype}</Link>
                  ) : (
                    <span className={i.count > 0 ? "text-gray-900" : "text-gray-500"}>{i.doctype}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
