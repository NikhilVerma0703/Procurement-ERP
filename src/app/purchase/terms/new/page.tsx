import type { Metadata } from "next";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { newTermsValues } from "@/lib/purchase/masters/templates/spec";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { saveTermsAction } from "../actions";

export const metadata: Metadata = { title: "New Terms and Conditions" };
export const dynamic = "force-dynamic";

export default async function NewTermsPage() {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Terms and Conditions" title="New Terms and Conditions" message="You do not have permission to create a Terms and Conditions." back={PURCHASE_PATHS.terms} />;
  }
  return <MasterScreen master="terms" isNew initial={newTermsValues()} title="New Terms and Conditions" editable save={saveTermsAction.bind(null, null, null)} />;
}
