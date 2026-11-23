// The field labels a stock document's timeline names (Phase II, owner 21-11-2026): as Frappe's
// version_timeline_content_builder.js — a changed field is named by its label when it exists in the
// form, is not hidden and is at permission level 0 — from the document's captured layout and its
// child tables' (./layouts: the live site's merged definitions, custom fields and labels included).
// Pure.

import type { TimelineLabels } from "../orders/timeline";
import { isTable, type LayoutField } from "./layout";
import { LAYOUTS } from "./layouts";

const named = (f: LayoutField | undefined) => (f && !f.hidden && !f.permlevel ? f.label ?? f.fieldname : undefined);

export function layoutTimelineLabels(doctype: string): TimelineLabels {
  const layout = LAYOUTS[doctype];
  const fields = new Map((layout?.fields ?? []).map((f) => [f.fieldname, f]));
  const childFields = (tablefield: string) => {
    const t = fields.get(tablefield);
    const child = t && isTable(t) ? LAYOUTS[t.options ?? ""] : undefined;
    return new Map((child?.fields ?? []).map((f) => [f.fieldname, f]));
  };
  const cache = new Map<string, Map<string, LayoutField>>();
  return {
    field: (f) => named(fields.get(f)),
    rowField: (t, f) => {
      if (!cache.has(t)) cache.set(t, childFields(t));
      return named(cache.get(t)!.get(f));
    },
  };
}
