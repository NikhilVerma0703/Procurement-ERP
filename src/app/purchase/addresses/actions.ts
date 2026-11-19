"use server";

// The Address screen's writes. Each passes purchaseGate first
// (lib/purchase/masters/gated.ts); the rules are lib/purchase/masters/address.
import { revalidatePath } from "next/cache";
import { deleteAddress, saveAddress } from "@/lib/purchase/masters/address/server";
import { gatedMasterWrite } from "@/lib/purchase/masters/gated";
import type { Values } from "@/lib/purchase/masters/spec";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

function refresh(id?: string) {
  revalidatePath(PURCHASE_PATHS.addresses);
  revalidatePath(PURCHASE_PATHS.suppliers, "layout");
  if (id) revalidatePath(masterPath("addresses", id));
}

export async function saveAddressAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => saveAddress(u, { id, expectedUpdatedAt, values }));
  if (r.ok) refresh(r.value.id);
  return r;
}

export async function deleteAddressAction(id: string) {
  const r = await gatedMasterWrite((u) => deleteAddress(u, id));
  if (r.ok) refresh();
  return r;
}
