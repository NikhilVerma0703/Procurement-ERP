// The list sidebar's counts (owner, 26-11-2026: "Build all of them"), as Frappe 14.101.1 answered them:
//   * a "Filter By" dropdown (frappe.desk.listview.get_group_by_count): the list's records — under all its
//     conditions but the field's own — counted by their value of the field, most first, at most 50, none
//     with 0; "Assigned To" counts each user's to-dos on them that were not cancelled; the viewer's own
//     line comes first (shown as "Me"), Guest and Administrator are left out;
//   * "Tags" (frappe.desk.reportview.get_sidebar_stats): each tag with how many of the records carry it,
//     most first, then "No Tags" with how many carry none (always, even 0).
// Server only.
import "server-only";
import { db } from "../server/db";

export interface GroupCount {
  /** The value (null: not set). */
  name: string | null;
  count: number;
}

const LIMIT = 50;
const HIDDEN = new Set(["Guest", "Administrator"]);

function viewerFirst(rows: GroupCount[], viewer: string): GroupCount[] {
  const mine = rows.find((r) => r.name === viewer);
  const rest = rows.filter((r) => !(r.name && (HIDDEN.has(r.name) || r.name === viewer)));
  return mine ? [mine, ...rest] : rest;
}

/** A Filter By dropdown's lines. `rows`: the records and their values (orderFieldValues / docFieldValues). */
export async function groupByCounts(doctype: string, field: string, rows: readonly { id: string; value: string | null }[], viewer: string): Promise<GroupCount[]> {
  let counted: GroupCount[];
  if (field === "assigned_to") {
    const ids = rows.map((r) => r.id);
    const grouped = ids.length
      ? await db.purchaseAssignment.groupBy({ by: ["allocatedTo"], where: { doctype, recordId: { in: ids }, status: { not: "Cancelled" } }, _count: { _all: true } })
      : [];
    counted = grouped.map((g) => ({ name: g.allocatedTo, count: g._count._all }));
  } else {
    const by = new Map<string | null, number>();
    for (const r of rows) by.set(r.value, (by.get(r.value) ?? 0) + 1);
    counted = [...by].map(([name, count]) => ({ name, count }));
  }
  counted = counted.filter((c) => c.count !== 0).sort((a, b) => b.count - a.count).slice(0, LIMIT);
  // Frappe did this for every field (a Status of "Guest" would go too).
  return viewerFirst(counted, viewer);
}

/** The Tags dropdown's lines: [tag, count], then ["No Tags", count]. */
export async function tagStats(doctype: string, ids: readonly string[]): Promise<[string, number][]> {
  const rows = ids.length ? await db.purchaseTag.findMany({ where: { doctype, recordId: { in: [...ids] } }, select: { recordId: true, tag: true } }) : [];
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.tag, (by.get(r.tag) ?? 0) + 1);
  const tagged = new Set(rows.map((r) => r.recordId));
  const stats = [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [...stats, ["No Tags", ids.filter((id) => !tagged.has(id)).length]];
}
