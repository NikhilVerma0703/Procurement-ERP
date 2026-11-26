// The lists' "Assigned To" (_assign) and "Tags" (_user_tags) conditions (owner, 26-11-2026), answered from the
// assignments and tags tables as Frappe answered them from its two columns: _assign held the open assignees as
// JSON (["a@x.com"]), _user_tags the tags as ",tag1,tag2". A condition ("like %a@x.com%", "is set", "=") is
// tested against that text for each record, exactly as the "Liked By" one is (like-rules.ts). Server only.
import "server-only";
import { likedByMatches, likedByText } from "../like-rules";
import type { ListFilter } from "../orders/list";
import { db } from "../server/db";

export const ASSIGN_FIELD = "_assign";
export const TAGS_FIELD = "_user_tags";
export const isCollabField = (field: string) => field === ASSIGN_FIELD || field === TAGS_FIELD;

/** The condition on record ids. */
export async function collabWhere(doctype: string, f: Pick<ListFilter, "field" | "op" | "value">): Promise<{ in: string[] } | { notIn: string[] }> {
  const texts = new Map<string, string>();
  if (f.field === ASSIGN_FIELD) {
    const rows = await db.purchaseAssignment.findMany({ where: { doctype, status: "Open" }, select: { recordId: true, allocatedTo: true }, orderBy: { createdAt: "asc" } });
    const by = new Map<string, string[]>();
    for (const r of rows) (by.get(r.recordId) ?? by.set(r.recordId, []).get(r.recordId)!).push(r.allocatedTo);
    for (const [id, emails] of by) texts.set(id, likedByText(emails));
  } else {
    const rows = await db.purchaseTag.findMany({ where: { doctype }, select: { recordId: true, tag: true }, orderBy: { createdAt: "asc" } });
    const by = new Map<string, string[]>();
    for (const r of rows) (by.get(r.recordId) ?? by.set(r.recordId, []).get(r.recordId)!).push(r.tag);
    for (const [id, tags] of by) texts.set(id, `,${tags.join(",")}`);
  }
  const nobodyMeets = likedByMatches(f, "");
  const ids = [...texts].filter(([, text]) => likedByMatches(f, text) !== nobodyMeets).map(([id]) => id);
  return nobodyMeets ? { notIn: ids } : { in: ids };
}
