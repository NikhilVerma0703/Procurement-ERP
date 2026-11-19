// How a master screen (Supplier, Item, Address, Contact, the templates) is
// laid out, as Frappe drew a doctype's form from its definition: tabs, then
// sections (collapsible or not, shown on a condition), then columns of
// fields, and child tables. Each master writes its layout in ERPNext's field
// order and labels (masters/<name>/spec.ts); the form engine
// (components/purchase/masters/MasterForm.tsx) draws any of them, and the
// server checks a save with the same required fields (missingFields). Pure.

export type Value = string | number | boolean | null;
/** A child-table row: its values, and a key that stays with it while the form is open. */
export type Row = { _key: string } & Record<string, Value>;
export type Values = Record<string, Value | Row[]>;

export type FieldKind =
  | "data"
  | "text"
  | "select"
  | "link"
  | "check"
  | "date"
  | "int"
  | "float"
  | "currency"
  | "readonly"
  | "editor"
  /** Free text with suggestions (Frappe's Autocomplete: State takes India's states as options). */
  | "autocomplete";

export type When = (v: Values, isNew: boolean) => boolean;

export interface FieldSpec {
  label: string;
  kind: FieldKind;
  /** A Select's options; "" first for an empty choice. */
  options?: readonly string[];
  /** A Link's lookup (api/purchase/lookup?type=…). */
  link?: string;
  /** A Dynamic Link's lookup, from the row's values (Link Name follows Link Document Type). */
  linkOf?: (v: Values) => string | null;
  /** Extra lookup parameters from the form's values (a Link's set_query filters). */
  linkParams?: (v: Values) => Record<string, string | null>;
  required?: boolean | When;
  readOnly?: boolean | When;
  /** Frappe's depends_on. */
  showIf?: When;
  bold?: boolean;
  description?: string;
  decimals?: number;
  /** An Autocomplete's suggestions, from the form's values. */
  suggestions?: (v: Values) => readonly string[];
  /** A Data field's options: "Email" or "Phone" (Frappe checked their form on save). */
  format?: "Email" | "Phone";
}

export interface ColumnSpec extends FieldSpec {
  name: string;
  /** A Tailwind width class for the grid column. */
  width?: string;
}

export interface TableSpec {
  label: string;
  columns: ColumnSpec[];
  /** A new row's values (Frappe's defaults). */
  newRow: () => Record<string, Value>;
  showIf?: When;
  readOnly?: boolean | When;
}

export interface SectionSpec {
  label?: string;
  collapsible?: boolean;
  /** Collapsed sections start closed (Frappe) unless they hold a value. */
  columns: string[][];
  showIf?: When;
  /** Content the screen draws itself (a supplier's addresses and contacts), in place of fields. */
  slot?: string;
}

export interface TabSpec {
  label: string;
  sections: SectionSpec[];
  showIf?: When;
}

export interface MasterSpec {
  /** "Supplier", "Item", … */
  doctype: string;
  fields: Record<string, FieldSpec>;
  tables?: Record<string, TableSpec>;
  tabs: TabSpec[];
}

const truth = (x: boolean | When | undefined, v: Values, isNew: boolean) => (typeof x === "function" ? x(v, isNew) : Boolean(x));

export const isShown = (f: { showIf?: When }, v: Values, isNew: boolean) => !f.showIf || f.showIf(v, isNew);
export const isRequired = (f: FieldSpec, v: Values, isNew: boolean) => truth(f.required, v, isNew);
export const isReadOnly = (f: { readOnly?: boolean | When }, v: Values, isNew: boolean) => truth(f.readOnly, v, isNew);

/** Is a value empty, as Frappe's mandatory check saw it? */
export const isEmpty = (x: Value | Row[] | undefined) => x === null || x === undefined || (typeof x === "string" && x.trim() === "") || (Array.isArray(x) && x.length === 0);

/**
 * The mandatory fields left empty, by label, in the form's order, and the rows' (Frappe:
 * "Missing Fields: Supplier Name, …"; a row's as "Row #2: UOM"). Hidden fields do not count.
 */
export function missingFields(spec: MasterSpec, v: Values, isNew: boolean): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (const tab of spec.tabs) {
    if (!isShown(tab, v, isNew)) continue;
    for (const section of tab.sections) {
      if (!isShown(section, v, isNew)) continue;
      for (const name of section.columns.flat()) {
        const f = spec.fields[name];
        if (f) {
          if (isShown(f, v, isNew) && isRequired(f, v, isNew) && isEmpty(v[name] as Value)) out.push({ key: name, label: f.label });
          continue;
        }
        const t = spec.tables?.[name];
        if (!t || !isShown(t, v, isNew)) continue;
        const rows = (v[name] as Row[] | undefined) ?? [];
        rows.forEach((row, i) => {
          for (const c of t.columns) {
            if (isRequired(c, { ...v, ...row }, isNew) && isEmpty(row[c.name])) out.push({ key: `${name}.${i}.${c.name}`, label: `Row #${i + 1}: ${c.label} (${t.label})` });
          }
        });
      }
    }
  }
  return out;
}

/** A new row with a fresh key. */
export function newRow(t: TableSpec, key: string): Row {
  return { ...t.newRow(), _key: key };
}
