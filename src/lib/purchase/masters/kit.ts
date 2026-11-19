// What every master's save shares on the server: refusals answered as
// { ok, error, fieldErrors }, the stale-form check, link checks, child rows
// kept by their ids, and who made and last changed a record.
import "server-only";
import { Prisma } from "@prisma/client";
import { namesOf } from "../orders/activity";
import type { ActionResult } from "../orders/form-schema";
import type { Row } from "./spec";

/** A refusal the user can act on, with the fields it concerns. */
export class MasterError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Runs a master's write, answering its refusals as the form expects them. */
export async function masterResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value } as ActionResult<T>;
  } catch (e) {
    if (e instanceof MasterError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    // Two saves of the same new name at once: the second meets the unique index.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "A record with this name was saved just now. Reload and try again." };
    throw e;
  }
}

/** Refuses with the field errors, if there are any. */
export function refuseIf(errors: Record<string, string>, message?: string | null) {
  const keys = Object.keys(errors);
  if (keys.length) throw new MasterError(message ?? errors[keys[0]], errors);
}

/** Refuses a save over a change made after the form was opened. */
export function assertFresh(doctype: string, updatedAt: Date, expected: string | null | undefined) {
  if (expected && updatedAt.toISOString() !== expected) {
    throw new MasterError(`This ${doctype} was changed by someone else after you opened it. Reload it to see the changes.`);
  }
}

/** A link's record id, or Frappe's refusal "Could not find Supplier Group: X". */
export async function linkId(code: string | null, label: string, field: string, find: (code: string) => Promise<{ id: string } | null>): Promise<string | null> {
  if (!code) return null;
  const r = await find(code);
  if (!r) throw new MasterError(`Could not find ${label}: ${code}`, { [field]: `Could not find ${label}: ${code}` });
  return r.id;
}

/**
 * Saves a child table as Frappe did: rows still on the form are updated in place (their key is
 * their id), rows removed are deleted, new rows are created; idx follows the form's order.
 */
export async function syncRows(
  existingIds: readonly string[],
  rows: readonly Row[],
  ops: {
    remove: (ids: string[]) => Promise<unknown>;
    update: (id: string, row: Row, idx: number) => Promise<unknown>;
    create: (row: Row, idx: number) => Promise<unknown>;
  },
) {
  const existing = new Set(existingIds);
  const kept = new Set<string>();
  const plan = rows.map((r, i) => {
    const keep = existing.has(r._key) && !kept.has(r._key);
    if (keep) kept.add(r._key);
    return { r, idx: i + 1, keep };
  });
  const gone = existingIds.filter((id) => !kept.has(id));
  if (gone.length) await ops.remove(gone);
  for (const p of plan) {
    if (p.keep) await ops.update(p.r._key, p.r, p.idx);
    else await ops.create(p.r, p.idx);
  }
}

export interface Stamp {
  /** The login's or old user's email ("You" when it is the viewer's). */
  email: string | null;
  /** Their name, where known. */
  by: string | null;
  at: string;
}

/** Who made and last changed a record, by name where the login or old user is known. */
export async function stampsOf(r: { createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null }): Promise<{ created: Stamp; edited: Stamp }> {
  const nameOf = await namesOf([r.createdBy ?? "", r.updatedBy ?? ""]);
  return {
    created: { email: r.createdBy, by: r.createdBy ? nameOf(r.createdBy) : null, at: r.createdAt.toISOString() },
    edited: { email: r.updatedBy, by: r.updatedBy ? nameOf(r.updatedBy) : null, at: r.updatedAt.toISOString() },
  };
}

/** A date column as yyyy-mm-dd. */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** yyyy-mm-dd as a date column. */
export const dateOf = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
