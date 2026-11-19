// The PO list's selection Actions that change records: Delete, and the workflow's Approve and Reject
// (Frappe's list: bulk_operations.delete → frappe.desk.reportview.delete_items, and the workflow menu
// items → frappe.model.workflow.bulk_workflow_approval). Each PO goes through the same rule as on its
// own page (transitions.ts: deleteOrder, submitOrder), in its own transaction, so one refusal never
// undoes the others: Frappe committed after each document too. The answer says what was done and what
// was refused, and why, for the list's "Workflow Status" / message dialogs.
import "server-only";
import { deleteInRounds, type BulkOutcome, type BulkRow } from "../bulk-delete";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import type { ActionResult } from "./form-schema";
import { deleteOrder, submitOrder } from "./transitions";

export type { BulkOutcome, BulkRow } from "../bulk-delete";

/** bulk_workflow_approval refused more than this many ("Too Many Documents"). */
export const MAX_WORKFLOW = 500;

const GONE = "This Purchase Order no longer exists.";

/** The selected POs that are still there, in the order given, and the ids that are not. */
async function picked(ids: readonly string[]) {
  const rows = await db.purchaseOrder.findMany({ where: { id: { in: [...ids] } }, select: { id: true, number: true, docStatus: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { found: ids.flatMap((id) => byId.get(id) ?? []), missing: ids.filter((id) => !byId.has(id)) };
}

/**
 * Delete (delete_items → delete_bulk, lib/purchase/bulk-delete.ts). A submitted PO is refused with
 * Frappe's own message (check_permission_and_not_submitted); anything else the PO's own Delete refuses
 * is refused here the same way.
 */
export async function bulkDeleteOrders(user: PurchaseUser, ids: readonly string[]): Promise<ActionResult<BulkOutcome>> {
  const { found, missing } = await picked(ids);
  const status = new Map(found.map((o) => [o.id, o.docStatus]));
  const outcome = await deleteInRounds(
    found.map((o) => ({ id: o.id, name: o.number })),
    async (row) => {
      if (status.get(row.id) === "SUBMITTED") return `Purchase Order ${row.name}: Submitted Record cannot be deleted. You must Cancel it first.`;
      try {
        const r = await deleteOrder(user, { id: row.id });
        return r.ok ? null : r.error;
      } catch (e) {
        console.error("bulk delete failed", row.name, e);
        return `${row.name} could not be deleted.`;
      }
    },
  );
  for (const id of missing) outcome.failed.push({ id, name: "", error: GONE });
  return { ok: true, value: outcome };
}

/**
 * Approve or Reject the selection (_bulk_workflow_action): each PO in turn through the workflow, as its
 * own Actions button would; the ones the workflow or the checks refuse are listed with the reason.
 */
export async function bulkWorkflowOrders(user: PurchaseUser, ids: readonly string[], decision: "approve" | "reject"): Promise<ActionResult<BulkOutcome>> {
  if (ids.length > MAX_WORKFLOW) return { ok: false, error: `Bulk approval only support up to ${MAX_WORKFLOW} documents.` };
  const { found, missing } = await picked(ids);
  const done: BulkRow[] = [];
  const failed: BulkOutcome["failed"] = [];
  for (const o of found) {
    const row = { id: o.id, name: o.number };
    try {
      const r = await submitOrder(user, { id: o.id }, decision);
      if (r.ok) done.push(row);
      else failed.push({ ...row, error: r.error });
    } catch (e) {
      console.error(`bulk ${decision} failed`, o.number, e);
      failed.push({ ...row, error: `${o.number} could not be ${decision === "approve" ? "approved" : "rejected"}.` });
    }
  }
  for (const id of missing) failed.push({ id, name: "", error: GONE });
  return { ok: true, value: { done, failed } };
}
