// A form's Series choices in the current financial year (owner, 26-11-2026: new numbers carry the
// financial year — financial-year.ts). The captured layouts list the series as the old site wrote them
// ("PR/25-26/.MM-"); a new document's form offers them in the year of its date ("PR/26-27/.MM-"). The
// server puts the chosen series in the year of the document's own date again when it saves. Pure.
import { fyStartOf, seriesInFy } from "../financial-year";
import type { DoctypeLayout } from "./layout";

export function layoutInFy(layout: DoctypeLayout, date: Date | string = new Date()): DoctypeLayout {
  const start = fyStartOf(date);
  return {
    ...layout,
    fields: layout.fields.map((f) =>
      f.fieldname === "naming_series"
        ? { ...f, options: f.options ? f.options.split("\n").map((o) => seriesInFy(o, start)).join("\n") : f.options, default: f.default ? seriesInFy(f.default, start) : f.default }
        : f,
    ),
  };
}
