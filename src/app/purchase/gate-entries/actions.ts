"use server";

// The Gate Entry form's server actions (owner, 23-11-2026: Thiru R's Gate Entry). Each starts with
// purchaseGate("stock") — the storekeeper's part of the ERP — and returns { ok, error, fieldErrors }.
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { gateEntryPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { cancelGateEntry, deleteGateEntry, gateEntryFromPo, saveGateEntry, submitGateEntry } from "@/lib/purchase/stock/gate-entry-save";
import type { Doc } from "@/lib/purchase/doc/store";
import { deleteInRounds, type BulkOutcome } from "@/lib/purchase/bulk-delete";
import { parseSelectedIds } from "@/lib/purchase/orders/selection";
import { db } from "@/lib/purchase/server/db";
import { purchaseWrite } from "@/lib/purchase/server/write";

type Saved = ActionResult<{ id: string; number: string; modified: string }>;

const refresh = (id?: string) => {
  revalidatePath(PURCHASE_PATHS.gateEntries);
  if (id) revalidatePath(gateEntryPath(id));
};

export async function saveGateEntryAction(req: { id: string | null; doc: unknown; modified: string | null; amendFrom?: string | null }): Promise<Saved> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const r = await saveGateEntry(g.user, {
    id: typeof req.id === "string" ? req.id : null,
    doc: req.doc,
    modified: typeof req.modified === "string" ? req.modified : null,
    amendFrom: typeof req.amendFrom === "string" ? req.amendFrom : null,
  });
  if (r.ok) refresh(r.value.id);
  return r;
}

export async function submitGateEntryAction(req: { id: string; modified: string | null }): Promise<Saved> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const r = await submitGateEntry(g.user, { id: String(req.id), modified: typeof req.modified === "string" ? req.modified : null });
  if (r.ok) refresh(r.value.id);
  return r;
}

export async function cancelGateEntryAction(req: { id: string; modified: string | null }): Promise<Saved> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const r = await cancelGateEntry(g.user, { id: String(req.id), modified: typeof req.modified === "string" ? req.modified : null });
  if (r.ok) refresh(r.value.id);
  return r;
}

export async function deleteGateEntryAction(req: { id: string }): Promise<ActionResult<{ number: string }>> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const r = await deleteGateEntry(g.user, { id: String(req.id) });
  if (r.ok) refresh();
  return r;
}

/**
 * The list's Actions › Delete over ticked gate entries (frappe.desk.reportview.delete_bulk): each
 * through the entry's own Delete, so a submitted one, or one a receipt names, stays with the reason.
 */
export async function bulkDeleteGateEntriesAction(ids: unknown): Promise<ActionResult<BulkOutcome>> {
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const user = g.user;
  const list = parseSelectedIds(ids);
  const found = await db.purchaseGateEntry.findMany({ where: { id: { in: list } }, select: { id: true, number: true } });
  const names = new Map(found.map((e) => [e.id, e.number]));
  const w = await purchaseWrite(user, () =>
    deleteInRounds(list.map((id) => ({ id, name: names.get(id) ?? "" })), async (row) => {
      if (!names.has(row.id)) return "This Gate Entry no longer exists.";
      const r = await deleteGateEntry(user, { id: row.id });
      return r.ok ? null : r.error;
    }),
  );
  if (!w.done) return { ok: false, error: w.refusal };
  refresh();
  return { ok: true, value: w.value };
}

/** The form's Po No trigger: the PO's supplier and date and its lines still to receive. */
export async function gateEntryPoAction(orderNumber: string): Promise<{ ok: true; value: { supplier: string; po_date: string; items: Doc[] } } | { ok: false; error: string }> {
  const g = await purchaseGate("stock");
  if (!g.ok) return { ok: false, error: purchaseRefusal(g) };
  return gateEntryFromPo(String(orderNumber).slice(0, 140));
}
