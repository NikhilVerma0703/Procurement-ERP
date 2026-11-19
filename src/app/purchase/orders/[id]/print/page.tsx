import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { PrintView } from "@/components/purchase/print/PrintView";
import { DEFAULT_PO_LAYOUT, PO_LAYOUTS, isPoLayout } from "@/lib/purchase/pdf/layouts/index";
import { orderPath } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const o = await db.purchaseOrder.findUnique({ where: { id }, select: { number: true } });
  return { title: o ? `${o.number} · Print` : "Print" };
}

// A PO's print view (the old form's printer icon): the sheet in a chosen layout, PDF and Print.
export default async function PurchaseOrderPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  await purchasePageGate();
  const { id } = await params;
  const { format } = await searchParams;
  const o = await db.purchaseOrder.findUnique({ where: { id }, select: { id: true, number: true, supplierName: true } });
  if (!o) notFound();
  return (
    <>
      <PageHeader
        crumbs={["Buying", "Purchase Order", o.number]}
        title={o.number}
        actions={
          <Link href={orderPath(o.id)} className="po-btn-secondary">
            Back to {o.supplierName}
          </Link>
        }
      />
      <PrintView id={o.id} layouts={Object.keys(PO_LAYOUTS)} initial={isPoLayout(format) ? format : DEFAULT_PO_LAYOUT} />
    </>
  );
}
