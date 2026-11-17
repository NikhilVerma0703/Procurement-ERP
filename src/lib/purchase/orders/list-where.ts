// The list's conditions as a database query, with ERPNext's meaning:
//   * text compares without regard to case (MariaDB's collation on the old site);
//   * "Not Equals", "Not Like" and "Not In" also match an empty field (Frappe
//     wraps those in ifnull(field, ''));
//   * "Like" takes % wildcards ("%jeon%" = contains "jeon");
//   * "Is set" means not empty;
//   * a date on a timestamp (Created On, Last Updated On) is a whole day in
//     the old site's time zone;
//   * an item-row condition holds when any row of the PO matches.
// Pure (type-only Prisma import), so it is unit-tested without a database.
import type { Prisma } from "@prisma/client";
import { PO_STATUS_KEYS } from "./labels";
import type { ListFilter, SortKey } from "./list";
import { siteDayStart } from "../format";

type Where = Prisma.PurchaseOrderWhereInput;
type Leaf = Record<string, unknown>;

type Target =
  /** A text column of the PO, or `relation.column`. */
  | { kind: "text"; column: string; relation?: string; nullable: boolean }
  /** A select stored as an enum: label → key. */
  | { kind: "enum"; column: string; keys: Record<string, string> }
  | { kind: "date"; column: string; nullable: boolean }
  | { kind: "datetime"; column: string }
  | { kind: "number"; column: string }
  /** A text column of the item rows. */
  | { kind: "item"; column: string; nullable: boolean };

const TARGETS: Record<string, Target> = {
  name: { kind: "text", column: "number", nullable: false },
  supplier: { kind: "text", relation: "supplier", column: "code", nullable: false },
  supplier_name: { kind: "text", column: "supplierName", nullable: false },
  company: { kind: "text", relation: "company", column: "code", nullable: false },
  status: { kind: "enum", column: "status", keys: PO_STATUS_KEYS },
  workflow_state: { kind: "enum", column: "workflowState", keys: { Created: "CREATED", Approved: "APPROVED", Rejected: "REJECTED" } },
  docstatus: { kind: "enum", column: "docStatus", keys: { Draft: "DRAFT", Submitted: "SUBMITTED", Cancelled: "CANCELLED" } },
  transaction_date: { kind: "date", column: "transactionDate", nullable: false },
  schedule_date: { kind: "date", column: "scheduleDate", nullable: true },
  currency: { kind: "text", column: "currency", nullable: false },
  net_total: { kind: "number", column: "netTotal" },
  grand_total: { kind: "number", column: "grandTotal" },
  rounded_total: { kind: "number", column: "roundedTotal" },
  per_received: { kind: "number", column: "perReceived" },
  per_billed: { kind: "number", column: "perBilled" },
  tax_category: { kind: "text", relation: "taxCategory", column: "code", nullable: true },
  taxes_and_charges: { kind: "text", relation: "taxesAndCharges", column: "code", nullable: true },
  set_warehouse: { kind: "text", relation: "setWarehouse", column: "code", nullable: true },
  custom_shipment_type: { kind: "text", column: "shipmentType", nullable: true },
  custom_mode_of_transport: { kind: "text", column: "modeOfTransport", nullable: true },
  custom_purpose_of_purchase: { kind: "text", column: "purposeOfPurchase", nullable: true },
  owner: { kind: "text", column: "createdBy", nullable: true },
  modified_by: { kind: "text", column: "updatedBy", nullable: true },
  creation: { kind: "datetime", column: "createdAt" },
  modified: { kind: "datetime", column: "updatedAt" },
  item_code: { kind: "item", column: "itemCode", nullable: false },
  item_name: { kind: "item", column: "itemName", nullable: false },
  material_request: { kind: "item", column: "materialRequest", nullable: true },
};

const NEVER: Where = { id: { in: [] } };
const ci = { mode: "insensitive" as const };

/** SQL LIKE with % wildcards, as Prisma string filters (an inner % keeps each piece in turn). */
function likeLeaf(pattern: string): Leaf | Leaf[] {
  const starts = pattern.startsWith("%");
  const ends = pattern.endsWith("%") && pattern.length > 1;
  const body = pattern.slice(starts ? 1 : 0, ends ? -1 : undefined);
  const pieces = body.split("%").filter(Boolean);
  if (!pieces.length) return { not: null };
  if (pieces.length > 1) return pieces.map((p) => ({ contains: p, ...ci }));
  const [p] = pieces;
  if (starts && ends) return { contains: p, ...ci };
  if (starts) return { endsWith: p, ...ci };
  if (ends) return { startsWith: p, ...ci };
  return { equals: p, ...ci };
}

/** Builds the condition on one text column; `wrap` places it (PO column, relation or item row). */
function textWhere<W>(op: ListFilter["op"], value: ListFilter["value"], nullable: boolean, wrap: (leaf: Leaf) => W): W {
  const v = value as string;
  const list = value as string[];
  const w = (x: unknown) => x as W;
  const orEmpty = (cond: W): W => w(nullable ? { OR: [wrap({ equals: null }), wrap({ equals: "" }), cond] } : { OR: [wrap({ equals: "" }), cond] });
  switch (op) {
    case "=":
      return wrap({ equals: v, ...ci });
    case "!=":
      return orEmpty(w({ NOT: wrap({ equals: v, ...ci }) }));
    case "like": {
      const leaf = likeLeaf(v);
      return Array.isArray(leaf) ? w({ AND: leaf.map(wrap) }) : wrap(leaf);
    }
    case "not like": {
      const leaf = likeLeaf(v);
      return orEmpty(w({ NOT: Array.isArray(leaf) ? { AND: leaf.map(wrap) } : wrap(leaf) }));
    }
    case "in":
      return wrap({ in: list, ...ci });
    case "not in":
      return orEmpty(w({ NOT: wrap({ in: list, ...ci }) }));
    case "is":
      return v === "set"
        ? w({ AND: [...(nullable ? [{ NOT: wrap({ equals: null }) }] : []), { NOT: wrap({ equals: "" }) }] })
        : nullable
          ? w({ OR: [wrap({ equals: null }), wrap({ equals: "" })] })
          : wrap({ equals: "" });
    default:
      return w({ id: { in: [] } });
  }
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayDate = (s: string) => new Date(`${s}T00:00:00Z`);
const nextDay = (d: Date, days = 1) => new Date(d.getTime() + days * 86400000);

function rangeWhere(t: Extract<Target, { kind: "date" | "datetime" | "number" }>, op: ListFilter["op"], value: ListFilter["value"]): Where {
  const col = (leaf: Leaf): Where => ({ [t.column]: leaf }) as Where;
  if (op === "is") {
    const nullable = t.kind === "date" && t.nullable;
    if (!nullable) return value === "set" ? {} : NEVER;
    return value === "set" ? col({ not: null }) : col({ equals: null });
  }
  if (t.kind === "number") {
    const n = (s: string) => Number(s);
    const vals = (Array.isArray(value) ? value : [value]).map(n);
    if (vals.some((x) => !Number.isFinite(x))) return NEVER;
    const [a, b] = vals;
    switch (op) {
      case "=": return col({ equals: a });
      case "!=": return { NOT: col({ equals: a }) };
      case ">": return col({ gt: a });
      case "<": return col({ lt: a });
      case ">=": return col({ gte: a });
      case "<=": return col({ lte: a });
      case "between": return col({ gte: Math.min(a, b), lte: Math.max(a, b) });
      default: return NEVER;
    }
  }
  const days = Array.isArray(value) ? value : [value];
  if (!days.every(isDay)) return NEVER;
  const [a, b] = [...days].sort();
  if (t.kind === "date") {
    const d = dayDate(a);
    switch (op) {
      case "=": return col({ equals: d });
      case "!=": return t.nullable ? { OR: [col({ equals: null }), { NOT: col({ equals: d }) }] } : { NOT: col({ equals: d }) };
      case ">": return col({ gt: d });
      case "<": return col({ lt: d });
      case ">=": return col({ gte: d });
      case "<=": return col({ lte: d });
      case "between": return col({ gte: d, lte: dayDate(b) });
      default: return NEVER;
    }
  }
  // A day on a timestamp: from its first instant in the site's zone to the next day's.
  const start = siteDayStart(a);
  const end = nextDay(start);
  switch (op) {
    case "=": return col({ gte: start, lt: end });
    case "!=": return { OR: [col({ lt: start }), col({ gte: end })] };
    case ">": return col({ gte: end });
    case "<": return col({ lt: start });
    case ">=": return col({ gte: start });
    case "<=": return col({ lt: end });
    case "between": return col({ gte: start, lt: nextDay(siteDayStart(b)) });
    default: return NEVER;
  }
}

function enumWhere(t: Extract<Target, { kind: "enum" }>, op: ListFilter["op"], value: ListFilter["value"]): Where {
  const col = (leaf: Leaf): Where => ({ [t.column]: leaf }) as Where;
  const key = (label: string) => t.keys[label];
  switch (op) {
    case "=": return key(value as string) ? col({ equals: key(value as string) }) : NEVER;
    case "!=": return key(value as string) ? { NOT: col({ equals: key(value as string) }) } : {};
    case "in": return col({ in: (value as string[]).map(key).filter(Boolean) });
    case "not in": return { NOT: col({ in: (value as string[]).map(key).filter(Boolean) }) };
    case "is": return value === "set" ? {} : NEVER;
    default: return NEVER;
  }
}

/** One condition as a query; an unknown field or operator matches nothing. */
export function filterWhere(f: ListFilter): Where {
  const t = TARGETS[f.field];
  if (!t) return NEVER;
  switch (t.kind) {
    case "text": {
      const wrap = (leaf: Leaf): Where => (t.relation ? { [t.relation]: { [t.column]: leaf } } : { [t.column]: leaf }) as Where;
      // An empty optional link ("is not set") is a missing relation, not an empty string.
      if (t.relation && t.nullable && f.op === "is") {
        return (f.value === "set" ? { [t.relation]: { isNot: null } } : { [t.relation]: { is: null } }) as Where;
      }
      if (t.relation && t.nullable && (f.op === "!=" || f.op === "not like" || f.op === "not in")) {
        return { OR: [{ [t.relation]: { is: null } } as Where, textWhere(f.op, f.value, false, wrap)] };
      }
      return textWhere(f.op, f.value, t.relation ? false : t.nullable, wrap);
    }
    case "item":
      return { items: { some: textWhere(f.op, f.value, t.nullable, (leaf) => ({ [t.column]: leaf }) as Prisma.PurchaseOrderItemWhereInput) } };
    case "enum":
      return enumWhere(t, f.op, f.value);
    default:
      return rangeWhere(t, f.op, f.value);
  }
}

/** All the conditions; every one must hold. */
export function buildWhere(filters: readonly ListFilter[]): Where {
  return filters.length ? { AND: filters.map(filterWhere) } : {};
}

const SORT_COLUMNS: Record<SortKey, keyof Prisma.PurchaseOrderOrderByWithRelationInput> = {
  modified: "updatedAt",
  name: "number",
  creation: "createdAt",
  supplier_name: "supplierName",
  transaction_date: "transactionDate",
  schedule_date: "scheduleDate",
  grand_total: "grandTotal",
  per_received: "perReceived",
  per_billed: "perBilled",
};

/** The sort, then the ID, so equal values keep a fixed order between pages. */
export function buildOrderBy(sort: SortKey, order: "asc" | "desc"): Prisma.PurchaseOrderOrderByWithRelationInput[] {
  const column = SORT_COLUMNS[sort];
  const first = sort === "schedule_date" ? { [column]: { sort: order, nulls: "last" } } : { [column]: order };
  return column === "number" ? [first] : [first, { number: order }];
}
