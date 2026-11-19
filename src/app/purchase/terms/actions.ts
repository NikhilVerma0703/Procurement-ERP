"use server";

// The Terms and Conditions screen's writes; purchaseGate first (lib/purchase/masters/gated.ts),
// the rules in lib/purchase/masters/templates.
import { revalidatePath } from "next/cache";
import { gatedMasterWrite } from "@/lib/purchase/masters/gated";
import type { Values } from "@/lib/purchase/masters/spec";
import { deleteTerms, saveTerms } from "@/lib/purchase/masters/templates/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

export async function saveTermsAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => saveTerms(u, { id, expectedUpdatedAt, values }));
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS.terms);
    revalidatePath(masterPath("terms", r.value.id));
  }
  return r;
}

export async function deleteTermsAction(id: string) {
  const r = await gatedMasterWrite((u) => deleteTerms(u, id));
  if (r.ok) revalidatePath(PURCHASE_PATHS.terms);
  return r;
}
