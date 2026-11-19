import type { Metadata } from "next";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { newTaxTemplateValues } from "@/lib/purchase/masters/templates/spec";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { saveTaxTemplateAction } from "../actions";

export const metadata: Metadata = { title: "New Purchase Taxes and Charges Template" };
export const dynamic = "force-dynamic";

export default async function NewTaxTemplatePage() {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Purchase Taxes and Charges Template" title="New Purchase Taxes and Charges Template" message="You do not have permission to create a Purchase Taxes and Charges Template." back={PURCHASE_PATHS.taxTemplates} />;
  }
  return <MasterScreen master="taxTemplates" isNew initial={newTaxTemplateValues()} title="New Purchase Taxes and Charges Template" editable save={saveTaxTemplateAction.bind(null, null, null)} />;
}
