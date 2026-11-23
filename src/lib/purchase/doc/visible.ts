// What a read-only form shows, as the old site's Frappe form showed it (Phase II, owner 21-11-2026).
//
// From the captured layout (./layouts) and the document: the tabs, sections and columns in the old
// order; fields hidden by the layout, by their show/hide condition (./depends-on.ts) or by the form's
// script (the caller's rules — e.g. ./transaction.ts) are not shown; Frappe's read-only rules — an
// empty field is not drawn (a checkbox always is), a section with nothing left is not drawn, a tab
// with nothing is not drawn; a grid shows the child's in-list-view columns within Frappe's width
// budget. Pure, so it can be checked against the old forms' own text.

import { htmlIsEmpty } from "../html";
import { dependsOn } from "./depends-on";
import { isTable, structure, type DoctypeLayout, type LayoutField } from "./layout";
import { hasValue } from "./values";

export type Row = Record<string, unknown>;

/** The child tables' layouts, by DocType (the server passes lib/purchase/doc/layouts; a client form only those it needs). */
export type ChildLayouts = Readonly<Record<string, DoctypeLayout | undefined>>;

export interface FormRules {
  /** A field's label as the old form's script set it; `table` is the child table's fieldname. */
  label?: (table: string | null, f: LayoutField) => string | undefined;
  /** Fields the old form's script hid. */
  hidden?: (table: string | null, f: LayoutField) => boolean;
  /**
   * An editable form (a draft, or a submitted document's allow-on-submit fields): a field the user
   * may type in is drawn even when empty, a table even without rows (Frappe hid only read-only
   * fields with no value — base_control.js get_status, "Hide Read-only, null fields").
   */
  editable?: (table: string | null, f: LayoutField) => boolean;
  /** A child row drawn as a form (the grid's row editor): its conditions also see the parent document. */
  parent?: Row;
}

/** Field types with nothing to show read-only. */
export const SKIP_TYPES = new Set(["HTML", "Button", "Fold", "Image", "Geolocation", "Signature", "Barcode", "Password"]);
export const HTML_TYPES = new Set(["Text Editor", "HTML Editor"]);
export const TEXT_TYPES = new Set(["Small Text", "Text", "Long Text", "Code"]);
const BREAKS = new Set(["Section Break", "Column Break", "Tab Break"]);

export interface ShownGrid {
  doctype: string;
  columns: { field: LayoutField; label: string }[];
  rows: Row[];
}

export interface ShownField {
  field: LayoutField;
  label: string;
  value: unknown;
  grid?: ShownGrid;
}

export interface ShownSection {
  label: string | null;
  collapsible: boolean;
  /** Frappe opened a collapsible section only when its collapsible_depends_on held. */
  open: boolean;
  columns: ShownField[][];
}

export interface ShownTab {
  label: string;
  sections: ShownSection[];
}

/**
 * The grid's columns as Frappe chose them (grid.js setup_visible_columns): the child's in-list-view
 * fields in order, each taking its "columns" width (else 2; Small Text 3, Check 1), until the widths
 * pass 11 — the rest are not shown in the grid.
 */
export function gridColumns(fields: readonly LayoutField[], hidden: (f: LayoutField) => boolean = () => false): LayoutField[] {
  const out: LayoutField[] = [];
  let total = 1;
  for (const c of fields) {
    if (!c.inListView || c.hidden || hidden(c) || BREAKS.has(c.fieldtype)) continue;
    total += c.columns || (c.fieldtype === "Small Text" ? 3 : c.fieldtype === "Check" ? 1 : 2);
    if (total > 11) break;
    out.push(c);
  }
  return out;
}

const labelOf = (rules: FormRules, table: string | null, f: LayoutField) => rules.label?.(table, f) ?? f.label ?? f.fieldname;

/**
 * Frappe's own clean-up of a saved form (form.js cleanup_refresh): the naming series is hidden once
 * the document has its name, so is the field a "field:" name came from, and Amended From unless set.
 */
function savedFormHides(layout: DoctypeLayout, f: LayoutField, doc: Row): boolean {
  if (f.fieldname === "amended_from") return !doc.amended_from;
  if (doc.__islocal) return false; // a new document still chooses its naming series
  if (layout.autoname === "naming_series:" && f.fieldname === "naming_series") return true;
  if (layout.autoname?.startsWith("field:") && f.fieldname === layout.autoname.slice(6)) return !!doc[f.fieldname];
  return false;
}

function shown(rules: FormRules, f: LayoutField, doc: Row, layout: DoctypeLayout, childLayouts: ChildLayouts): ShownField | null {
  if (f.hidden || SKIP_TYPES.has(f.fieldtype) || rules.hidden?.(null, f) || savedFormHides(layout, f, doc)) return null;
  if (!dependsOn(f.dependsOn, { doc, parent: rules.parent })) return null;
  const value = doc[f.fieldname];
  const editable = !!rules.editable?.(null, f);
  if (isTable(f)) {
    const rows = Array.isArray(value) ? (value as Row[]) : [];
    const child = childLayouts[f.options ?? ""];
    if ((!rows.length && !editable) || !child) return null;
    const columns = gridColumns(child.fields, (c) => !!rules.hidden?.(f.fieldname, c)).map((c) => ({ field: c, label: labelOf(rules, f.fieldname, c) }));
    return { field: f, label: labelOf(rules, null, f), value, grid: { doctype: child.doctype, columns, rows } };
  }
  if (f.fieldtype === "Heading") return { field: f, label: labelOf(rules, null, f), value: null };
  if (!editable && (!hasValue(f, value) || (HTML_TYPES.has(f.fieldtype) && htmlIsEmpty(String(value))))) return null;
  return { field: f, label: labelOf(rules, null, f), value };
}

export function visibleForm(layout: DoctypeLayout, doc: Row, rules: FormRules, childLayouts: ChildLayouts): ShownTab[] {
  const out: ShownTab[] = [];
  for (const t of structure(layout)) {
    if (!dependsOn(t.dependsOn, { doc, parent: rules.parent })) continue;
    const sections: ShownSection[] = [];
    for (const s of t.sections) {
      if (!dependsOn(s.dependsOn, { doc, parent: rules.parent })) continue;
      const columns = s.columns.map((c) => c.map((f) => shown(rules, f, doc, layout, childLayouts)).filter((x): x is ShownField => x !== null)).filter((c) => c.length);
      if (!columns.length) continue;
      sections.push({
        label: s.label,
        collapsible: s.collapsible,
        open: !s.collapsible || (!!s.collapsibleDependsOn && dependsOn(s.collapsibleDependsOn, { doc })),
        columns,
      });
    }
    out.push({ label: t.label, sections });
  }
  return out;
}

/** A row's value in a grid column is shown only when its condition holds for that row. */
export const cellShown = (f: LayoutField, row: Row, parent: Row) => dependsOn(f.dependsOn, { doc: row, parent });
