// A list's bulk action over a large selection, sent in turns (BULK_BATCH records a request) so each
// request stays inside a Vercel function's time limit, with the outcomes added up. Delete goes as
// Frappe's delete_bulk went: newest name first, then again for whatever was refused while others
// went, until a pass deletes nothing more, across the turns as within them
// (lib/purchase/bulk-delete.ts does the same inside one request). Pure: the caller passes the action.
import { byNameDescending, type BulkOutcome, type BulkRow } from "@/lib/purchase/bulk-delete";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { BULK_BATCH } from "@/lib/purchase/orders/selection";

type Run = (ids: string[]) => Promise<ActionResult<BulkOutcome>>;
type Progress = (done: number, total: number) => void;

/**
 * Runs `run` over `ids` in turns, in order. A request refused outright (not permitted, signed out)
 * stops the rest: what was done stays done, and the records not reached are listed as failed with
 * the reason, or, when nothing had been done yet, the refusal is the answer.
 */
export async function inBatches(ids: readonly string[], run: Run, onProgress?: Progress, size = BULK_BATCH): Promise<ActionResult<BulkOutcome>> {
  const out: BulkOutcome = { done: [], failed: [] };
  for (let i = 0; i < ids.length; i += size) {
    const r = await run(ids.slice(i, i + size));
    if (!r.ok) {
      if (!out.done.length && !out.failed.length) return r;
      out.failed.push(...ids.slice(i).map((id) => ({ id, name: "", error: r.error })));
      return { ok: true, value: out };
    }
    out.done.push(...r.value.done);
    out.failed.push(...r.value.failed);
    onProgress?.(Math.min(i + size, ids.length), ids.length);
  }
  return { ok: true, value: out };
}

/** Delete over the selection in turns and rounds; the refusals are the last pass's. */
export async function deleteInBatches(rows: readonly BulkRow[], run: Run, onProgress?: Progress, size = BULK_BATCH): Promise<ActionResult<BulkOutcome>> {
  const done: BulkRow[] = [];
  let pending = [...rows].sort(byNameDescending).map((r) => r.id);
  let failed: BulkOutcome["failed"] = [];
  for (;;) {
    const r = await inBatches(pending, run, onProgress, size);
    if (!r.ok) return done.length ? { ok: true, value: { done, failed: pending.map((id) => ({ id, name: "", error: r.error })) } } : r;
    done.push(...r.value.done);
    failed = r.value.failed;
    if (!failed.length || !r.value.done.length) break;
    pending = failed.map((f) => f.id);
  }
  return { ok: true, value: { done, failed } };
}
