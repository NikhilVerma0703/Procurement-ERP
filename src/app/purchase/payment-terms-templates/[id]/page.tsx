import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasterFooter } from "@/components/purchase/masters/MasterFooter";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { loadPaymentTermsTemplate } from "@/lib/purchase/masters/templates/server";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { deletePaymentTermsTemplateAction, savePaymentTermsTemplateAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await db.purchasePaymentTermsTemplate.findUnique({ where: { id }, select: { code: true } });
  return { title: t?.code ?? "Payment Terms Template" };
}

export default async function PaymentTermsTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate();
  const { id } = await params;
  const doc = await loadPaymentTermsTemplate(id);
  if (!doc) notFound();
  return (
    <MasterScreen
      key={doc.updatedAt}
      recordId={doc.id}
      master="paymentTermsTemplates"
      isNew={false}
      initial={doc.values}
      title={doc.title}
      indicator={doc.indicator}
      editable={purchaseCan(gate.user, "masters")}
      save={savePaymentTermsTemplateAction.bind(null, doc.id, doc.updatedAt)}
      remove={deletePaymentTermsTemplateAction.bind(null, doc.id)}
      footer={<MasterFooter created={doc.created} edited={doc.edited} viewer={gate.user!.email} />}
    />
  );
}
