// Assign To (owner, 26-11-2026: "Build all of them"), as Frappe 14.101.1 ran it (desk/form/assign_to.py and its
// ToDo): one open to-do per user and record; a user who already has it open is reported ("Already in the
// following Users ToDo list"); an empty comment becomes "Assignment for <DocType> <name>"; the record's timeline
// notes it ("<by> assigned <to>: <comment>", "<by> self assigned this task: …"); removing it (Cancelled) or the
// assignee completing it (Closed) is noted too ("Assignment of <to> removed by <by>", "<to> removed their
// assignment."). The old site sent the assignee a bell notification; this ERP has no bell — the assignment
// shows on the list (each row's avatars, the sidebar's Assigned To) and on the record. Server only.
import "server-only";
import type { Prisma } from "@prisma/client";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";

type Tx = Prisma.TransactionClient;

export interface RecordRef {
  id: string;
  name: string;
}

export interface AssignRequest {
  doctype: string;
  records: RecordRef[];
  assignTo: string[];
  description?: string | null;
  priority?: string | null;
  date?: string | null;
}

const PRIORITIES = new Set(["Low", "Medium", "High"]);
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

/** The people a record can be assigned to: the ERP's sign-in accounts (Frappe offered enabled System Users). */
export async function assignableUsers(): Promise<{ email: string; name: string }[]> {
  const rows = await db.purchaseLogin.findMany({ where: { active: true }, select: { email: true, name: true }, orderBy: { name: "asc" } });
  return rows;
}

async function fullNames(emails: string[]): Promise<Map<string, string>> {
  const rows = await db.purchaseLogin.findMany({ where: { email: { in: [...new Set(emails)] } }, select: { email: true, name: true } });
  return new Map(rows.map((r) => [r.email, r.name]));
}

/** A note on the record's timeline (a PO's own events; any other DocType's document events). */
async function note(tx: Tx, doctype: string, record: RecordRef, by: string, subject: string, content: string) {
  const at = new Date();
  if (doctype === "Purchase Order") {
    await tx.purchaseOrderEvent.create({ data: { source: "app", orderId: record.id, orderNumber: record.name, kind: "INFO", at, byEmail: by, subject, content } });
  } else {
    await tx.purchaseDocEvent.create({ data: { source: "app", doctype, docName: record.name, kind: "INFO", at, byEmail: by, subject, content } });
  }
}

/** frappe.desk.form.assign_to.add / add_multiple. Answers the users who already had it open. */
export async function assignRecords(user: PurchaseUser, req: AssignRequest): Promise<{ duplicates: string[] }> {
  const assignTo = [...new Set(req.assignTo.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!assignTo.length) throw new Error("Assign To is required");
  const valid = await fullNames(assignTo);
  const unknown = assignTo.filter((e) => !valid.has(e));
  if (unknown.length) throw new Error(`Could not find User: ${unknown.join(", ")}`);
  const names = await fullNames([...assignTo, user.email]);
  const nameOf = (e: string) => names.get(e) ?? e;
  const priority = req.priority && PRIORITIES.has(req.priority) ? req.priority : "Medium";
  const date = req.date && /^\d{4}-\d{2}-\d{2}$/.test(req.date) ? new Date(`${req.date}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10));
  const duplicates = new Set<string>();
  await db.$transaction(async (tx) => {
    for (const record of req.records) {
      for (const to of assignTo) {
        const open = await tx.purchaseAssignment.findFirst({ where: { doctype: req.doctype, recordId: record.id, allocatedTo: to, status: "Open" }, select: { id: true } });
        if (open) {
          duplicates.add(to);
          continue;
        }
        const raw = req.description ?? "";
        const description = stripHtml(raw) || raw.includes("<img") ? raw : `Assignment for ${req.doctype} ${record.name}`;
        await tx.purchaseAssignment.create({
          data: { doctype: req.doctype, recordId: record.id, recordName: record.name, allocatedTo: to, assignedBy: user.email, description, priority, status: "Open", date },
        });
        const text = user.email === to ? `${nameOf(user.email)} self assigned this task: ${stripHtml(description)}` : `${nameOf(user.email)} assigned ${nameOf(to)}: ${stripHtml(description)}`;
        await note(tx, req.doctype, record, user.email, "Assigned", text);
      }
    }
  });
  return { duplicates: [...duplicates] };
}

/** remove (Cancelled) or close (Closed: the assignee's own Done). */
export async function endAssignment(user: PurchaseUser, doctype: string, record: RecordRef, assignTo: string, status: "Cancelled" | "Closed"): Promise<void> {
  if (status === "Closed" && assignTo !== user.email) throw new Error("Only the assignee can complete this to-do.");
  const names = await fullNames([assignTo, user.email]);
  const nameOf = (e: string) => names.get(e) ?? e;
  await db.$transaction(async (tx) => {
    const todo = await tx.purchaseAssignment.findFirst({ where: { doctype, recordId: record.id, allocatedTo: assignTo, status: { not: status } }, orderBy: { createdAt: "desc" } });
    if (!todo) return;
    await tx.purchaseAssignment.update({ where: { id: todo.id }, data: { status } });
    const text = assignTo === user.email ? `${nameOf(user.email)} removed their assignment.` : `Assignment of ${nameOf(assignTo)} removed by ${nameOf(user.email)}`;
    await note(tx, doctype, record, user.email, "Assignment Completed", text);
  });
}

/** Each record's open assignees (as the list's avatars and the form's sidebar show them), first assigned first. */
export async function openAssignments(doctype: string, ids: readonly string[]): Promise<Record<string, { email: string; name: string }[]>> {
  if (!ids.length) return {};
  const rows = await db.purchaseAssignment.findMany({
    where: { doctype, recordId: { in: [...ids] }, status: "Open" },
    select: { recordId: true, allocatedTo: true },
    orderBy: { createdAt: "asc" },
  });
  const names = await fullNames(rows.map((r) => r.allocatedTo));
  const out: Record<string, { email: string; name: string }[]> = {};
  for (const r of rows) (out[r.recordId] ??= []).push({ email: r.allocatedTo, name: names.get(r.allocatedTo) ?? r.allocatedTo });
  return out;
}

/** The ids of records with an open assignment to this user (the sidebar's Assigned To; "_assign like %user%"). */
export async function recordsAssignedTo(doctype: string, email: string): Promise<string[]> {
  return (await db.purchaseAssignment.findMany({ where: { doctype, allocatedTo: email, status: "Open" }, select: { recordId: true }, distinct: ["recordId"] })).map((r) => r.recordId);
}

/** The sidebar's Assigned To: each assignee with how many of the doctype's records are open for them. */
export async function assignmentCounts(doctype: string): Promise<{ email: string; name: string; count: number }[]> {
  const rows = await db.purchaseAssignment.groupBy({ by: ["allocatedTo"], where: { doctype, status: "Open" }, _count: { _all: true } });
  const names = await fullNames(rows.map((r) => r.allocatedTo));
  return rows.map((r) => ({ email: r.allocatedTo, name: names.get(r.allocatedTo) ?? r.allocatedTo, count: r._count._all })).sort((a, b) => b.count - a.count);
}

/**
 * Apply Assignment Rule (frappe.automation.doctype.assignment_rule.assignment_rule.bulk_apply): assigns each
 * record by the DocType's Assignment Rules. The old site had none (read 26-11-2026), and so has this ERP, so it
 * assigns nothing — as the old one did.
 */
export async function applyAssignmentRules(_doctype: string, _records: readonly RecordRef[]): Promise<{ applied: number }> {
  return { applied: 0 };
}
