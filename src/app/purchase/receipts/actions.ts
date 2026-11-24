"use server";

// The Purchase Receipt form's server actions (Phase II, owner 21-11-2026). Each starts with
// purchaseGate("stock") — Thiru R's part of the ERP — and returns { ok, error, fieldErrors }.
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { PURCHASE_PATHS, receiptPath } from "@/lib/purchase/routes";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { cancelReceipt, saveReceipt } from "@/lib/purchase/stock/receipt-save";

export async function saveReceiptAction(req: { id: string | null; doc: unknown; modified: string | null }): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const r = await saveReceipt(g.user, { id: typeof req.id === "string" ? req.id : null, doc: req.doc, modified: typeof req.modified === "string" ? req.modified : null });
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS.receipts);
    revalidatePath(receiptPath(r.value.id));
  }
  return r;
}

/** Submit a saved draft (its Submit): saved again with every check, then posted (stock/receipt-submit.ts). */
export async function submitReceiptAction(req: { id: string; doc: unknown; modified: string | null }): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const r = await saveReceipt(g.user, { id: String(req.id), doc: req.doc, modified: typeof req.modified === "string" ? req.modified : null, submit: true });
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS.receipts);
    revalidatePath(receiptPath(r.value.id));
    revalidatePath(PURCHASE_PATHS.gateEntries);
  }
  return r;
}

/** Cancel a submitted receipt (its Cancel). */
export async function cancelReceiptAction(req: { id: string; modified: string | null }): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const r = await cancelReceipt(g.user, { id: String(req.id), modified: typeof req.modified === "string" ? req.modified : null });
  if (r.ok) {
    revalidatePath(PURCHASE_PATHS.receipts);
    revalidatePath(receiptPath(r.value.id));
    revalidatePath(PURCHASE_PATHS.gateEntries);
  }
  return r;
}
