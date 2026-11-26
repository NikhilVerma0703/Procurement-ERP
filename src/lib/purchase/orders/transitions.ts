// The workflow actions on a stored PO: Approve / Reject (submit), Cancel,
// Close / Hold / Resume / Re-open, Delete, and Update (the fields allowed
// after submit). Each runs in one transaction on the locked PO row, re-checks
// that the user may do it in the PO's present state (workflow.ts), refuses a
// PO changed since the form was opened, and records the history lines the old
// site recorded (seen in the imported history):
//   * Approve / Reject: a Label (the new status), a Version (workflow_state,
//     status, docstatus and any figure the re-check recomputed), a Workflow
//     line ("Approved" / "Rejected");
//   * Cancel: a Version (status → Cancelled, docstatus 1 → 2);
//   * Close / Hold / Resume / Re-open: a Label; Hold first records its reason
//     as a comment ("Reason for hold: …"), as the original's dialog did;
//   * Delete: a "Deleted" line that keeps the PO's last content (Frappe kept it
//     as a Deleted Document); the number is given back when it was the last;
//   * Update: a Version;
//   * Update Items: a Version (and a Label when the status moves).
// Submitting re-validates and recomputes the draft exactly as a save does
// (ERPNext ran validate on submit). Approving or cancelling updates the
// items' Last Purchase Rate (Buying Settings left it on).
import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { purchaseCan } from "../access";
import { purchaseOrderStatus, type PoStatus } from "../calc/index";
import { dbDecimal } from "../calc/pymath";
import { recordOrderEvent } from "../server/audit";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import type { ActionResult } from "./form-schema";
import { PO_STATUS_KEYS, labelOf } from "./labels";
import { currencyDisplay, orderRecord } from "./load";
import { DOC_STATUS_LABEL, orderFormValues, orderSnapshot, WORKFLOW_STATE_LABEL, type OrderRecord } from "./record";
import { assertUnchanged, prepareOrder, recordVersion, UserError, writeDraft } from "./save";
import { itemDetails, uomFactor } from "./masters";
import { BUYING_SETTINGS } from "./settings";
import { ACTION_NEEDS, stateAllows, type PoAction, type PoState } from "./workflow";
import { refreshMaterialRequestsOrdered } from "../stock/material-request";
import { siteDateTime } from "../doc/store";

type Tx = Prisma.TransactionClient;
const n = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));

/** Document types the PO points at (its sources); every other linked type points at the PO. */
const SOURCES = new Set(["Material Request", "Supplier Quotation", "Sales Order", "Project", "BOM", "Production Plan", "Blanket Order", "Auto Repeat"]);
/** Statuses of a linked document that is not submitted. */
const NOT_SUBMITTED = new Set(["Draft", "Cancelled"]);

export function poStateOf(o: Pick<OrderRecord, "docStatus" | "workflowState" | "status" | "perReceived" | "perBilled">, amended = false): PoState {
  return {
    docStatus: DOC_STATUS_LABEL[o.docStatus],
    workflowState: WORKFLOW_STATE_LABEL[o.workflowState],
    status: labelOf(PO_STATUS_KEYS, o.status),
    perReceived: n(o.perReceived),
    perBilled: n(o.perBilled),
    amended,
  };
}

export interface ActionRequest {
  id: string;
  /** The PO's "last updated" when the form was opened. */
  expectedUpdatedAt?: string;
}

interface Step {
  tx: Tx;
  before: OrderRecord;
  by: string;
  /** Increasing times for one action's history lines (they keep their order on the timeline). */
  at: (i: number) => Date;
}

const VERB: Record<PoAction, string> = {
  save: "saved", approve: "approved", reject: "rejected", delete: "deleted", duplicate: "duplicated",
  cancel: "cancelled", amend: "amended", close: "closed", hold: "put on hold", resume: "resumed",
  reopen: "re-opened", update: "updated", updateItems: "updated", makeReceipt: "received",
};

/** Runs one action on a locked PO: who may, in which state, unchanged since opened. */
async function onOrder(user: PurchaseUser, req: ActionRequest, action: PoAction, fn: (s: Step) => Promise<void>): Promise<ActionResult> {
  if (!purchaseCan(user, ACTION_NEEDS[action])) return { ok: false, error: `You are not permitted to do this (${VERB[action]}).` };
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`select id from purchase_orders where id = ${req.id} for update`;
        const before = await orderRecord(req.id, tx);
        if (!before) throw new UserError("This Purchase Order no longer exists.");
        const state = poStateOf(before);
        if (!stateAllows(state, action)) throw new UserError(`${before.number} cannot be ${VERB[action]} while it is ${state.docStatus === "Draft" ? "a draft" : state.status}.`);
        assertUnchanged(before.updatedAt, req.expectedUpdatedAt);
        const t0 = Date.now();
        await fn({ tx, before, by: user.email, at: (i) => new Date(t0 + i) });
      },
      { timeout: 30000 },
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

/** set_status: a Label line when the status changes (never for Cancelled). */
async function labelIfChanged(s: Step, from: PoStatus, to: PoStatus, i = 0) {
  if (from === to || to === "Cancelled") return;
  await recordOrderEvent(s.tx, { orderId: s.before.id, orderNumber: s.before.number, kind: "LABEL", byEmail: s.by, content: to, at: s.at(i) });
}

const statusOf = (o: Pick<OrderRecord, "status">) => labelOf(PO_STATUS_KEYS, o.status);

// ---------------------------------------------------------------------------
// Approve / Reject
// ---------------------------------------------------------------------------

/**
 * The workflow's two transitions from Created: both submit the PO (the old workflow gave
 * Rejected doc status 1 too, and its status follows ERPNext's rules: To Receive and Bill).
 */
export async function submitOrder(user: PurchaseUser, req: ActionRequest, decision: "approve" | "reject"): Promise<ActionResult> {
  const stored = await orderRecord(req.id);
  if (!stored) return { ok: false, error: "This Purchase Order no longer exists." };
  const prepared = await prepareOrder(orderFormValues(stored));
  if (!prepared.ok) return { ok: false, error: prepared.error, fieldErrors: prepared.fieldErrors };

  return onOrder(user, req, decision, async (s) => {
    if (s.before.updatedAt.getTime() !== stored.updatedAt.getTime()) {
      throw new UserError("This Purchase Order was changed by someone else after you opened it. Reload it to see the changes.");
    }
    const from = statusOf(s.before);
    const to = purchaseOrderStatus({ docStatus: 1, status: from, perReceived: n(s.before.perReceived), perBilled: n(s.before.perBilled) });
    await writeDraft(s.tx, s.before.id, prepared.value, s.by, {
      docStatus: "SUBMITTED",
      workflowState: decision === "approve" ? "APPROVED" : "REJECTED",
      status: PO_STATUS_KEYS[to],
    });
    await labelIfChanged(s, from, to, 0);
    const after = await recordVersion(s.tx, s.before, s.by, s.at(1));
    await recordOrderEvent(s.tx, {
      orderId: s.before.id, orderNumber: s.before.number, kind: "WORKFLOW", byEmail: s.by,
      content: decision === "approve" ? "Approved" : "Rejected", at: s.at(2),
    });
    await updateLastPurchaseRate(s.tx, after, true);
    // update_prevdoc_status: the Material Requests its rows were made from (their ordered qty and status).
    await refreshMaterialRequestsOrdered(s.tx, prepared.value.data.items.map((i) => i.materialRequest ?? ""), { email: s.by, stamp: siteDateTime() });
  });
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelOrder(user: PurchaseUser, req: ActionRequest): Promise<ActionResult> {
  return onOrder(user, req, "cancel", async (s) => {
    // Frappe's check_no_back_links_exist: a submitted document made against the PO refuses it.
    const link = await s.tx.purchaseOrderLink.findFirst({
      where: { orderId: s.before.id, docType: { notIn: [...SOURCES] }, OR: [{ docStatus: null }, { docStatus: { notIn: [...NOT_SUBMITTED] } }] },
      orderBy: [{ docType: "asc" }, { docName: "asc" }],
    });
    if (link) throw new UserError(`Cannot delete or cancel because Purchase Order ${s.before.number} is linked with ${link.docType} ${link.docName}`);
    await s.tx.purchaseOrder.update({ where: { id: s.before.id }, data: { docStatus: "CANCELLED", status: "CANCELLED", updatedBy: s.by } });
    const after = await recordVersion(s.tx, s.before, s.by, s.at(0));
    await updateLastPurchaseRate(s.tx, after, false);
    await refreshMaterialRequestsOrdered(s.tx, s.before.items.map((i) => i.materialRequest ?? ""), { email: s.by, stamp: siteDateTime() });
  });
}

// ---------------------------------------------------------------------------
// Close / Hold / Resume / Re-open
// ---------------------------------------------------------------------------

/** update_status: Closed and On Hold are set; Resume and Re-open recompute the status from % received and billed. */
async function setStatus(s: Step, target: "Closed" | "On Hold" | null, firstLine = 0) {
  const from = statusOf(s.before);
  const to = purchaseOrderStatus({
    docStatus: 1,
    status: target ?? "Draft",
    perReceived: n(s.before.perReceived),
    perBilled: n(s.before.perBilled),
  });
  await s.tx.purchaseOrder.update({ where: { id: s.before.id }, data: { status: PO_STATUS_KEYS[to], updatedBy: s.by } });
  await labelIfChanged(s, from, to, firstLine);
}

export const closeOrder = (user: PurchaseUser, req: ActionRequest) => onOrder(user, req, "close", (s) => setStatus(s, "Closed"));
export const resumeOrder = (user: PurchaseUser, req: ActionRequest) => onOrder(user, req, "resume", (s) => setStatus(s, null));
export const reopenOrder = (user: PurchaseUser, req: ActionRequest) => onOrder(user, req, "reopen", (s) => setStatus(s, null));

export const holdReasonSchema = z.string().trim().min(1, "Reason for Hold is required").max(5000);

export async function holdOrder(user: PurchaseUser, req: ActionRequest, reason: unknown): Promise<ActionResult> {
  const parsed = holdReasonSchema.safeParse(reason);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: { reason: parsed.error.issues[0].message } };
  return onOrder(user, req, "hold", async (s) => {
    await recordOrderEvent(s.tx, {
      orderId: s.before.id, orderNumber: s.before.number, kind: "COMMENT", byEmail: s.by,
      content: `Reason for hold: ${parsed.data}`, at: s.at(0),
    });
    await setStatus(s, "On Hold", 1);
  });
}

// ---------------------------------------------------------------------------
// Delete (drafts)
// ---------------------------------------------------------------------------

export async function deleteOrder(user: PurchaseUser, req: ActionRequest): Promise<ActionResult> {
  return onOrder(user, req, "delete", async (s) => {
    // check_if_doc_is_linked on delete: any document made against it refuses it.
    const link = await s.tx.purchaseOrderLink.findFirst({ where: { orderId: s.before.id, docType: { notIn: [...SOURCES] } } });
    if (link) throw new UserError(`Cannot delete or cancel because Purchase Order ${s.before.number} is linked with ${link.docType} ${link.docName}`);

    const base = await currencyDisplay(s.before.company.defaultCurrency ?? "INR", s.tx);
    const snap = orderSnapshot(s.before, base);
    const lastContent = {
      doctype: "Purchase Order",
      name: s.before.number,
      ...Object.fromEntries(Object.entries(snap.header).map(([k, c]) => [k, c.raw])),
      ...Object.fromEntries(
        Object.entries(snap.tables).map(([table, t]) => [table, t.rows.map((r) => ({ name: r.name, idx: r.idx, ...Object.fromEntries(Object.entries(r.values).map(([k, c]) => [k, c.raw])) }))]),
      ),
    };

    // revert_series_if_last: deleting the newest number gives it back to the series.
    const count = Number(s.before.number.slice(s.before.namingSeries.length));
    if (s.before.number.startsWith(s.before.namingSeries) && Number.isInteger(count) && /^\d+$/.test(s.before.number.slice(s.before.namingSeries.length))) {
      await s.tx.$executeRaw`update purchase_naming_series set current = current - 1 where prefix = ${s.before.namingSeries} and current = ${count}`;
    }
    await s.tx.purchaseOrder.delete({ where: { id: s.before.id } });
    await recordOrderEvent(s.tx, {
      orderId: null, orderNumber: s.before.number, kind: "DELETED", byEmail: s.by,
      subject: `Purchase Order ${s.before.number}`, data: lastContent as Prisma.InputJsonValue, at: s.at(0),
    });
  });
}

// ---------------------------------------------------------------------------
// Update after submit
// ---------------------------------------------------------------------------

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const optDay = z.union([day, z.literal(""), z.null()]).transform((v) => v || null);
const optText = z.union([z.string(), z.null()]).transform((v) => (v ?? "").trim() || null);

/** The fields ERPNext allowed to change on a submitted PO (allow_on_submit). */
export const updateAfterSubmitSchema = z.object({
  scheduleDate: optDay,
  // Not on the screens (unused in 2.5 years, plan §5); kept as stored when absent.
  orderConfirmationNo: optText.optional(),
  orderConfirmationDate: optDay.optional(),
  letterHead: optText,
  selectPrintHeading: optText,
  groupSameItems: z.boolean(),
  items: z.array(z.object({ id: z.string(), scheduleDate: day, expectedDeliveryDate: optDay, pageBreak: z.boolean().default(false) })),
});
export type UpdateAfterSubmit = z.input<typeof updateAfterSubmitSchema>;

export async function updateSubmittedOrder(user: PurchaseUser, req: ActionRequest, values: unknown): Promise<ActionResult> {
  const parsed = updateAfterSubmitSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  return onOrder(user, req, "update", async (s) => {
    const letterHead = v.letterHead ? await s.tx.purchaseLetterHead.findUnique({ where: { code: v.letterHead } }) : null;
    if (v.letterHead && !letterHead) throw new UserError(`Letter Head ${v.letterHead} not found`);
    const day = (x: string | null) => (x ? new Date(`${x}T00:00:00Z`) : null);
    const rows = new Map(s.before.items.map((i) => [i.id, i]));
    for (const row of v.items) {
      if (!rows.has(row.id)) throw new UserError("An item row of this Purchase Order no longer exists. Reload it.");
      await s.tx.purchaseOrderItem.update({
        where: { id: row.id },
        data: { scheduleDate: day(row.scheduleDate), expectedDeliveryDate: day(row.expectedDeliveryDate), pageBreak: row.pageBreak },
      });
    }
    await s.tx.purchaseOrder.update({
      where: { id: s.before.id },
      data: {
        scheduleDate: day(v.scheduleDate),
        ...(v.orderConfirmationNo !== undefined ? { orderConfirmationNo: v.orderConfirmationNo } : {}),
        ...(v.orderConfirmationDate !== undefined ? { orderConfirmationDate: day(v.orderConfirmationDate) } : {}),
        letterHeadId: letterHead?.id ?? null,
        selectPrintHeading: v.selectPrintHeading,
        groupSameItems: v.groupSameItems,
        updatedBy: s.by,
      },
    });
    await recordVersion(s.tx, s.before, s.by, s.at(0));
  });
}

// ---------------------------------------------------------------------------
// Last Purchase Rate (buying/utils.py update_last_purchase_rate)
// ---------------------------------------------------------------------------

/**
 * On approval each item's Last Purchase Rate becomes this PO's base net rate per stock unit,
 * unless a later submitted PO bought it; on cancel it falls back to the latest other submitted
 * PO (0 when none). The original also looked at Purchase Receipts, which this module does not
 * hold; their rates reach the item master only through the import.
 */
async function updateLastPurchaseRate(tx: Tx, o: OrderRecord, isSubmit: boolean) {
  if (BUYING_SETTINGS.disableLastPurchaseRate || o.isInternalSupplier) return;
  for (const row of o.items) {
    if (row.isFreeItem) continue;
    const [last] = await tx.$queryRaw<{ transaction_date: Date; base_net_rate: Prisma.Decimal; conversion_factor: Prisma.Decimal }[]>`
      select po.transaction_date, i.base_net_rate, i.conversion_factor
      from purchase_order_items i join purchase_orders po on po.id = i.order_id
      where po.doc_status = 'Submitted' and i.item_code = ${row.itemCode} and po.id <> ${o.id}
      order by po.transaction_date desc, po.number desc
      limit 1`;
    let rate: number | null = null;
    if (last && (!isSubmit || last.transaction_date > o.transactionDate)) {
      rate = n(last.conversion_factor) ? n(last.base_net_rate) / n(last.conversion_factor) : 0;
    } else if (isSubmit && n(row.conversionFactor)) {
      rate = n(row.baseNetRate) / n(row.conversionFactor);
    }
    await tx.purchaseItem.update({ where: { id: row.itemId }, data: { lastPurchaseRate: dbDecimal(rate ?? 0) } });
  }
}

// ---------------------------------------------------------------------------
// Update Items (accounts_controller.update_child_qty_rate, for a PO)
// ---------------------------------------------------------------------------

export const updateItemsSchema = z.array(
  z.object({
    /** The stored row; absent for a row added in the dialog. */
    docname: z.string().optional(),
    itemCode: z.string().trim(),
    scheduleDate: day,
    uom: z.string().trim().min(1, "UOM is required"),
    conversionFactor: z.number().nonnegative().default(0),
    qty: z.number(),
    rate: z.number(),
  }),
);
export type UpdateItemsRow = z.input<typeof updateItemsSchema>[number];

/**
 * The approved PO's rows changed in place: removed rows must have nothing received or billed, a
 * quantity cannot go below what was received, a rate cannot take the amount below what was
 * billed; a new row takes the item's defaults. A row whose rate, quantity, UOM, factor and date
 * are unchanged is left as it was. Then every figure, the payment schedule and the status are
 * recomputed and the PO is checked again, as on save.
 */
export async function updateOrderItems(user: PurchaseUser, req: ActionRequest, rowsIn: unknown): Promise<ActionResult> {
  const parsed = updateItemsSchema.safeParse(rowsIn);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const rows = parsed.data.filter((r) => r.itemCode);
  const stored = await orderRecord(req.id);
  if (!stored) return { ok: false, error: "This Purchase Order no longer exists." };

  const values = orderFormValues(stored);
  const byId = new Map(stored.items.map((i, k) => [i.id, { row: i, values: values.items[k] }]));
  const kept = new Set(rows.map((r) => r.docname).filter(Boolean) as string[]);
  for (const i of stored.items) {
    if (kept.has(i.id)) continue;
    if (n(i.receivedQty)) return { ok: false, error: `Row #${i.idx}: Cannot delete item ${i.itemCode} which has already been received` };
    if (n(i.billedAmt)) return { ok: false, error: `Row #${i.idx}: Cannot delete item ${i.itemCode} which has already been billed.` };
  }

  const items: typeof values.items = [];
  for (const [k, r] of rows.entries()) {
    const idx = k + 1;
    if (!r.qty) return { ok: false, error: `Row # ${idx}: Quantity for Item ${r.itemCode} cannot be zero` };
    const old = r.docname ? byId.get(r.docname) : undefined;
    if (r.docname && !old) return { ok: false, error: "An item row of this Purchase Order no longer exists. Reload it." };
    if (old) {
      const v = old.values;
      const unchanged = v.rate === r.rate && v.qty === r.qty && v.conversionFactor === r.conversionFactor && v.uom === r.uom && v.scheduleDate === r.scheduleDate;
      if (unchanged) {
        items.push(v);
        continue;
      }
      if (r.qty < n(old.row.receivedQty)) return { ok: false, error: "Cannot set quantity less than received quantity" };
      if (n(old.row.billedAmt) > r.rate * r.qty && r.rate > 0) {
        return { ok: false, error: `Row #${old.row.idx}: Cannot set Rate if amount is greater than billed amount for Item ${old.row.itemCode}.` };
      }
      const factor = old.row.stockUom === r.uom ? 1 : r.conversionFactor || (await uomFactor(old.row.itemCode, r.uom)) || 1;
      items.push({ ...v, qty: r.qty, rate: r.rate, uom: r.uom, conversionFactor: factor, scheduleDate: r.scheduleDate, ...priceListTerms(v.priceListRate ?? 0, r.rate) });
      continue;
    }
    // set_order_defaults: a new row from the item master.
    const d = await itemDetails(r.itemCode, {
      company: values.company, taxCategory: values.taxCategory ?? null, transactionDate: values.transactionDate,
      setWarehouse: values.setWarehouse ?? null, conversionRate: Number(values.conversionRate) || 1,
    });
    if (!d) return { ok: false, error: `Row #${idx}: Item ${r.itemCode} does not exist` };
    const factor = d.stockUom === r.uom ? 1 : r.conversionFactor || (await uomFactor(r.itemCode, r.uom)) || 1;
    items.push({
      itemCode: d.itemCode, itemName: d.itemName, description: d.description, scheduleDate: r.scheduleDate || (values.scheduleDate ?? r.scheduleDate),
      expectedDeliveryDate: null, qty: r.qty, uom: r.uom || d.stockUom, conversionFactor: factor, priceListRate: 0, discountPercentage: 0,
      discountAmount: 0, marginType: null, marginRateOrAmount: 0, rate: r.rate, itemTaxTemplate: d.itemTaxTemplate, warehouse: d.warehouse,
      expenseAccount: d.expenseAccount, costCenter: d.costCenter, applyTds: true, weightPerUnit: d.weightPerUnit,
    });
  }
  if (!items.length) return { ok: false, error: "Items are required" };

  const prepared = await prepareOrder({ ...values, items });
  if (!prepared.ok) return { ok: false, error: prepared.error, fieldErrors: prepared.fieldErrors };

  return onOrder(user, req, "updateItems", async (s) => {
    if (s.before.updatedAt.getTime() !== stored.updatedAt.getTime()) {
      throw new UserError("This Purchase Order was changed by someone else after you opened it. Reload it to see the changes.");
    }
    // update_receiving_percentage / update_billing_percentage over the new rows.
    const kept = new Map(s.before.items.map((i) => [i.id, i]));
    const qty = prepared.value.data.items.reduce((t, r) => t + r.qty, 0);
    const received = prepared.value.data.items.reduce((t, r) => t + n(r.id ? kept.get(r.id)?.receivedQty : 0), 0);
    const amount = prepared.value.calc.items.reduce((t, r) => t + r.amount, 0);
    const billed = prepared.value.data.items.reduce((t, r, k) => t + Math.min(n(r.id ? kept.get(r.id)?.billedAmt : 0), prepared.value.calc.items[k].amount), 0);
    const perReceived = qty ? (received / qty) * 100 : 0;
    const perBilled = amount ? (billed / amount) * 100 : 0;
    const from = statusOf(s.before);
    const to = purchaseOrderStatus({ docStatus: 1, status: from === "Draft" ? "To Receive and Bill" : from, perReceived, perBilled });
    await writeDraft(s.tx, s.before.id, prepared.value, s.by, {
      status: PO_STATUS_KEYS[to],
      perReceived: dbDecimal(perReceived),
      perBilled: dbDecimal(perBilled),
    });
    const after = await recordVersion(s.tx, s.before, s.by, s.at(1));
    await labelIfChanged(s, from, to, 2);
    await updateLastPurchaseRate(s.tx, after, true);
  });
}

/** Update Items on a row with a price list rate: a higher rate becomes a margin, a lower one a discount. */
function priceListTerms(priceListRate: number, rate: number) {
  if (!priceListRate) return {};
  if (rate > priceListRate) {
    return { discountPercentage: 0, discountAmount: 0, marginType: "Amount" as const, marginRateOrAmount: rate - priceListRate };
  }
  return { discountPercentage: (1 - rate / priceListRate) * 100, discountAmount: priceListRate - rate, marginType: null, marginRateOrAmount: 0 };
}
