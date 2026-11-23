// A stock document's timeline: its history, comments and emails from the old site (Phase II, owner
// 21-11-2026), built as the PO's (orders/timeline.ts buildTimeline — Frappe's form timeline rules), from
// purchase_doc_events. Read-only for now: commenting on stock documents comes with their editing.

import { buildTimeline, type TimelineItem } from "../orders/timeline";
import { namesOf } from "../orders/activity";
import { db } from "../server/db";
import { layoutTimelineLabels } from "./timeline-labels";

export interface DocActivity {
  items: TimelineItem[];
  created: { email: string; name: string; at: string } | null;
  edited: { email: string; name: string; at: string } | null;
}

export async function loadDocActivity(
  doctype: string,
  docName: string,
  stamps: { createdBy: string | null; createdAt: Date; updatedBy: string | null; updatedAt: Date },
): Promise<DocActivity> {
  const events = await db.purchaseDocEvent.findMany({ where: { doctype, docName }, orderBy: { at: "desc" } });
  const people = new Set<string>();
  for (const e of events) {
    if (e.byEmail) people.add(e.byEmail);
    const d = (e.data ?? {}) as Record<string, unknown>;
    for (const k of ["recipients", "cc", "bcc"]) if (typeof d[k] === "string") for (const x of (d[k] as string).split(",")) people.add(x.trim());
  }
  if (stamps.createdBy) people.add(stamps.createdBy);
  if (stamps.updatedBy) people.add(stamps.updatedBy);
  const nameOf = await namesOf(people);
  const items = buildTimeline(
    events.map((e) => ({ id: e.id, source: e.source, kind: e.kind, at: e.at, byEmail: e.byEmail, subject: e.subject, content: e.content, data: e.data })),
    { nameOf, labels: layoutTimelineLabels(doctype) },
  );
  const person = (email: string | null, at: Date) => (email ? { email, name: nameOf(email), at: at.toISOString() } : null);
  return { items, created: person(stamps.createdBy, stamps.createdAt), edited: person(stamps.updatedBy, stamps.updatedAt) };
}
