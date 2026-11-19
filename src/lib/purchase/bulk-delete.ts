// A list's Actions → Delete over the ticked records, as Frappe ran it (frappe.desk.reportview.delete_bulk):
// newest name first (sorted(items, reverse=True)), each record on its own so one refusal never undoes the
// others, then again for the ones refused while others went, until a round deletes nothing more (a
// record that only the deletion of another selected one frees, such as an item and its variants, an
// amended PO and the one it amends, goes in a later round). The messages are the last round's. Pure:
// the caller passes each record's own delete rule.

export interface BulkRow {
  id: string;
  /** The record's name (a PO's number, a master's ID); "" when it was no longer there. */
  name: string;
}

export interface BulkOutcome {
  done: BulkRow[];
  failed: (BulkRow & { error: string })[];
}

/** Python's sorted(…, reverse=True) on names: plain code-point order, the greatest first. */
export const byNameDescending = (a: BulkRow, b: BulkRow) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0);

/** `remove` answers null when the record went, else why it did not. */
export async function deleteInRounds(rows: readonly BulkRow[], remove: (row: BulkRow) => Promise<string | null>): Promise<BulkOutcome> {
  const done: BulkRow[] = [];
  let pending = [...rows].sort(byNameDescending);
  let refused = new Map<string, string>();
  while (pending.length) {
    refused = new Map();
    const left: BulkRow[] = [];
    for (const row of pending) {
      const error = await remove(row);
      if (error === null) done.push(row);
      else {
        left.push(row);
        refused.set(row.id, error);
      }
    }
    if (left.length === pending.length) break;
    pending = left;
  }
  return { done, failed: pending.filter((r) => refused.has(r.id)).map((r) => ({ ...r, error: refused.get(r.id)! })) };
}
