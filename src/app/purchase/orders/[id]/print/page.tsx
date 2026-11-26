import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintScreen } from "@/components/purchase/print/PrintScreen";
import { DEFAULT_PO_PRINT_FORMAT, PO_FORMAT_NAMES } from "@/lib/purchase/print/po-formats";
import { orderPath, PURCHASE_API_ROOT } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const o = await db.purchaseOrder.findUnique({ where: { id }, select: { number: true } });
  return { title: o ? `${o.number} · Print` : "Print" };
}

// A PO's print view, as the old form's printer icon opened it (owner, 26-11-2026: "Clicking this icon displays
// a Print Format dropdown … add every missing print format"): the PO in any of its twelve formats — PDF PO
// (the old default), Standard, and the ten others, each run from its own template (lib/purchase/print/
// po-print.ts) — with Full Page, Refresh, the form, PDF (the browser's print to PDF of this very page) and Print.
export default async function PurchaseOrderPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  await purchasePageGate();
  const { id } = await params;
  const { format } = await searchParams;
  const o = await db.purchaseOrder.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!o) notFound();
  return (
    <PrintScreen
      pageBase={`${PURCHASE_API_ROOT}/orders/${encodeURIComponent(o.id)}/print`}
      formats={PO_FORMAT_NAMES}
      initial={format && PO_FORMAT_NAMES.includes(format) ? format : DEFAULT_PO_PRINT_FORMAT}
      formHref={orderPath(o.id)}
      crumbs={["Buying", "Purchase Order", o.number]}
      title={o.number}
    />
  );
}
