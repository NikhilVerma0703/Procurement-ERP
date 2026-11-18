"use server";

// The PO form's writes: Save and the workflow actions. Each starts with
// purchaseGate(action) and runs its write through purchaseWrite() (CLAUDE.md,
// seams); the rules are in lib/purchase/orders (save.ts, transitions.ts),
// which re-validate and recompute on the server and answer
// { ok, error, fieldErrors }.
import { revalidatePath } from "next/cache";
import type { PurchaseAction } from "@/lib/purchase/access";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { saveOrder, type SaveRequest } from "@/lib/purchase/orders/save";
import {
  cancelOrder, closeOrder, deleteOrder, holdOrder, reopenOrder, resumeOrder, submitOrder, updateOrderItems, updateSubmittedOrder,
  type ActionRequest,
} from "@/lib/purchase/orders/transitions";
import { orderPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import type { PurchaseUser } from "@/lib/purchase/server/current-user";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { purchaseWrite } from "@/lib/purchase/server/write";

async function gated<T>(action: PurchaseAction, fn: (user: PurchaseUser) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const g = await purchaseGate(action);
  if (!g.ok || !g.user) return { ok: false, error: g.status === 401 ? purchaseRefusal(g) : "You are not permitted to do this." };
  const user = g.user;
  const w = await purchaseWrite(user, () => fn(user));
  return w.done ? w.value : { ok: false, error: w.refusal };
}

function refresh(id?: string) {
  revalidatePath(PURCHASE_PATHS.orders);
  if (id) revalidatePath(orderPath(id));
}

export async function saveOrderAction(req: SaveRequest): Promise<ActionResult<{ id: string; number: string }>> {
  const r = await gated("save", (u) => saveOrder(u, req));
  if (r.ok) refresh(r.value.id);
  return r;
}

const run = (action: PurchaseAction, fn: (u: PurchaseUser) => Promise<ActionResult>, id: string) =>
  gated(action, fn).then((r) => {
    if (r.ok) refresh(id);
    return r;
  });

export async function approveOrderAction(req: ActionRequest) {
  return run("approve", (u) => submitOrder(u, req, "approve"), req.id);
}

export async function rejectOrderAction(req: ActionRequest) {
  return run("approve", (u) => submitOrder(u, req, "reject"), req.id);
}

export async function cancelOrderAction(req: ActionRequest) {
  return run("manage", (u) => cancelOrder(u, req), req.id);
}

export async function closeOrderAction(req: ActionRequest) {
  return run("manage", (u) => closeOrder(u, req), req.id);
}

export async function holdOrderAction(req: ActionRequest, reason: string) {
  return run("manage", (u) => holdOrder(u, req, reason), req.id);
}

export async function resumeOrderAction(req: ActionRequest) {
  return run("manage", (u) => resumeOrder(u, req), req.id);
}

export async function reopenOrderAction(req: ActionRequest) {
  return run("manage", (u) => reopenOrder(u, req), req.id);
}

export async function updateSubmittedOrderAction(req: ActionRequest, values: unknown) {
  return run("manage", (u) => updateSubmittedOrder(u, req, values), req.id);
}

export async function updateOrderItemsAction(req: ActionRequest, rows: unknown) {
  return run("approve", (u) => updateOrderItems(u, req, rows), req.id);
}

export async function deleteOrderAction(req: ActionRequest) {
  const r = await gated("save", (u) => deleteOrder(u, req));
  if (r.ok) revalidatePath(PURCHASE_PATHS.orders);
  return r;
}
