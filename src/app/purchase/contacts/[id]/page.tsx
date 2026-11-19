import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasterFooter } from "@/components/purchase/masters/MasterFooter";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { loadContact } from "@/lib/purchase/masters/contact/server";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { deleteContactAction, saveContactAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await db.purchaseContact.findUnique({ where: { id }, select: { code: true } });
  return { title: c?.code ?? "Contact" };
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate();
  const { id } = await params;
  const doc = await loadContact(id);
  if (!doc) notFound();
  return (
    <MasterScreen
      key={doc.updatedAt}
      recordId={doc.id}
      master="contacts"
      isNew={false}
      initial={doc.values}
      title={doc.code}
      indicator={doc.indicator}
      editable={purchaseCan(gate.user, "masters")}
      save={saveContactAction.bind(null, doc.id, doc.updatedAt)}
      remove={deleteContactAction.bind(null, doc.id)}
      footer={<MasterFooter created={doc.created} edited={doc.edited} viewer={gate.user!.email} />}
    />
  );
}
