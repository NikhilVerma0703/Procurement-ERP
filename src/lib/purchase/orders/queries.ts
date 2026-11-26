// Reading Purchase Orders for the list screen and its export.
import "server-only";
import type { Prisma } from "@prisma/client";
import { LIKED_BY_FIELD, NO_LIKES, type LikeInfo } from "../like-rules";
import { likedByWhere, likesOf } from "../likes";
import { collabWhere, isCollabField } from "../collab/filters";
import { openAssignments } from "../collab/assignments";
import { tagsOf } from "../collab/tags";
import { db } from "../server/db";
import { PO_STATUS_KEYS, labelOf } from "./labels";
import { allFilters, type ListQuery } from "./list";
import { buildOrderBy, buildWhere, FILTER_TARGETS, SORT_COLUMNS } from "./list-where";

const WORKFLOW_LABEL = { CREATED: "Created", APPROVED: "Approved", REJECTED: "Rejected" } as const;
const DOCSTATUS_LABEL = { DRAFT: "Draft", SUBMITTED: "Submitted", CANCELLED: "Cancelled" } as const;

/** One row of the list: plain values, ready to send to the browser. */
export interface OrderListRow {
  id: string;
  number: string;
  supplierName: string;
  workflowState: string;
  docStatus: string;
  status: string;
  transactionDate: string;
  grandTotal: string;
  currency: { code: string; symbol: string | null; fractionUnits: number | null };
  perBilled: number;
  perReceived: number;
  updatedAt: string;
  /** Comments and e-mails on the PO (ERPNext's comment count). */
  comments: number;
  /** Its open assignments (the row's avatars). */
  assignees: { email: string; name: string }[];
  /** Its tags (Show Tags). */
  tags: string[];
  /** The row's heart: how many liked it, whether the viewer did, and who. */
  likes: LikeInfo;
}

const ROW_SELECT = {
  id: true,
  number: true,
  supplierName: true,
  workflowState: true,
  docStatus: true,
  status: true,
  transactionDate: true,
  grandTotal: true,
  currency: true,
  currencyRef: { select: { symbol: true, fractionUnits: true } },
  perBilled: true,
  perReceived: true,
  updatedAt: true,
} satisfies Prisma.PurchaseOrderSelect;

/** The list's conditions as one query. "Liked By" is answered from the likes table first. */
async function orderWhere(q: ListQuery): Promise<Prisma.PurchaseOrderWhereInput> {
  const filters = allFilters(q);
  const where = buildWhere(filters.filter((f) => f.field !== LIKED_BY_FIELD && !isCollabField(f.field)));
  const liked = filters.filter((f) => f.field === LIKED_BY_FIELD);
  // "Assigned To" and "Tags" are answered from the assignments and tags tables (collab/filters.ts).
  const collab = filters.filter((f) => isCollabField(f.field));
  if (!liked.length && !collab.length) return where;
  return {
    AND: [
      where,
      ...(await Promise.all(liked.map((f) => likedByWhere("orders", f)))),
      ...(await Promise.all(collab.map(async (f) => ({ id: await collabWhere("Purchase Order", f) })))),
    ],
  };
}

/**
 * Every PO the list's conditions select — all but those on `field` itself, as the sidebar's counts left
 * them out (frappe.desk.listview.get_group_by_count) — with its value of `field` (null: not set; none for
 * "assigned_to", whose counts come from the assignments).
 */
export async function orderFieldValues(q: ListQuery, field: string): Promise<{ id: string; value: string | null }[]> {
  const own = field === "assigned_to" ? "_assign" : field;
  const where = await orderWhere({
    ...q,
    quick: Object.fromEntries(Object.entries(q.quick).filter(([k]) => k !== own)),
    filters: q.filters.filter((f) => f.field !== own),
  });
  const t = FILTER_TARGETS[field];
  if (!t || t.kind === "item" || t.kind === "date" || t.kind === "datetime" || t.kind === "number") {
    return (await db.purchaseOrder.findMany({ where, select: { id: true } })).map((o) => ({ id: o.id, value: null }));
  }
  const select = t.kind === "text" && t.relation ? { id: true, [t.relation]: { select: { [t.column]: true } } } : { id: true, [t.column]: true };
  const rows = (await db.purchaseOrder.findMany({ where, select: select as never })) as unknown as Record<string, unknown>[];
  const labels = t.kind === "enum" ? new Map(Object.entries(t.keys).map(([label, key]) => [key, label])) : null;
  return rows.map((r) => {
    const raw = t.kind === "text" && t.relation ? (r[t.relation] as Record<string, unknown> | null)?.[t.column] : r[t.column];
    const value = raw === null || raw === undefined || raw === "" ? null : String(raw);
    return { id: String(r.id), value: labels && value ? labels.get(value) ?? value : value };
  });
}

/** The rows the list shows (the first `limit`) and how many match in all; `viewer` sees their own hearts filled. */
export async function listOrders(q: ListQuery, viewer: string): Promise<{ rows: OrderListRow[]; total: number }> {
  const where = await orderWhere(q);
  const [total, orders] = await Promise.all([
    db.purchaseOrder.count({ where }),
    db.purchaseOrder.findMany({ where, orderBy: buildOrderBy(q.sort, q.order), take: q.limit, select: ROW_SELECT }),
  ]);
  const ids = orders.map((o) => o.id);
  const [counts, likes, assigned, tags] = await Promise.all([
    ids.length
      ? db.purchaseOrderEvent.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, kind: { in: ["COMMENT", "EMAIL"] } }, _count: { _all: true } })
      : [],
    likesOf("orders", ids, viewer),
    openAssignments("Purchase Order", ids),
    tagsOf("Purchase Order", ids),
  ]);
  const commentCount = new Map(counts.map((c) => [c.orderId, c._count._all]));
  const rows = orders.map((o) => ({
    id: o.id,
    number: o.number,
    supplierName: o.supplierName,
    workflowState: WORKFLOW_LABEL[o.workflowState],
    docStatus: DOCSTATUS_LABEL[o.docStatus],
    status: labelOf(PO_STATUS_KEYS, o.status),
    transactionDate: o.transactionDate.toISOString(),
    grandTotal: o.grandTotal.toString(),
    currency: { code: o.currency, symbol: o.currencyRef.symbol, fractionUnits: o.currencyRef.fractionUnits },
    perBilled: Number(o.perBilled),
    perReceived: Number(o.perReceived),
    updatedAt: o.updatedAt.toISOString(),
    comments: commentCount.get(o.id) ?? 0,
    likes: likes[o.id] ?? NO_LIKES,
    assignees: assigned[o.id] ?? [],
    tags: tags[o.id] ?? [],
  }));
  return { rows, total };
}

/**
 * The form's ‹ › (Previous / Next Document): the PO next to this one in the list as the user last
 * left it, its filters and sort kept (frappe.desk.form.utils.get_next). "Next" follows the list's
 * order; "Previous" goes back. Strictly past this PO's value of the sort field, as Frappe compared;
 * null at the end of the list ("No further records").
 */
export async function adjacentOrderId(id: string, prev: boolean, q: ListQuery): Promise<string | null> {
  const column = SORT_COLUMNS[q.sort] as string;
  const current = (await db.purchaseOrder.findUnique({ where: { id }, select: { [column]: true } as Prisma.PurchaseOrderSelect })) as Record<string, unknown> | null;
  const value = current?.[column];
  if (value === null || value === undefined) return null;
  let order: "asc" | "desc" = q.order;
  let past: "gt" | "lt" = order === "asc" ? "gt" : "lt";
  if (prev) {
    order = order === "asc" ? "desc" : "asc";
    past = past === "gt" ? "lt" : "gt";
  }
  const where: Prisma.PurchaseOrderWhereInput = { AND: [await orderWhere(q), { [column]: { [past]: value } } as Prisma.PurchaseOrderWhereInput] };
  const next = await db.purchaseOrder.findFirst({ where, orderBy: { [column]: order } as Prisma.PurchaseOrderOrderByWithRelationInput, select: { id: true } });
  return next?.id ?? null;
}

/** What the Supplier and Company quick filters suggest as you type (their link values). */
export async function listFilterSuggestions(): Promise<{ suppliers: { code: string; name: string }[]; companies: string[] }> {
  const [suppliers, companies] = await Promise.all([
    db.purchaseSupplier.findMany({ select: { code: true, supplierName: true }, orderBy: { code: "asc" } }),
    db.purchaseCompany.findMany({ select: { code: true }, orderBy: { code: "asc" } }),
  ]);
  return { suppliers: suppliers.map((s) => ({ code: s.code, name: s.supplierName })), companies: companies.map((c) => c.code) };
}

/**
 * Every PO matching the list's filters, in its order, with what the export needs (no row limit). With
 * `ids`, only those POs (the selected rows' Actions → Export, which exported "name in" the selection).
 */
export async function ordersForExport(q: ListQuery, ids?: readonly string[]) {
  return db.purchaseOrder.findMany({
    where: ids ? { id: { in: [...ids] } } : await orderWhere(q),
    orderBy: buildOrderBy(q.sort, q.order),
    select: {
      number: true,
      supplier: { select: { code: true } },
      supplierName: true,
      transactionDate: true,
      scheduleDate: true,
      workflowState: true,
      status: true,
      currency: true,
      netTotal: true,
      totalTaxesAndCharges: true,
      grandTotal: true,
      roundedTotal: true,
      perReceived: true,
      perBilled: true,
      company: { select: { code: true } },
      taxCategory: { select: { code: true } },
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: { idx: "asc" },
        select: {
          idx: true,
          itemCode: true,
          itemName: true,
          qty: true,
          uom: true,
          rate: true,
          amount: true,
          scheduleDate: true,
          receivedQty: true,
          warehouse: { select: { code: true } },
        },
      },
    },
  });
}

export { WORKFLOW_LABEL, DOCSTATUS_LABEL };
