"use server";

// What every master screen shares: Rename, and the list's Actions → Delete over
// the ticked rows. Each passes purchaseGate("masters") first
// (lib/purchase/masters/gated.ts); the rules are lib/purchase/masters/rename.ts
// and lib/purchase/masters/bulk.ts.
import { revalidatePath } from "next/cache";
import { bulkDeleteMasters, isMasterKey } from "@/lib/purchase/masters/bulk";
import { gatedMasterWrite } from "@/lib/purchase/masters/gated";
import { parseSelectedIds } from "@/lib/purchase/orders/selection";
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

export async function bulkDeleteMastersAction(master: string, ids: unknown) {
  if (!isMasterKey(master)) return { ok: false as const, error: "Unknown record type." };
  const list = parseSelectedIds(ids);
  const r = await gatedMasterWrite((u) => bulkDeleteMasters(u, master, list));
  if (r.ok) revalidatePath(PURCHASE_PATHS[master]);
  return r;
}
