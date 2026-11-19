"use server";

// The Purchase Taxes and Charges Template screen's writes; purchaseGate first
// (lib/purchase/masters/gated.ts), the rules in lib/purchase/masters/templates.
import { revalidatePath } from "next/cache";
import { gatedMasterWrite } from "@/lib/purchase/masters/gated";
import type { Values } from "@/lib/purchase/masters/spec";
import { deleteTaxTemplate, saveTaxTemplate } from "@/lib/purchase/masters/templates/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

export async function saveTaxTemplateAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => saveTaxTemplate(u, { id, expectedUpdatedAt, values }));
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS.taxTemplates);
    revalidatePath(masterPath("taxTemplates", r.value.id));
  }
  return r;
}

export async function deleteTaxTemplateAction(id: string) {
  const r = await gatedMasterWrite((u) => deleteTaxTemplate(u, id));
  if (r.ok) revalidatePath(PURCHASE_PATHS.taxTemplates);
  return r;
}
