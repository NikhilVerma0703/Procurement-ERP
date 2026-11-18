// What changed between two states of a PO, in the shape of Frappe 14's Version
// (frappe/core/doctype/version/version.py, get_diff) — the shape of the 9,216
// history entries imported from the old site, so the PO's timeline reads both
// alike:
//   { changed:     [[fieldname, old, new], …, ["docstatus", 0, 1]],
//     added:       [[table, {row}]],
//     removed:     [[table, {row}]],
//     row_changed: [[table, index in the new rows, row name, [[fieldname, old, new]]]],
//     data_import: null, updater_reference: null }
// A field counts as changed when its stored value differs and so does its
// formatted value (Frappe compares both). Rows are matched by name (our row
// id). Pure.
import type { Cell, CellValue, Snapshot, SnapshotRow } from "./record";

type Change = [string, CellValue, CellValue];

export interface VersionData {
  added: [string, Record<string, CellValue>][];
  changed: (Change | ["docstatus", number, number])[];
  removed: [string, Record<string, CellValue>][];
  row_changed: [string, number, string, Change[]][];
  data_import: null;
  updater_reference: null;
}

function diffCells(a: Record<string, Cell>, b: Record<string, Cell>): Change[] {
  const out: Change[] = [];
  for (const [field, cell] of Object.entries(b)) {
    const old = a[field] ?? { raw: null, shown: null };
    if (old.raw !== cell.raw && old.shown !== cell.shown) out.push([field, old.shown, cell.shown]);
  }
  return out;
}

const asDict = (doctype: string, parent: string, r: SnapshotRow): Record<string, CellValue> => ({
  name: r.name,
  idx: r.idx,
  doctype,
  parent,
  ...Object.fromEntries(Object.entries(r.values).map(([k, c]) => [k, c.raw])),
});

/** The Version data between two snapshots, or null when nothing changed. */
export function versionDiff(a: Snapshot, b: Snapshot): VersionData | null {
  const out: VersionData = { added: [], changed: diffCells(a.header, b.header), removed: [], row_changed: [], data_import: null, updater_reference: null };
  for (const [table, { doctype, rows }] of Object.entries(b.tables)) {
    const before = a.tables[table]?.rows ?? [];
    const byName = new Map(before.map((r) => [r.name, r]));
    const found = new Set<string>();
    rows.forEach((row, i) => {
      const old = byName.get(row.name);
      if (!old) {
        out.added.push([table, asDict(doctype, b.number, row)]);
        return;
      }
      found.add(row.name);
      const changed = diffCells(old.values, row.values);
      if (changed.length) out.row_changed.push([table, i, row.name, changed]);
    });
    for (const old of before) if (!found.has(old.name)) out.removed.push([table, asDict(doctype, a.number, old)]);
  }
  if (a.docStatus !== b.docStatus) out.changed.push(["docstatus", a.docStatus, b.docStatus]);
  const any = out.changed.length + out.added.length + out.removed.length + out.row_changed.length;
  return any ? out : null;
}
