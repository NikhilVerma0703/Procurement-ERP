"use server";

// The Supplier screen's writes and fetches. Each passes purchaseGate first
// (lib/purchase/masters/gated.ts); the rules are lib/purchase/masters/supplier.
import { revalidatePath } from "next/cache";
import { gatedMasterRead, gatedMasterWrite } from "@/lib/purchase/masters/gated";
import type { Values } from "@/lib/purchase/masters/spec";
import { deleteSupplier, saveSupplier, supplierAddressFetch, supplierContactFetch } from "@/lib/purchase/masters/supplier/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

function refresh(id?: string) {
  revalidatePath(PURCHASE_PATHS.suppliers);
  if (id) revalidatePath(masterPath("suppliers", id));
}

/** Save from the full form: a new supplier (id null) or an existing one, opened at expectedUpdatedAt. */
export async function saveSupplierAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => saveSupplier(u, { id, expectedUpdatedAt, values }));
  if (r.ok) refresh(r.value.id);
  return r;
}

/** Save from the list's quick entry (New Supplier), with its primary contact and address. */
export async function quickSaveSupplierAction(values: Values) {
  const r = await gatedMasterWrite((u) => saveSupplier(u, { id: null, values, quick: true }));
  if (r.ok) refresh(r.value.id);
  return r;
}

export async function deleteSupplierAction(id: string) {
  const r = await gatedMasterWrite((u) => deleteSupplier(u, id));
  if (r.ok) refresh();
  return r;
}

export async function supplierContactFetchAction(code: string) {
  return gatedMasterRead(() => supplierContactFetch(code));
}

export async function supplierAddressFetchAction(code: string) {
  return gatedMasterRead(() => supplierAddressFetch(code));
}
