"use server";

// What every master screen shares: Rename. It passes purchaseGate("masters")
// first (lib/purchase/masters/gated.ts); the rule is lib/purchase/masters/rename.ts.
import { revalidatePath } from "next/cache";
import { gatedMasterWrite } from "@/lib/purchase/masters/gated";
import { renameMaster, MASTER_DOCTYPES } from "@/lib/purchase/masters/rename";
import { masterPath, PURCHASE_PATHS, type MasterKey } from "@/lib/purchase/routes";

export async function renameMasterAction(master: MasterKey, id: string, newName: string, newTitle: string | null) {
  // A master key from the browser is checked against the list before anything runs.
  if (!Object.prototype.hasOwnProperty.call(MASTER_DOCTYPES, master)) return { ok: false as const, error: "Unknown record type." };
  const r = await gatedMasterWrite((u) => renameMaster(u, master, id, { newName, newTitle }));
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS[master]);
    revalidatePath(masterPath(master, id));
  }
  return r;
}
