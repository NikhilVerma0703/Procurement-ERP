"use server";

// The ♥ on a list row or in a form: like or unlike a PO or a master. It passes purchaseGate("like")
// first and runs through purchaseWrite() (CLAUDE.md, seams); the rule is lib/purchase/likes.ts.
import { isLikeKind, toggleLike, type LikeInfo } from "@/lib/purchase/likes";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { purchaseWrite } from "@/lib/purchase/server/write";

export async function toggleLikeAction(kind: string, recordId: string, like: boolean): Promise<ActionResult<LikeInfo>> {
  if (!isLikeKind(kind)) return { ok: false, error: "Unknown record type." };
  const g = await purchaseGate("like");
  if (!g.ok || !g.user) return { ok: false, error: g.status === 401 ? purchaseRefusal(g) : "You are not permitted to do this." };
  const user = g.user;
  const w = await purchaseWrite(user, () => toggleLike(user, kind, String(recordId).slice(0, 64), Boolean(like)));
  return w.done ? w.value : { ok: false, error: w.refusal };
}
