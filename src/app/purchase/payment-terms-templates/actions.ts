"use server";

// The Payment Terms Template screen's writes and its rows' fetch; purchaseGate
// first (lib/purchase/masters/gated.ts), the rules in lib/purchase/masters/templates.
import { revalidatePath } from "next/cache";
import { gatedMasterRead, gatedMasterWrite } from "@/lib/purchase/masters/gated";
import type { Values } from "@/lib/purchase/masters/spec";
import { deletePaymentTermsTemplate, paymentTermDetails, savePaymentTermsTemplate } from "@/lib/purchase/masters/templates/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

export async function savePaymentTermsTemplateAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => savePaymentTermsTemplate(u, { id, expectedUpdatedAt, values }));
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS.paymentTermsTemplates);
    revalidatePath(masterPath("paymentTermsTemplates", r.value.id));
  }
  return r;
}

export async function deletePaymentTermsTemplateAction(id: string) {
  const r = await gatedMasterWrite((u) => deletePaymentTermsTemplate(u, id));
  if (r.ok) revalidatePath(PURCHASE_PATHS.paymentTermsTemplates);
  return r;
}

/** A row's Payment Term picked → its fields (fetch_from payment_term.*). */
export async function paymentTermDetailsAction(code: string) {
  return gatedMasterRead(() => paymentTermDetails(code));
}
