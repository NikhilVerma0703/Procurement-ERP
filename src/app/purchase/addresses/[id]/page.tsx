import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasterFooter } from "@/components/purchase/masters/MasterFooter";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { loadAddress } from "@/lib/purchase/masters/address/server";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { deleteAddressAction, saveAddressAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = await db.purchaseAddress.findUnique({ where: { id }, select: { code: true } });
  return { title: a?.code ?? "Address" };
}

export default async function AddressPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate();
  const { id } = await params;
  const doc = await loadAddress(id);
  if (!doc) notFound();
  return (
    <MasterScreen
      key={doc.updatedAt}
      recordId={doc.id}
      master="addresses"
      isNew={false}
      initial={doc.values}
      title={doc.code}
      indicator={doc.indicator}
      editable={purchaseCan(gate.user, "masters")}
      save={saveAddressAction.bind(null, doc.id, doc.updatedAt)}
      remove={deleteAddressAction.bind(null, doc.id)}
      footer={<MasterFooter created={doc.created} edited={doc.edited} viewer={gate.user!.email} />}
    />
  );
}
