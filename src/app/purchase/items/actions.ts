"use server";

// The Item screen's writes and the variant checks. Each passes purchaseGate first
// (lib/purchase/masters/gated.ts); the rules are lib/purchase/masters/item.
import { revalidatePath } from "next/cache";
import { gatedMasterRead, gatedMasterWrite } from "@/lib/purchase/masters/gated";
import { createVariants, deleteItem, saveItem, variantDraft } from "@/lib/purchase/masters/item/server";
import type { Values } from "@/lib/purchase/masters/spec";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";

function refresh(id?: string) {
  revalidatePath(PURCHASE_PATHS.items);
  if (id) revalidatePath(masterPath("items", id));
}

export async function saveItemAction(id: string | null, expectedUpdatedAt: string | null, values: Values) {
  const r = await gatedMasterWrite((u) => saveItem(u, { id, expectedUpdatedAt, values }));
  if (r.ok) refresh(r.value.id);
  return r;
}

export async function deleteItemAction(id: string) {
  const r = await gatedMasterWrite((u) => deleteItem(u, id));
  if (r.ok) refresh();
  return r;
}

/** Single Variant: does a variant with these values exist already? (get_variant) */
export async function variantCheckAction(templateId: string, args: Record<string, string>) {
  return gatedMasterRead(async (): Promise<{ exists: string; id: string } | { error: string } | { ok: true }> => {
    const d = await variantDraft(templateId, args);
    return "exists" in d ? { exists: d.exists, id: d.id } : "error" in d ? { error: d.error } : { ok: true as const };
  });
}

/** Multiple Variants: create every combination of the values picked. */
export async function createVariantsAction(templateId: string, picked: Record<string, string[]>) {
  const r = await gatedMasterWrite((u) => createVariants(u, templateId, picked));
  if (r.ok) refresh(templateId);
  return r;
}
