// A document between its form, the database and its timeline (Phase II, owner 21-11-2026), for
// the DocTypes drawn from the old site's captured layouts (./layouts):
//
//   docSchema      — what the form may send, typed by the layout (one zod schema for the browser and
//                    the server action, as CLAUDE.md asks); unknown fields are dropped;
//   missingFields  — Frappe's mandatory check (Document._validate_mandatory), with its messages;
//   legacyRow      — the document as the old site's own row, in text (the backup's form), so the
//                    importer's column mappers store a record saved here exactly as an imported one;
//   docSnapshot    — the document as a Version snapshot, for orders/version.ts's diff (the timeline).
// Pure.

import { z } from "zod";
import { dbDecimal } from "../calc/pymath";
import type { Cell, Snapshot } from "../orders/record";
import { dependsOn } from "./depends-on";
import { isTable, LAYOUT_TYPES, type DoctypeLayout, type LayoutField } from "./layout";
import { displayValue } from "./values";
import type { ChildLayouts } from "./visible";

export type Doc = Record<string, unknown>;

const DECIMAL_TYPES = new Set(["Float", "Currency", "Percent"]);
const INTEGER_TYPES = new Set(["Int", "Check", "Rating"]);
const LONG_TYPES = new Set(["Small Text", "Text", "Long Text", "Code", "Text Editor", "HTML Editor", "Markdown Editor", "JSON"]);
/** Field types that hold no value (Frappe's no_value_fields, tables apart). */
const NO_VALUE = new Set([...LAYOUT_TYPES, "HTML", "Button", "Image", "Fold", "Heading", "Table", "Table MultiSelect"]);
/** Frappe's standard fields a form sends back with its rows. */
const STANDARD = ["name", "idx", "docstatus", "modified", "__islocal"] as const;

const numberIn = (integer: boolean) =>
  z.preprocess((v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
    return typeof n === "number" && integer ? Math.trunc(n) : n;
  }, z.number({ invalid_type_error: "Enter a number" }).finite("Enter a number"));

const textIn = (max: number) => z.union([z.string().max(max), z.number(), z.null(), z.undefined()]).transform((v) => (v === null || v === undefined ? "" : String(v)));

function fieldSchema(f: LayoutField): z.ZodTypeAny {
  if (DECIMAL_TYPES.has(f.fieldtype)) return numberIn(false);
  if (INTEGER_TYPES.has(f.fieldtype)) return numberIn(true);
  if (f.fieldtype === "Date") return z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date"), z.literal(""), z.null(), z.undefined()]).transform((v) => v ?? "");
  if (f.fieldtype === "Time") return z.union([z.string().regex(/^\d{1,2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/, "Enter a time"), z.literal(""), z.null(), z.undefined()]).transform((v) => v ?? "");
  return textIn(LONG_TYPES.has(f.fieldtype) ? 200_000 : 1_000);
}

/** The form's document as the server accepts it: the layout's fields, typed; anything else dropped. */
export function docSchema(layout: DoctypeLayout, children: ChildLayouts): z.ZodType<Doc> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of layout.fields) {
    if (LAYOUT_TYPES.has(f.fieldtype) || f.fieldtype === "HTML" || f.fieldtype === "Button") continue;
    if (isTable(f)) {
      const child = children[f.options ?? ""];
      if (child) shape[f.fieldname] = z.array(docSchema(child, {})).max(2_000).optional().transform((v) => v ?? []);
      continue;
    }
    shape[f.fieldname] = fieldSchema(f).optional();
  }
  shape.name = textIn(140).optional();
  shape.idx = numberIn(true).optional();
  shape.docstatus = numberIn(true).optional();
  shape.modified = textIn(40).optional();
  shape.__islocal = z.union([z.literal(1), z.literal(0), z.boolean()]).optional();
  return z.object(shape).strip() as unknown as z.ZodType<Doc>;
}

/** Frappe's has_content: no value, or text with nothing left once the HTML is stripped (0 is a value). */
const empty = (f: LayoutField, v: unknown) => {
  if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) return true;
  if (typeof v !== "string") return false;
  const textLeft = v.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return !textLeft && !((f.fieldtype === "Text Editor" || f.fieldtype === "HTML Editor") && v.includes("<img"));
};

/**
 * Frappe's mandatory check: a required field (or one whose mandatory_depends_on holds) that is
 * shown and empty. Message keys are "fieldname" and "table.index.fieldname"; `summary` is Frappe's
 * "Missing Fields" message.
 */
export function missingFields(layout: DoctypeLayout, children: ChildLayouts, doc: Doc): { errors: Record<string, string>; summary: string | null } {
  const errors: Record<string, string> = {};
  const lines: string[] = [];
  const required = (f: LayoutField, row: Doc, parent?: Doc) =>
    (f.reqd || (!!f.mandatoryDependsOn && dependsOn(f.mandatoryDependsOn, { doc: row, parent }))) && dependsOn(f.dependsOn, { doc: row, parent });
  for (const f of layout.fields) {
    if (NO_VALUE.has(f.fieldtype) && !isTable(f)) continue;
    if (isTable(f)) {
      const child = children[f.options ?? ""];
      const rows = Array.isArray(doc[f.fieldname]) ? (doc[f.fieldname] as Doc[]) : [];
      if (required(f, doc) && !rows.length) {
        errors[f.fieldname] = `${f.label ?? f.fieldname} is mandatory`;
        lines.push(f.label ?? f.fieldname);
      }
      if (!child) continue;
      rows.forEach((row, i) => {
        const miss = child.fields.filter((c) => !NO_VALUE.has(c.fieldtype) && required(c, row, doc) && empty(c, row[c.fieldname]));
        for (const c of miss) errors[`${f.fieldname}.${i}.${c.fieldname}`] = `${c.label ?? c.fieldname} is mandatory`;
        if (miss.length) lines.push(`Row ${i + 1}: ${miss.map((c) => c.label ?? c.fieldname).join(", ")} (${f.label ?? f.fieldname})`);
      });
      continue;
    }
    if (required(f, doc) && empty(f, doc[f.fieldname])) {
      errors[f.fieldname] = `${f.label ?? f.fieldname} is mandatory`;
      lines.push(f.label ?? f.fieldname);
    }
  }
  return { errors, summary: lines.length ? `Missing Fields: Mandatory fields required in ${layout.doctype}: ${lines.join("; ")}` : null };
}

/** A value as the old site's row held it, in text (what the backup has): what the importer maps. */
function textOf(f: LayoutField | undefined, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (f && DECIMAL_TYPES.has(f.fieldtype)) return dbDecimal(typeof v === "number" ? v : Number(v) || 0);
  if (f && INTEGER_TYPES.has(f.fieldtype)) return String(Math.trunc(typeof v === "number" ? v : Number(v) || 0));
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v);
  return s === "" ? null : s;
}

/** The document (or a row) as the old site's row: every layout field and standard field, in text. */
export function legacyRow(layout: DoctypeLayout, doc: Doc, standard: Record<string, string | null> = {}): Record<string, string | null> {
  const byName = new Map(layout.fields.map((f) => [f.fieldname, f]));
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith("__") || Array.isArray(v)) continue;
    const f = byName.get(k);
    if (f && (LAYOUT_TYPES.has(f.fieldtype) || isTable(f))) continue;
    out[k] = textOf(f, v);
  }
  for (const f of layout.fields) if (!(f.fieldname in out) && !NO_VALUE.has(f.fieldtype)) out[f.fieldname] = INTEGER_TYPES.has(f.fieldtype) || DECIMAL_TYPES.has(f.fieldtype) ? textOf(f, 0) : null;
  return { ...out, ...standard };
}

/** The document as a Version snapshot: each field's stored value and its formatted one (get_formatted). */
export function docSnapshot(layout: DoctypeLayout, children: ChildLayouts, doc: Doc, currency: string): Snapshot {
  const cellsOf = (l: DoctypeLayout, row: Doc): Record<string, Cell> => {
    const out: Record<string, Cell> = {};
    for (const f of l.fields) {
      if (NO_VALUE.has(f.fieldtype)) continue;
      const v = row[f.fieldname];
      const raw = v === undefined || v === null || v === "" ? null : typeof v === "number" || typeof v === "string" ? v : String(v);
      // Frappe kept rich text as it was (blacklisted from formatting) and formatted the rest.
      const shown = raw === null || raw === 0 ? raw : f.fieldtype === "Text Editor" ? raw : displayValue(f, raw, currency);
      out[f.fieldname] = { raw, shown };
    }
    return out;
  };
  const tables: Snapshot["tables"] = {};
  for (const f of layout.fields) {
    if (!isTable(f)) continue;
    const child = children[f.options ?? ""];
    if (!child) continue;
    const rows = Array.isArray(doc[f.fieldname]) ? (doc[f.fieldname] as Doc[]) : [];
    tables[f.fieldname] = { doctype: child.doctype, rows: rows.map((r, i) => ({ name: String(r.name ?? ""), idx: i + 1, values: cellsOf(child, r) })) };
  }
  const ds = Number(doc.docstatus ?? 0);
  return { number: String(doc.name ?? ""), docStatus: (ds === 1 || ds === 2 ? ds : 0) as 0 | 1 | 2, header: cellsOf(layout, doc), tables };
}

/** Frappe's row name for a new child row: ten characters of [0-9a-z] (frappe.generate_hash, length 10). */
export function newRowName(): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");
}

/** A moment as the old site wrote it (its time zone, Asia/Kolkata): "2026-11-17 17:06:13.516877". */
export function siteDateTime(d: Date = new Date()): string {
  const t = new Date(d.getTime() + 330 * 60_000);
  const iso = t.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}.${String(t.getUTCMilliseconds() * 1000).padStart(6, "0")}`;
}

export { STANDARD as STANDARD_FIELDS };
