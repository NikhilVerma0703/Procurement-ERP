import type { Metadata } from "next";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { newPaymentTermValues } from "@/lib/purchase/masters/templates/spec";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { savePaymentTermAction } from "../actions";

export const metadata: Metadata = { title: "New Payment Term" };
export const dynamic = "force-dynamic";

export default async function NewPaymentTermPage() {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Payment Term" title="New Payment Term" message="You do not have permission to create a Payment Term." back={PURCHASE_PATHS.paymentTerms} />;
  }
  return <MasterScreen master="paymentTerms" isNew initial={newPaymentTermValues()} title="New Payment Term" editable save={savePaymentTermAction.bind(null, null, null)} />;
}
