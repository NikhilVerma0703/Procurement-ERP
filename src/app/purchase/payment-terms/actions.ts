"use server";

// The Payment Term screen's writes; purchaseGate first (lib/purchase/masters/gated.ts),
// the rules in lib/purchase/masters/templates.
import { revalidatePath } from "next/cache";
import { gatedMasterWrite } from "@/lib/purchase/masters/gated";
import type { Values } from "@/lib/purchase/masters/spec";
import { deletePaymentTerm, savePaymentTerm } from "@/lib/purchase/masters/templates/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

export async function savePaymentTermAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => savePaymentTerm(u, { id, expectedUpdatedAt, values }));
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS.paymentTerms);
    revalidatePath(masterPath("paymentTerms", r.value.id));
  }
  return r;
}

export async function deletePaymentTermAction(id: string) {
  const r = await gatedMasterWrite((u) => deletePaymentTerm(u, id));
  if (r.ok) revalidatePath(PURCHASE_PATHS.paymentTerms);
  return r;
}
