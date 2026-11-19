// What a master's form sends, checked and cleaned against its layout before
// any of the master's own rules run — the checks Frappe made on every save
// of any doctype: a Select holds one of its options, a Data or Link field
// holds at most 140 characters, a number is a number, a date a date, and the
// name of a new record is a name Frappe would accept. Only the layout's own
// fields and tables come through; anything else the browser sends is dropped.
// Pure.
import { z } from "zod";
import { isEmailAddress } from "../notify/compose";
import { isEmpty, missingFields, type FieldSpec, type MasterSpec, type Row, type Value, type Values } from "./spec";

const scalar = z.union([z.string().max(200_000), z.number().finite(), z.boolean(), z.null()]);
const row = z.record(z.string().max(64), scalar);

/** The shape of any master form's values, bounded. */
export const valuesInput = z.record(z.string().max(64), z.union([scalar, z.array(row).max(1000)]));

/** Frappe's Data, Link and Select columns were varchar(140). */
export const DATA_MAX = 140;

export interface Cleaned {
  values: Values;
  /** By field ("supplier_name") or row cell ("uoms.0.uom"). */
  errors: Record<string, string>;
}

function cleanScalar(f: FieldSpec, raw: unknown): { v: Value; error?: string } {
  switch (f.kind) {
    case "check":
      return { v: raw === true || raw === 1 || raw === "1" };
    case "int":
    case "float":
    case "currency": {
      if (raw === null || raw === undefined || raw === "") return { v: null };
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      if (!Number.isFinite(n)) return { v: null, error: `${f.label} must be a number` };
      return { v: f.kind === "int" ? Math.trunc(n) : n };
    }
    case "date": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) return { v: null };
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
      return ok ? { v: s } : { v: null, error: `${f.label}: ${s} is not a valid date` };
    }
    default: {
      const s = raw === null || raw === undefined ? "" : String(raw);
      // An editor's HTML is kept as written; every other text is trimmed, as Frappe did.
      const t = f.kind === "editor" ? s : s.trim();
      if (!t.trim()) return { v: null };
      if ((f.kind === "data" || f.kind === "link" || f.kind === "select" || f.kind === "autocomplete") && t.length > DATA_MAX) {
        return { v: t, error: `${f.label} will get truncated, as max characters allowed is ${DATA_MAX}` };
      }
      // Frappe's _validate_data_fields: a Data field of options Email holds addresses (comma-separated),
      // of options Phone a number of digits and + - _ , . * # ( ) and spaces, at most 20.
      if (f.format === "Email") {
        const bad = t.split(/[,;]/).map((e) => e.trim()).filter(Boolean).find((e) => !isEmailAddress(e));
        if (bad) return { v: t, error: `${bad} is not a valid Email Address` };
      }
      if (f.format === "Phone" && !/^[0-9 +_\-,.*#()]{1,20}$/.test(t)) return { v: t, error: `${t} is not a valid Phone Number` };
      if (f.kind === "select" && f.options && !f.options.includes(t)) {
        return { v: t, error: `${f.label} cannot be "${t}". It should be one of "${f.options.filter(Boolean).join('", "')}"` };
      }
      return { v: t };
    }
  }
}

/** The form's values, cleaned field by field (read-only fields included: the server recomputes those). */
export function cleanValues(spec: MasterSpec, raw: unknown): Cleaned | { invalid: string } {
  const parsed = valuesInput.safeParse(raw);
  if (!parsed.success) return { invalid: "The form sent something unexpected. Reload it and try again." };
  const input = parsed.data;
  const values: Values = {};
  const errors: Record<string, string> = {};
  for (const [name, f] of Object.entries(spec.fields)) {
    const r = cleanScalar(f, Array.isArray(input[name]) ? null : input[name]);
    values[name] = r.v;
    if (r.error) errors[name] = r.error;
  }
  for (const [name, t] of Object.entries(spec.tables ?? {})) {
    const rows = Array.isArray(input[name]) ? (input[name] as Record<string, unknown>[]) : [];
    values[name] = rows.map((r, i): Row => {
      const out: Row = { _key: typeof r._key === "string" ? r._key.slice(0, 64) : `row-${i}` };
      for (const c of t.columns) {
        const x = cleanScalar(c, r[c.name]);
        out[c.name] = x.v;
        if (x.error) errors[`${name}.${i}.${c.name}`] = `Row #${i + 1}: ${x.error}`;
      }
      return out;
    });
  }
  return { values, errors };
}

/** The layout's mandatory fields left empty, as field errors and Frappe's message. */
export function mandatoryErrors(spec: MasterSpec, v: Values, isNew: boolean): { errors: Record<string, string>; message: string | null } {
  const missing = missingFields(spec, v, isNew);
  const errors: Record<string, string> = {};
  for (const m of missing) errors[m.key] = `${m.label.replace(/^Row #\d+: /, "").replace(/ \(.*\)$/, "")} is required`;
  return { errors, message: missing.length ? `Mandatory fields required in ${spec.doctype}: ${missing.map((m) => m.label).join(", ")}` : null };
}

/**
 * Frappe's validate_name: the name of a new record, trimmed, without "<" or ">", and not the
 * doctype's own name. Returns the name or the refusal.
 */
export function checkNewName(doctype: string, raw: string | null | undefined): { name: string } | { problem: string } {
  const name = String(raw ?? "").trim();
  if (!name) return { problem: `No Name Specified for ${doctype}` };
  if (name === doctype) return { problem: `Name of ${doctype} cannot be ${name}` };
  if (/[<>]/.test(name)) return { problem: "Name cannot contain special characters like '<', '>'" };
  if (name.length > DATA_MAX) return { problem: `Name will get truncated, as max characters allowed is ${DATA_MAX}` };
  return { name };
}

/** Typed reads of cleaned values. */
export const str = (v: Values, k: string): string | null => {
  const x = v[k];
  return typeof x === "string" && x.trim() !== "" ? x : null;
};
export const flag = (v: Values, k: string): boolean => v[k] === true;
export const num = (v: Values, k: string): number | null => (typeof v[k] === "number" ? (v[k] as number) : null);
export const rowsOf = (v: Values, k: string): Row[] => (Array.isArray(v[k]) ? (v[k] as Row[]) : []);
export const rstr = (r: Row, k: string): string | null => (typeof r[k] === "string" && (r[k] as string).trim() !== "" ? (r[k] as string) : null);
export const rnum = (r: Row, k: string): number | null => (typeof r[k] === "number" ? (r[k] as number) : null);
export const rflag = (r: Row, k: string): boolean => r[k] === true;
export { isEmpty };

/** parse_full_name (ERPNext's customer.py): first word, the middle words, the last word. */
export function parseFullName(full: string): { first: string; middle: string | null; last: string | null } {
  const names = full.trim().split(/\s+/);
  return { first: names[0] ?? "", middle: names.length > 2 ? names.slice(1, -1).join(" ") : null, last: names.length > 1 ? names[names.length - 1] : null };
}
