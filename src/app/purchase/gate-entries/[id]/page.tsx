import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderFooter } from "@/components/purchase/activity/OrderFooter";
import { GateEntryForm } from "@/components/purchase/stock/GateEntryForm";
import { loadDocActivity } from "@/lib/purchase/doc/activity";
import { layoutInFy } from "@/lib/purchase/doc/fy-layout";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { adjacentGateEntries, loadGateEntryDoc } from "@/lib/purchase/stock/gate-entries";
import { GATE_ENTRY, GATE_ENTRY_CHILDREN } from "@/lib/purchase/stock/gate-entry-meta";

// One Gate Entry, laid out as the old form (its captured definition): editable while a draft,
// read-only once submitted or cancelled, with the buttons of its state (components/purchase/stock/
// GateEntryForm.tsx) and its timeline below (the old one's comments and emails came across).

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const g = await db.purchaseGateEntry.findUnique({ where: { id }, select: { number: true } });
  return { title: g?.number ?? "Gate Entry" };
}

export default async function GateEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate("stock");
  const { id } = await params;
  const loaded = await loadGateEntryDoc(db, id);
  if (!loaded) notFound();
  const { entry, doc, ids, amendment } = loaded;
  const [{ prev, next }, activity] = await Promise.all([adjacentGateEntries(db, id), loadDocActivity(GATE_ENTRY, entry.number, entry)]);
  return (
    <>
    <GateEntryForm
      key={String(doc.modified ?? "")}
      id={entry.id}
      initial={doc}
      modified={String(doc.modified ?? "")}
      docStatus={entry.docStatus}
      layout={layoutInFy(LAYOUTS[GATE_ENTRY])}
      childLayouts={GATE_ENTRY_CHILDREN}
      links={{ order: ids.order, supplier: ids.supplier, receipt: ids.receipt, items: Object.fromEntries(ids.items) }}
      prev={prev}
      next={next}
      amended={Boolean(amendment)}
    />
    {/* The old form's timeline, below it (as the receipt page draws its own). */}
    <OrderFooter
      orderId={entry.id}
      items={activity.items}
      created={activity.created}
      edited={activity.edited}
      viewer={{ email: gate.user?.email ?? "", isAdmin: gate.tier === "ADMIN" }}
      canComment={false}
    />
    </>
  );
}
