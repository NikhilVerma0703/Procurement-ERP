// Saving, submitting, cancelling, deleting and amending a Gate Entry — the server's side of its form
// (server authority, CLAUDE.md; owner, 23-11-2026). The form's document is re-validated with the
// layout's schema; only what a user may type is taken from it (Location, Po No, Invoice No and Date,
// Gate Entry Date, Financial Year, Vehicle No, and each row's Item Qty, UOM and description); the
// rest is fetched again here, as Frappe's server did:
//   * Supplier and Po Date from the PO (fetch_from, set again on every save), a row's Po Date too;
//   * a new row's item, description, unit and Po Qty from the PO line (the add-on's po_items);
//   * Bal Qty = Po Qty − Item Qty on every row; Inward No / Date are never typed (the receipt's
//     submission writes them);
// then Frappe's mandatory check, and one transaction. The PO must exist and not be cancelled
// (Frappe's link check). No change history is kept: the DocType had track_changes off.
// Cancel and delete stop while a receipt names the entry (Frappe's linked-document checks).
import "server-only";
import { Prisma } from "@prisma/client";
import { dbDecimal } from "../calc/pymath";
import { LAYOUTS } from "../doc/layouts";
import { docSchema, legacyRow, missingFields, newRowName, siteDateTime, type Doc } from "../doc/store";
import { typedDoc } from "../doc/values";
import { siteToday } from "../format";
import { fyFull, fyStartOf, sameSeries, seriesForDate } from "../financial-year";
import { nextInSeries } from "../series-counter";
import { importId } from "../migrate/convert";
import { gateEntryColumns, gateEntryItemColumns } from "../migrate/stock-build";
import { fieldErrorsOf, type ActionResult } from "../orders/form-schema";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import { gateEntryOrderOk, poForGateEntry } from "./gate-entries";
import {
  amendedName, balQty, DEFAULT_GATE_ENTRY_SERIES, GATE_ENTRY, GATE_ENTRY_CHILDREN, GATE_ENTRY_ITEM, GATE_ENTRY_LOCATION, gateEntrySeriesKey,
  rowsFromPoItems,
} from "./gate-entry-meta";

type Tx = Prisma.TransactionClient;

class UserError extends Error {
  constructor(message: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const rowsOf = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);
const SERIES = (LAYOUTS[GATE_ENTRY].fields.find((f) => f.fieldname === "naming_series")?.options ?? DEFAULT_GATE_ENTRY_SERIES).split("\n").filter(Boolean);

/** The stored entry as its form holds it. */
export async function storedGateEntryDoc(id: string, tx: Tx | typeof db = db) {
  const g = await tx.purchaseGateEntry.findUnique({
    where: { id },
    include: { items: { orderBy: { idx: "asc" }, select: { id: true, legacy: true } }, amendments: { select: { id: true }, take: 1 } },
  });
  if (!g) return null;
  const rowIds = new Map(g.items.map((i) => [String((i.legacy as Record<string, unknown>)?.name ?? ""), i.id]));
  return {
    entry: g,
    rowIds,
    doc: {
      ...typedDoc(LAYOUTS[GATE_ENTRY], (g.legacy ?? {}) as Record<string, unknown>),
      items: g.items.map((i) => typedDoc(LAYOUTS[GATE_ENTRY_ITEM], (i.legacy ?? {}) as Record<string, unknown>)),
    } as Doc,
  };
}

/** A new gate entry's defaults (the DocType's, and the form's refresh: Gate Entry Date = today). */
export function blankGateEntry(now = new Date()): Doc {
  const today = siteToday(now);
  return {
    // The series and the Financial Year of today (financial-year.ts, owner 26-11-2026).
    __islocal: 1, docstatus: 0, naming_series: seriesForDate(DEFAULT_GATE_ENTRY_SERIES, today), location: GATE_ENTRY_LOCATION,
    invoice_date: today, gate_entry_date: today, financial_year: fyFull(fyStartOf(today)), items: [],
  };
}

/** The form's po_no trigger, on the server: the PO's supplier and date and its lines still to receive. */
export async function gateEntryFromPo(orderNumber: string): Promise<{ ok: true; value: { supplier: string; po_date: string; items: Doc[] } } | { ok: false; error: string }> {
  const po = await poForGateEntry(db, orderNumber);
  if (!po) return { ok: false, error: `Could not find Purchase Order: ${orderNumber}` };
  return {
    ok: true,
    value: {
      supplier: po.order.supplierCode,
      po_date: po.order.transactionDate,
      items: rowsFromPoItems({ number: po.order.number, transactionDate: po.order.transactionDate }, po.items, newRowName),
    },
  };
}

/** A cancelled entry, copied for its amendment (Frappe's Amend: the same fields, a new draft). */
export async function amendDoc(id: string): Promise<{ ok: true; doc: Doc } | { ok: false; error: string }> {
  const s = await storedGateEntryDoc(id);
  if (!s) return { ok: false, error: "This Gate Entry no longer exists." };
  if (s.entry.docStatus !== "CANCELLED") return { ok: false, error: `Only a cancelled Gate Entry can be amended (${s.entry.number}).` };
  if (s.entry.amendments.length) return { ok: false, error: `${s.entry.number} has already been amended.` };
  const { name: _n, creation: _c, modified: _m, owner: _o, modified_by: _mb, inward_no: _i, inward_date: _id, ...rest } = s.doc;
  void _n; void _c; void _m; void _o; void _mb; void _i; void _id;
  return {
    ok: true,
    doc: { ...rest, __islocal: 1, docstatus: 0, amended_from: s.entry.number, items: rowsOf(s.doc.items).map((r) => ({ ...r, name: newRowName(), __islocal: 1 })) },
  };
}

async function nextNumber(tx: Tx, doc: Doc): Promise<string> {
  const { prefix, digits } = gateEntrySeriesKey(str(doc.naming_series), doc);
  return nextInSeries(tx, prefix, digits);
}

/** What the user may change on a draft; everything else comes from the stored entry or the PO. */
const TYPED_HEADER = ["naming_series", "location", "po_no", "invoice_no", "invoice_date", "gate_entry_date", "financial_year", "vehicle_no", "supplier"] as const;
const TYPED_ROW = ["item_qty", "uom", "item_description"] as const;

interface SaveRequest {
  id: string | null;
  doc: unknown;
  modified: string | null;
  /** For an amendment: the cancelled entry it amends. */
  amendFrom?: string | null;
}

export async function saveGateEntry(user: PurchaseUser, req: SaveRequest): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  const layout = LAYOUTS[GATE_ENTRY];
  const parsed = docSchema(layout, GATE_ENTRY_CHILDREN).safeParse(req.doc);
  if (!parsed.success) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  const typed = parsed.data;
  try {
    const out = await db.$transaction(async (tx) => {
      const stored = req.id ? await storedGateEntryDoc(req.id, tx) : null;
      if (req.id && !stored) throw new UserError("This Gate Entry no longer exists.");
      if (stored && stored.entry.docStatus !== "DRAFT") throw new UserError(`Cannot edit a ${stored.entry.docStatus === "SUBMITTED" ? "submitted" : "cancelled"} Gate Entry; only a draft can be changed.`);
      if (stored && req.modified && String(stored.doc.modified ?? "") !== req.modified) {
        throw new UserError(`Document has been modified after you have opened it (${req.modified}, ${String(stored.doc.modified)}). Please refresh to get the latest document.`);
      }
      const refuse = (message: string, key?: string): never => {
        throw new UserError(message, key ? { [key]: message } : undefined);
      };
      const now = new Date();
      const stamp = siteDateTime(now);

      // --- header: what was typed, over the stored entry (or the defaults) ------------------------
      const doc: Doc = { ...(stored?.doc ?? blankGateEntry(now)) };
      for (const f of TYPED_HEADER) if (f in typed) doc[f] = typed[f];
      doc.docstatus = 0;
      // The series in the financial year of the Gate Entry Date (financial-year.ts, owner 26-11-2026),
      // and the entry's Financial Year field with it (the add-on filled it with the year's name).
      const day = str(doc.gate_entry_date) || siteToday(now);
      if (!SERIES.some((s) => sameSeries(s, str(doc.naming_series)))) doc.naming_series = DEFAULT_GATE_ENTRY_SERIES;
      doc.naming_series = seriesForDate(str(doc.naming_series), day);
      if (!str(doc.financial_year)) doc.financial_year = fyFull(fyStartOf(day));

      // An amendment (new only): of a cancelled entry not amended before.
      let amendedFromId: string | null = stored?.entry.amendedFromId ?? null;
      if (!stored && req.amendFrom) {
        const from = await tx.purchaseGateEntry.findUnique({ where: { id: req.amendFrom }, select: { id: true, number: true, docStatus: true, amendedFromId: true, amendments: { select: { id: true }, take: 1 } } });
        if (!from || from.docStatus !== "CANCELLED") refuse("Only a cancelled Gate Entry can be amended.");
        if (from!.amendments.length) refuse(`${from!.number} has already been amended.`);
        doc.amended_from = from!.number;
        amendedFromId = from!.id;
      }

      // --- the PO: its supplier and date (fetch_from), and the lines a new row may come from ---------
      const poNo = str(doc.po_no);
      const po = poNo ? await poForGateEntry(tx, poNo) : null;
      if (poNo && !po) refuse(`Could not find Po No: ${poNo}`, "po_no");
      if (po && po.order.docStatus === "CANCELLED") refuse(`Cannot link cancelled document: Purchase Order ${poNo}`, "po_no");
      if (po) {
        doc.supplier = po.order.supplierCode;
        doc.po_date = po.order.transactionDate;
      }

      // --- rows: stored rows keep their PO figures; new ones take them from the PO line --------------
      const storedRows = new Map(rowsOf(stored?.doc.items).map((r) => [str(r.name), r]));
      // An amendment keeps the cancelled entry's figures (Frappe's Amend copied its rows as they were).
      const amendedRows = new Map<string, Doc>();
      if (amendedFromId && !stored) {
        const from = await storedGateEntryDoc(amendedFromId, tx);
        for (const r of rowsOf(from?.doc.items)) if (str(r.po_no) === poNo) amendedRows.set(str(r.po_item_name), r);
      }
      const poLines = new Map((po?.items ?? []).map((l) => [l.name, l]));
      doc.items = rowsOf(typed.items).map((r, i) => {
        const key = (f: string) => `items.${i}.${f}`;
        const old = storedRows.get(str(r.name));
        const copied = amendedRows.get(str(r.po_item_name));
        let row: Doc;
        if (old && str(old.po_no) === poNo) {
          row = { ...old };
        } else if (copied) {
          row = { ...copied, name: newRowName() };
        } else {
          const line = poLines.get(str(r.po_item_name));
          if (!line) refuse(`Row #${i + 1}: this line is not on Purchase Order ${poNo || "(none)"}; choose the PO again`, key("item_code"));
          row = {
            name: str(r.name) && !storedRows.has(str(r.name)) && !/^new-/.test(str(r.name)) ? str(r.name) : newRowName(),
            po_no: poNo, item_code: line!.item_code, item_description: line!.description, uom: line!.uom,
            po_qty: line!.qty, item_qty: 0, bal_qty: line!.qty, po_item_name: line!.name,
          };
        }
        for (const f of TYPED_ROW) if (f in r) row[f] = r[f];
        row.idx = i + 1;
        row.po_date = po?.order.transactionDate ?? row.po_date ?? "";
        row.item_qty = num(row.item_qty);
        row.bal_qty = balQty(num(row.po_qty), num(row.item_qty));
        return row;
      });

      // --- Frappe's mandatory check -------------------------------------------------------------------
      const missing = missingFields(layout, GATE_ENTRY_CHILDREN, doc);
      if (missing.summary) throw new UserError(missing.summary, missing.errors);

      // --- write ----------------------------------------------------------------------------------------
      const number = stored ? stored.entry.number : doc.amended_from ? amendedName(str(doc.amended_from), Boolean(await isAmendment(tx, amendedFromId))) : await nextNumber(tx, doc);
      if (!stored && (await tx.purchaseGateEntry.findUnique({ where: { number }, select: { id: true } }))) refuse(`Gate Entry ${number} already exists`);
      const creation = stored ? String(stored.doc.creation ?? stamp) : stamp;
      const owner = stored ? String(stored.doc.owner ?? user.email) : user.email;
      doc.name = number;
      const header = legacyRow(layout, doc, { name: number, owner, creation, modified: stamp, modified_by: user.email, docstatus: "0", idx: "0" });
      const id = req.id ?? importId("ge", number);
      const columns = gateEntryColumns(header, { orderId: po?.order.id ?? null, supplierId: await supplierId(tx, str(doc.supplier)), amendedFromId });
      if (stored) await tx.purchaseGateEntry.update({ where: { id }, data: { ...columns, createdAt: undefined } });
      else await tx.purchaseGateEntry.create({ data: { id, ...columns } });
      await writeRows(tx, id, number, rowsOf(doc.items), { owner, creation, stamp, by: user.email, docstatus: "0", rowIds: stored?.rowIds ?? new Map(), orderId: po?.order.id ?? null, lines: po?.items ?? [] });
      return { id, number, modified: stamp };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}

async function isAmendment(tx: Tx, id: string | null): Promise<boolean> {
  if (!id) return false;
  const g = await tx.purchaseGateEntry.findUnique({ where: { id }, select: { amendedFromId: true } });
  return Boolean(g?.amendedFromId);
}

async function supplierId(tx: Tx, code: string): Promise<string | null> {
  if (!code) return null;
  return (await tx.purchaseSupplier.findUnique({ where: { code }, select: { id: true } }))?.id ?? null;
}

async function writeRows(
  tx: Tx,
  gateEntryId: string,
  number: string,
  rows: Doc[],
  o: { owner: string; creation: string; stamp: string; by: string; docstatus: string; rowIds: Map<string, string>; orderId: string | null; lines: { name: string }[] },
) {
  const layout = LAYOUTS[GATE_ENTRY_ITEM];
  const codes = [...new Set(rows.map((r) => str(r.item_code)).filter(Boolean))];
  const items = new Map((await tx.purchaseItem.findMany({ where: { code: { in: codes } }, select: { code: true, id: true } })).map((x) => [x.code, x.id]));
  const lineNames = rows.map((r) => str(r.po_item_name)).filter(Boolean);
  const orderItems = new Map(
    (await tx.purchaseOrderItem.findMany({ where: { OR: [{ erpnextName: { in: lineNames } }, { id: { in: lineNames } }] }, select: { id: true, erpnextName: true } }))
      .flatMap((l) => [[l.id, l.id], ...(l.erpnextName ? [[l.erpnextName, l.id] as const] : [])] as [string, string][]),
  );
  await tx.purchaseGateEntryItem.deleteMany({ where: { gateEntryId } });
  if (!rows.length) return;
  await tx.purchaseGateEntryItem.createMany({
    data: rows.map((r, i) => {
      const legacy = legacyRow(layout, r, {
        name: str(r.name), parent: number, parentfield: "items", parenttype: GATE_ENTRY, idx: String(i + 1), docstatus: o.docstatus,
        owner: o.owner, creation: o.creation, modified: o.stamp, modified_by: o.by,
      });
      return {
        id: o.rowIds.get(str(r.name)) ?? importId("gei", str(r.name)),
        gateEntryId,
        ...gateEntryItemColumns(legacy, { orderId: o.orderId, itemId: items.get(str(r.item_code)) ?? null, orderItemId: orderItems.get(str(r.po_item_name)) ?? null }),
      };
    }),
  });
}

/** The legacy row, re-stamped with a new docstatus and modified (submit / cancel). */
function restamp(legacy: unknown, docstatus: "1" | "2", stamp: string, by: string): Prisma.InputJsonObject {
  return { ...((legacy ?? {}) as Record<string, unknown>), docstatus, modified: stamp, modified_by: by } as Prisma.InputJsonObject;
}

interface StateRequest {
  id: string;
  modified: string | null;
}

/** Submit a saved draft (Frappe validates it again first). */
export async function submitGateEntry(user: PurchaseUser, req: StateRequest): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  try {
    const out = await db.$transaction(async (tx) => {
      const s = await storedGateEntryDoc(req.id, tx);
      if (!s) throw new UserError("This Gate Entry no longer exists.");
      if (s.entry.docStatus !== "DRAFT") throw new UserError(`Gate Entry ${s.entry.number} is already ${s.entry.docStatus === "SUBMITTED" ? "submitted" : "cancelled"}.`);
      if (req.modified && String(s.doc.modified ?? "") !== req.modified) throw new UserError("Document has been modified after you have opened it. Please refresh to get the latest document.");
      const missing = missingFields(LAYOUTS[GATE_ENTRY], GATE_ENTRY_CHILDREN, s.doc);
      if (missing.summary) throw new UserError(missing.summary, missing.errors);
      const po = await tx.purchaseOrder.findUnique({ where: { number: str(s.doc.po_no) }, select: { docStatus: true } });
      if (!po) throw new UserError(`Could not find Po No: ${str(s.doc.po_no)}`);
      if (po.docStatus === "CANCELLED") throw new UserError(`Cannot link cancelled document: Purchase Order ${str(s.doc.po_no)}`);
      const stamp = siteDateTime(new Date());
      await tx.purchaseGateEntry.update({
        where: { id: s.entry.id },
        data: { docStatus: "SUBMITTED", legacy: restamp(s.entry.legacy, "1", stamp, user.email), updatedBy: user.email },
      });
      for (const it of await tx.purchaseGateEntryItem.findMany({ where: { gateEntryId: s.entry.id }, select: { id: true, legacy: true } })) {
        await tx.purchaseGateEntryItem.update({ where: { id: it.id }, data: { legacy: restamp(it.legacy, "1", stamp, user.email) } });
      }
      return { id: s.entry.id, number: s.entry.number, modified: stamp };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}

/** A receipt (not cancelled) that names this entry stops its cancellation or deletion. */
async function linkedReceipt(tx: Tx, gateEntryId: string, number: string, submittedOnly: boolean) {
  return tx.purchaseReceipt.findFirst({
    where: { OR: [{ gateEntryId }, { gateEntryCode: number }], docStatus: submittedOnly ? "SUBMITTED" : { not: "CANCELLED" } },
    select: { number: true, docStatus: true },
  });
}

/** Cancel a submitted entry. */
export async function cancelGateEntry(user: PurchaseUser, req: StateRequest): Promise<ActionResult<{ id: string; number: string; modified: string }>> {
  try {
    const out = await db.$transaction(async (tx) => {
      const s = await storedGateEntryDoc(req.id, tx);
      if (!s) throw new UserError("This Gate Entry no longer exists.");
      if (s.entry.docStatus !== "SUBMITTED") throw new UserError(`Only a submitted Gate Entry can be cancelled (${s.entry.number}).`);
      const pr = await linkedReceipt(tx, s.entry.id, s.entry.number, true);
      if (pr) throw new UserError(`Cannot cancel because submitted Purchase Receipt ${pr.number} is linked with Gate Entry ${s.entry.number}`);
      const stamp = siteDateTime(new Date());
      await tx.purchaseGateEntry.update({
        where: { id: s.entry.id },
        data: { docStatus: "CANCELLED", legacy: restamp(s.entry.legacy, "2", stamp, user.email), updatedBy: user.email },
      });
      for (const it of await tx.purchaseGateEntryItem.findMany({ where: { gateEntryId: s.entry.id }, select: { id: true, legacy: true } })) {
        await tx.purchaseGateEntryItem.update({ where: { id: it.id }, data: { legacy: restamp(it.legacy, "2", stamp, user.email) } });
      }
      return { id: s.entry.id, number: s.entry.number, modified: stamp };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}

/** Delete a draft or a cancelled entry (Frappe kept a "Deleted Document"; here a timeline line). */
export async function deleteGateEntry(user: PurchaseUser, req: { id: string }): Promise<ActionResult<{ number: string }>> {
  try {
    const out = await db.$transaction(async (tx) => {
      const s = await storedGateEntryDoc(req.id, tx);
      if (!s) throw new UserError("This Gate Entry no longer exists.");
      if (s.entry.docStatus === "SUBMITTED") throw new UserError(`Submitted Gate Entry ${s.entry.number} cannot be deleted; cancel it first.`);
      const pr = await linkedReceipt(tx, s.entry.id, s.entry.number, false);
      if (pr) throw new UserError(`Cannot delete or cancel because Gate Entry ${s.entry.number} is linked with Purchase Receipt ${pr.number}`);
      const amendment = await tx.purchaseGateEntry.findFirst({ where: { amendedFromId: s.entry.id }, select: { number: true } });
      if (amendment) throw new UserError(`Cannot delete or cancel because Gate Entry ${s.entry.number} is linked with Gate Entry ${amendment.number}`);
      await tx.purchaseDocEvent.create({
        data: { source: "app", doctype: GATE_ENTRY, docName: s.entry.number, kind: "DELETED", at: new Date(), byEmail: user.email, subject: `Gate Entry ${s.entry.number} deleted`, data: { data: s.doc } as unknown as Prisma.InputJsonValue },
      });
      await tx.purchaseGateEntry.delete({ where: { id: s.entry.id } });
      return { number: s.entry.number };
    });
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}

/** The quantities as stored text (for the tests' and the receipt's use). */
export const qtyText = (v: number) => dbDecimal(v);

/** Is this PO one a new gate entry may be raised against (the picker's rule)? */
export async function orderPickable(orderNumber: string): Promise<boolean> {
  const po = await poForGateEntry(db, orderNumber);
  return Boolean(po && gateEntryOrderOk(po.order));
}
