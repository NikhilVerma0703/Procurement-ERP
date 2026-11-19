import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasterFooter } from "@/components/purchase/masters/MasterFooter";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { loadPaymentTerm } from "@/lib/purchase/masters/templates/server";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { deletePaymentTermAction, savePaymentTermAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await db.purchasePaymentTerm.findUnique({ where: { id }, select: { code: true } });
  return { title: t?.code ?? "Payment Term" };
}

export default async function PaymentTermPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate();
  const { id } = await params;
  const doc = await loadPaymentTerm(id);
  if (!doc) notFound();
  return (
    <MasterScreen
      key={doc.updatedAt}
      recordId={doc.id}
      master="paymentTerms"
      isNew={false}
      initial={doc.values}
      title={doc.title}
      indicator={doc.indicator}
      editable={purchaseCan(gate.user, "masters")}
      save={savePaymentTermAction.bind(null, doc.id, doc.updatedAt)}
      remove={deletePaymentTermAction.bind(null, doc.id)}
      footer={<MasterFooter created={doc.created} edited={doc.edited} viewer={gate.user!.email} />}
    />
  );
}
