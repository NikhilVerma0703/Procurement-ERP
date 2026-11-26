import type { Metadata } from "next";
import Link from "next/link";
import { GateEntryForm } from "@/components/purchase/stock/GateEntryForm";
import { layoutInFy } from "@/lib/purchase/doc/fy-layout";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { GATE_ENTRY, GATE_ENTRY_CHILDREN } from "@/lib/purchase/stock/gate-entry-meta";
import { amendDoc, blankGateEntry } from "@/lib/purchase/stock/gate-entry-save";

// A new Gate Entry (the list's "+ Add Gate Entry", the search box's "New Gate Entry"), or the
// amendment of a cancelled one (its Amend: ?amend=<id>). Nothing is stored until Save.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New Gate Entry" };

export default async function NewGateEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const sp = await searchParams;
  const amend = typeof sp.amend === "string" ? sp.amend : null;
  const made = amend ? await amendDoc(amend) : null;
  return (
    <>
      {made && !made.ok && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {made.error} <Link href={PURCHASE_PATHS.gateEntries} className="underline">Back to the list</Link>
        </div>
      )}
      <GateEntryForm
        id={null}
        initial={made?.ok ? made.doc : blankGateEntry()}
        modified={null}
        docStatus="DRAFT"
        amendFrom={made?.ok ? amend : null}
        layout={layoutInFy(LAYOUTS[GATE_ENTRY])}
        childLayouts={GATE_ENTRY_CHILDREN}
        links={{ order: null, supplier: null, receipt: null, items: {} }}
      />
    </>
  );
}
