"use server";

// The server actions of the Stock screens drawn from their definitions (owner, 24-11-2026): save and
// delete a master of Items and Pricing, the list's Actions › Delete, and the form's fetch when a link
// is chosen. Each starts with purchaseGate("stock") — the storekeeper's part of the ERP — runs
// through purchaseWrite() when it writes, and answers { ok, error, fieldErrors } (CLAUDE.md, seams).

import { revalidatePath } from "next/cache";
import { deleteInRounds, type BulkOutcome } from "@/lib/purchase/bulk-delete";
import { changeDocStatus, deleteDoc, saveDoc } from "@/lib/purchase/doc/doc-save";
import { materialRequestRowDetails } from "@/lib/purchase/stock/material-request";
import { fetchLinked } from "@/lib/purchase/doc/links";
import { DOC_SCREENS, type DocScreen } from "@/lib/purchase/doc/screens";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { parseSelectedIds } from "@/lib/purchase/orders/selection";
import { docRecordPath } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { purchaseWrite } from "@/lib/purchase/server/write";
import { Prisma } from "@prisma/client";

const screenOf = (key: unknown): DocScreen | undefined => DOC_SCREENS.find((s) => s.key === key);

export async function saveDocAction(key: string, req: { id: string | null; doc: unknown; modified: string | null; submit?: boolean }): Promise<ActionResult<{ id: string; name: string; modified: string }>> {
  const s = screenOf(key);
  if (!s) return { ok: false, error: "Unknown record type." };
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const user = g.user;
  const w = await purchaseWrite(user, () =>
    saveDoc(user, s, { id: typeof req.id === "string" ? req.id : null, doc: req.doc, modified: typeof req.modified === "string" ? req.modified : null, submit: req.submit === true }),
  );
  if (!w.done) return { ok: false, error: w.refusal };
  if (w.value.ok) {
    revalidatePath(s.path);
    revalidatePath(docRecordPath(s.path, w.value.value.id));
  }
  return w.value;
}

export async function deleteDocAction(key: string, id: string): Promise<ActionResult<{ name: string }>> {
  const s = screenOf(key);
  if (!s) return { ok: false, error: "Unknown record type." };
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const user = g.user;
  const w = await purchaseWrite(user, () => deleteDoc(user, s, String(id).slice(0, 64)));
  if (!w.done) return { ok: false, error: w.refusal };
  if (w.value.ok) revalidatePath(s.path);
  return w.value;
}

/** A submitted document's Cancel, and a Material Request's Stop / Re-open. */
export async function changeDocStatusAction(key: string, req: { id: string; modified: string | null; action: "cancel" | "stop" | "reopen" }): Promise<ActionResult<{ id: string; name: string; modified: string }>> {
  const s = screenOf(key);
  if (!s) return { ok: false, error: "Unknown record type." };
  if (!["cancel", "stop", "reopen"].includes(req?.action)) return { ok: false, error: "Not allowed." };
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const user = g.user;
  const w = await purchaseWrite(user, () => changeDocStatus(user, s, { id: String(req.id).slice(0, 64), modified: typeof req.modified === "string" ? req.modified : null, action: req.action }));
  if (!w.done) return { ok: false, error: w.refusal };
  if (w.value.ok) {
    revalidatePath(s.path);
    revalidatePath(docRecordPath(s.path, w.value.value.id));
  }
  return w.value;
}

/** A row's values from its item (the form scripts' get_item_details), for the DocTypes that had one. */
export async function rowDetailsAction(key: string, table: string, row: Record<string, unknown>, parent: Record<string, unknown>): Promise<ActionResult<Record<string, unknown>>> {
  const s = screenOf(key);
  if (!s) return { ok: false, error: "Unknown record type." };
  const g = await purchaseGate("stock");
  if (!g.ok) return { ok: false, error: purchaseRefusal(g) };
  const clean = (o: unknown) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).filter(([k, v]) => /^[a-z_][a-z0-9_]*$/.test(k) && !Array.isArray(v)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 500) : v]));
  if (s.doctype === "Material Request" && table === "items") return { ok: true, value: await materialRequestRowDetails(db, clean(row), clean(parent)) };
  return { ok: true, value: {} };
}

/** The list's Actions › Delete, over a batch of ticked records (frappe.desk.reportview.delete_bulk). */
export async function bulkDeleteDocsAction(key: string, ids: unknown): Promise<ActionResult<BulkOutcome>> {
  const s = screenOf(key);
  if (!s) return { ok: false, error: "Unknown record type." };
  if (!s.editable) return { ok: false, error: `${s.doctype} is not entered here.` };
  const g = await purchaseGate("stock");
  if (!g.ok || !g.user) return { ok: false, error: purchaseRefusal(g) };
  const user = g.user;
  const list = parseSelectedIds(ids);
  const table = s.store.kind === "table" ? Prisma.raw(`"${s.store.table}"`) : Prisma.raw("purchase_documents");
  const named = list.length ? await db.$queryRaw<{ id: string; name: string | null }[]>`SELECT id, legacy->>'name' AS name FROM ${table} WHERE id IN (${Prisma.join(list)})` : [];
  const names = new Map(named.map((r) => [r.id, r.name ?? ""]));
  const w = await purchaseWrite(user, () =>
    deleteInRounds(list.map((id) => ({ id, name: names.get(id) ?? "" })), async (row) => {
      if (!names.has(row.id)) return `This ${s.doctype} no longer exists.`;
      const r = await deleteDoc(user, s, row.id);
      return r.ok ? null : r.error;
    }),
  );
  if (!w.done) return { ok: false, error: w.refusal };
  revalidatePath(s.path);
  return { ok: true, value: w.value };
}

/** The form's fetch on choosing a link (frm.add_fetch / fetch_from): these fields of that record. */
export async function fetchLinkedAction(doctype: string, name: string, fields: string[]): Promise<ActionResult<Record<string, unknown> | null>> {
  const g = await purchaseGate("stock");
  if (!g.ok) return { ok: false, error: purchaseRefusal(g) };
  const wanted = (Array.isArray(fields) ? fields : []).filter((f) => typeof f === "string" && /^[a-z_][a-z0-9_]*$/.test(f)).slice(0, 30);
  return { ok: true, value: await fetchLinked(String(doctype).slice(0, 140), String(name).slice(0, 140), wanted) };
}
