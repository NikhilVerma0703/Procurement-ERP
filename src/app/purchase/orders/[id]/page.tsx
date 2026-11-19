import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComposeProvider } from "@/components/purchase/activity/compose";
import { OrderFooter } from "@/components/purchase/activity/OrderFooter";
import { OrderSidebar } from "@/components/purchase/activity/OrderSidebar";
import { OrderForm } from "@/components/purchase/form/OrderForm";
import { purchaseCan } from "@/lib/purchase/access";
import { loadOrderActivity } from "@/lib/purchase/orders/activity";
import { formMasters, loadOrderDoc } from "@/lib/purchase/orders/form-load";
import { PO_LAYOUTS } from "@/lib/purchase/pdf/layouts/index";
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
  const [masters, activity] = await Promise.all([formMasters(), loadOrderActivity(doc.id!)]);
  const user = gate.user!;
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
  // New Email, for a user who may email, on a PO that is not cancelled (Frappe: docstatus < 2).
  const canEmail = purchaseCan(user, "email") && doc.docStatus !== "Cancelled";
  // Keyed by the PO's last change, so a reload after a save opens the saved PO afresh.
  return (
    <ComposeProvider>
    <OrderForm
      key={doc.updatedAt ?? doc.id}
      doc={doc}
      masters={masters}
      allowed={allowed}
      userEmail={user.email}
      canEmail={canEmail}
      sidebar={
        activity && (
          <OrderSidebar
            orderId={doc.id!}
            attachments={activity.attachments}
            commentCount={activity.commentCount}
            created={activity.created}
            edited={activity.edited}
            canAttach={purchaseCan(user, "attach")}
          />
        )
      }
      footer={
        activity && (
          <OrderFooter
            orderId={doc.id!}
            items={activity.items}
            created={activity.created}
            edited={activity.edited}
            viewer={{ email: user.email, isAdmin: user.role === "ADMIN" }}
            canComment={purchaseCan(user, "comment")}
            compose={canEmail ? { orderId: doc.id!, defaults: activity.compose, attachments: activity.attachments, layouts: Object.keys(PO_LAYOUTS) } : undefined}
          />
        )
      }
    />
    </ComposeProvider>
  );
}
