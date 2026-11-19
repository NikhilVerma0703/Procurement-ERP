"use server";

// The Contact screen's writes. Each passes purchaseGate first
// (lib/purchase/masters/gated.ts); the rules are lib/purchase/masters/contact.
import { revalidatePath } from "next/cache";
import { deleteContact, saveContact } from "@/lib/purchase/masters/contact/server";
import { gatedMasterWrite } from "@/lib/purchase/masters/gated";
import type { Values } from "@/lib/purchase/masters/spec";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

function refresh(id?: string) {
  revalidatePath(PURCHASE_PATHS.contacts);
  revalidatePath(PURCHASE_PATHS.suppliers, "layout");
  if (id) revalidatePath(masterPath("contacts", id));
}

export async function saveContactAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => saveContact(u, { id, expectedUpdatedAt, values }));
  if (r.ok) refresh(r.value.id);
  return r;
}

export async function deleteContactAction(id: string) {
  const r = await gatedMasterWrite((u) => deleteContact(u, id));
  if (r.ok) refresh();
  return r;
}
