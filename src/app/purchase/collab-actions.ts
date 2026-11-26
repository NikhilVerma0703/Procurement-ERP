"use server";

// The lists' (and forms') Assign To, Apply Assignment Rule, Add Tags, a tag's ×, and the list sidebar's
// Save Filter (owner, 26-11-2026: "Build all of them"). Each passes purchaseGate() for the DocType's own area — a
// Buying list for anyone who may open Buying, a Stock list for the storekeeper — and runs through
// purchaseWrite() (CLAUDE.md, seams). The records are looked up here, by id, never taken from the browser.
import type { PurchaseAction } from "@/lib/purchase/access";
import { purchaseCan } from "@/lib/purchase/access";
import { applyAssignmentRules, assignableUsers, assignRecords, endAssignment, type RecordRef } from "@/lib/purchase/collab/assignments";
import { groupByCounts, tagStats, type GroupCount } from "@/lib/purchase/collab/sidebar";
import { addTags, allTags, deleteSavedFilter, removeTag, saveFilter } from "@/lib/purchase/collab/tags";
import { docFieldValues, docNames } from "@/lib/purchase/doc/list-data";
import { parseDocListQuery } from "@/lib/purchase/doc/list-view";
import { GATE_ENTRY_SCREEN, layoutOf, MASTER_SCREENS, RECEIPT_SCREEN, screenOf } from "@/lib/purchase/doc/screens";
import { parseListQuery } from "@/lib/purchase/orders/list";
import { FILTER_TARGETS } from "@/lib/purchase/orders/list-where";
import { orderFieldValues } from "@/lib/purchase/orders/queries";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import type { PurchaseUser } from "@/lib/purchase/server/current-user";
import { db } from "@/lib/purchase/server/db";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { purchaseWrite } from "@/lib/purchase/server/write";

const SCREENS = [...MASTER_SCREENS, GATE_ENTRY_SCREEN, RECEIPT_SCREEN];
const screenFor = (doctype: string) => SCREENS.find((s) => s.doctype === doctype) ?? screenOf(doctype);

/** The area a DocType's list is in (its page gate). */
function areaOf(doctype: string): PurchaseAction | null {
  if (doctype === "Purchase Order") return "view";
  const s = screenFor(doctype);
  return s ? s.gate ?? "stock" : null;
}

/** The ticked records that exist, with their names. */
async function recordsOf(doctype: string, ids: unknown): Promise<RecordRef[]> {
  const list = (Array.isArray(ids) ? ids : []).map((x) => String(x).slice(0, 64)).filter(Boolean).slice(0, 500);
  if (doctype === "Purchase Order") {
    return (await db.purchaseOrder.findMany({ where: { id: { in: list } }, select: { id: true, number: true } })).map((o) => ({ id: o.id, name: o.number }));
  }
  const s = screenFor(doctype);
  if (!s) return [];
  const names = await docNames(s, list);
  return list.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! }));
}

/** A read for the list (no write): the DocType's area gate only. */
async function read<T>(doctype: string, fn: (user: PurchaseUser) => Promise<T>): Promise<ActionResult<T>> {
  const area = areaOf(String(doctype));
  if (!area) return { ok: false, error: "Unknown record type." };
  const g = await purchaseGate(area);
  if (!g.ok || !g.user) return { ok: false, error: g.status === 401 ? purchaseRefusal(g) : "You are not permitted to do this." };
  try {
    return { ok: true, value: await fn(g.user) } as ActionResult<T>;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const GROUP_TYPES = new Set(["Select", "Link", "Data", "Int", "Check"]);

/** The list's records (under its conditions, as the address bar `search` holds them) with their `field`. */
async function fieldValues(doctype: string, field: string, search: string) {
  const params = new URLSearchParams(String(search ?? "").slice(0, 8000));
  if (doctype === "Purchase Order") {
    if (field !== "assigned_to" && !FILTER_TARGETS[field]) throw new Error("Unknown field");
    return orderFieldValues(parseListQuery(params), field);
  }
  const s = screenFor(doctype)!;
  const l = layoutOf(s);
  if (field !== "assigned_to" && field !== "owner" && !l.fields.some((f) => f.fieldname === field && GROUP_TYPES.has(f.fieldtype))) throw new Error("Unknown field");
  return docFieldValues(s, parseDocListQuery(l, params, { sort: s.sort.field, order: s.sort.order }).filters, field);
}

/** The sidebar's Filter By dropdowns (Assigned To, Created By, and those Edit Filters added). */
export async function groupByCountsAction(doctype: string, field: string, search: string): Promise<ActionResult<GroupCount[]>> {
  return read(doctype, async (user) => groupByCounts(doctype, String(field), await fieldValues(doctype, String(field), search), user.email));
}

/** The sidebar's Tags dropdown. */
export async function tagStatsAction(doctype: string, search: string): Promise<ActionResult<[string, number][]>> {
  return read(doctype, async () => tagStats(doctype, (await fieldValues(doctype, "assigned_to", search)).map((r) => r.id)));
}

/** The Assign To dialog's users. */
export async function assignableUsersAction(doctype: string) {
  return read(doctype, () => assignableUsers());
}

/** The Add Tags dialog's suggestions (the tags already in use). */
export async function tagSuggestionsAction(doctype: string, q: string) {
  return read(doctype, () => allTags(String(q ?? "").slice(0, 140)));
}

async function run<T>(doctype: string, fn: (user: PurchaseUser) => Promise<T>): Promise<ActionResult<T>> {
  const area = areaOf(String(doctype));
  if (!area) return { ok: false, error: "Unknown record type." };
  const g = await purchaseGate(area);
  if (!g.ok || !g.user) return { ok: false, error: g.status === 401 ? purchaseRefusal(g) : "You are not permitted to do this." };
  const user = g.user;
  const w = await purchaseWrite(user, async () => {
    try {
      return { ok: true as const, value: await fn(user) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return w.done ? w.value : { ok: false, error: w.refusal };
}

/** Actions › Assign To (and a form's +): the "Add to ToDo" dialog's values. */
export async function assignAction(doctype: string, ids: unknown, args: { assignTo: string[]; description?: string | null; priority?: string | null; date?: string | null }) {
  return run(doctype, async (user) => {
    const records = await recordsOf(doctype, ids);
    if (!records.length) throw new Error("Select records for assignment");
    return assignRecords(user, { doctype, records, assignTo: (args?.assignTo ?? []).map(String).slice(0, 50), description: args?.description ? String(args.description).slice(0, 10000) : null, priority: args?.priority ?? null, date: args?.date ?? null });
  });
}

/** A form's assignment × (remove) or ✓ (the assignee's own Done). */
export async function endAssignmentAction(doctype: string, id: string, assignTo: string, done: boolean) {
  return run(doctype, async (user) => {
    const [record] = await recordsOf(doctype, [id]);
    if (!record) throw new Error("Record not found");
    await endAssignment(user, doctype, record, String(assignTo).toLowerCase(), done ? "Closed" : "Cancelled");
    return null;
  });
}

/** Actions › Apply Assignment Rule. */
export async function applyAssignmentRuleAction(doctype: string, ids: unknown) {
  return run(doctype, async () => applyAssignmentRules(doctype, await recordsOf(doctype, ids)));
}

/** Actions › Add Tags. */
export async function addTagsAction(doctype: string, ids: unknown, tags: unknown) {
  return run(doctype, async (user) => {
    const records = await recordsOf(doctype, ids);
    if (!records.length) throw new Error("Select records to tag");
    await addTags(user, doctype, records, (Array.isArray(tags) ? tags : []).map(String).slice(0, 50));
    return null;
  });
}

/** A tag's × on a row or a form. */
export async function removeTagAction(doctype: string, id: string, tag: string) {
  return run(doctype, async () => {
    const [record] = await recordsOf(doctype, [id]);
    if (record) await removeTag(doctype, record.id, String(tag));
    return null;
  });
}

/** The sidebar's Save Filter, and a saved filter's ×. */
export async function saveFilterAction(doctype: string, name: string, query: string, isGlobal = false) {
  return run(doctype, async (user) => {
    // "Is Global" was offered to System Managers only; here, to those who manage the module.
    await saveFilter(user, doctype, String(name ?? ""), String(query ?? ""), Boolean(isGlobal) && purchaseCan(user, "manage"));
    return null;
  });
}
export async function deleteSavedFilterAction(doctype: string, id: string) {
  return run(doctype, async (user) => {
    await deleteSavedFilter(user, String(id));
    return null;
  });
}
