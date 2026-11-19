import type { Metadata } from "next";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { newPaymentTermsTemplateValues } from "@/lib/purchase/masters/templates/spec";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { savePaymentTermsTemplateAction } from "../actions";

export const metadata: Metadata = { title: "New Payment Terms Template" };
export const dynamic = "force-dynamic";

export default async function NewPaymentTermsTemplatePage() {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Payment Terms Template" title="New Payment Terms Template" message="You do not have permission to create a Payment Terms Template." back={PURCHASE_PATHS.paymentTermsTemplates} />;
  }
  return <MasterScreen master="paymentTermsTemplates" isNew initial={newPaymentTermsTemplateValues()} title="New Payment Terms Template" editable save={savePaymentTermsTemplateAction.bind(null, null, null)} />;
}
