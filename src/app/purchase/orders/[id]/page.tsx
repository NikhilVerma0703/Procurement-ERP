import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderForm } from "@/components/purchase/form/OrderForm";
import { formMasters, loadOrderDoc } from "@/lib/purchase/orders/form-load";
import { allowedActions } from "@/lib/purchase/orders/workflow";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const o = await db.purchaseOrder.findUnique({ where: { id }, select: { number: true } });
  return { title: o?.number ?? "Purchase Order" };
}

// A PO opened from the list: the full form, with the buttons its state and
// the signed-in user's role allow (lib/purchase/orders/workflow.ts).
export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate();
  const { id } = await params;
  const doc = await loadOrderDoc(id);
  if (!doc) notFound();
  const masters = await formMasters();
  const allowed = [
    ...allowedActions(gate.user, {
      docStatus: doc.docStatus,
      workflowState: doc.workflowState,
      status: doc.status,
      perReceived: doc.perReceived,
      perBilled: doc.perBilled,
      amended: Boolean(doc.amendment),
    }),
  ];
  // Keyed by the PO's last change, so a reload after a save opens the saved PO afresh.
  return <OrderForm key={doc.updatedAt ?? doc.id} doc={doc} masters={masters} allowed={allowed} userEmail={gate.user!.email} />;
}
