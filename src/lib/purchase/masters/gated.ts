// The gate every master's server action passes (CLAUDE.md, seams): a write
// needs purchaseGate("masters") and runs through purchaseWrite(); a fetch for
// the form needs purchaseGate("view").
import "server-only";
import type { ActionResult } from "../orders/form-schema";
import type { PurchaseUser } from "../server/current-user";
import { purchaseGate, purchaseRefusal } from "../server/gate";
import { purchaseWrite } from "../server/write";

export async function gatedMasterWrite<T>(fn: (user: PurchaseUser) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const g = await purchaseGate("masters");
  if (!g.ok || !g.user) return { ok: false, error: g.status === 401 ? purchaseRefusal(g) : "You are not permitted to do this." };
  const user = g.user;
  const w = await purchaseWrite(user, () => fn(user));
  return w.done ? w.value : { ok: false, error: w.refusal };
}

export type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };

export async function gatedMasterRead<T>(fn: () => Promise<T>): Promise<Fetched<T>> {
  const g = await purchaseGate("view");
  if (!g.ok) return { ok: false, error: purchaseRefusal(g) };
  return { ok: true, value: await fn() };
}
