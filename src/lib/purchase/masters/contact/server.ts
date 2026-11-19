// The Contact master on the server: its list, one contact's form values, and
// its save and delete. A save re-checks the form and sets what Frappe set:
// the name of a new contact ("{first} {last}-{party}"), its Email Address,
// Phone and Mobile No from the rows marked primary (refusing two marked), its
// User Id from the email when none is given, and the links' titles.
import "server-only";
import type { Prisma } from "@prisma/client";
import type { ActionResult } from "../../orders/form-schema";
import { masterPath } from "../../routes";
import type { PurchaseUser } from "../../server/current-user";
import { db } from "../../server/db";
import { linksOf, syncLinks, type SaveMasterRequest } from "../address/server";
import { assertFresh, MasterError, masterResult, refuseIf, stampsOf, syncRows, type Stamp } from "../kit";
import type { ListPage, ListShape, MasterListQuery } from "../list-query";
import { assertContactUnused, insertContact, linkKey, primaryOf } from "../parties";
import type { Values } from "../spec";
import { cleanValues, flag, mandatoryErrors, rflag, rowsOf, rstr, str } from "../values";
import { contactSpec } from "./spec";

// The list ----------------------------------------------------------------------------------------

/** Contact list: Status is its standard filter; sorted as the doctype said (modified, ascending). */
export const CONTACT_LIST: ListShape = { filters: ["status"], sorts: ["modified", "creation", "name"], defaultSort: "modified", defaultOrder: "asc" };

const ORDER: Record<string, (o: "asc" | "desc") => Prisma.PurchaseContactOrderByWithRelationInput> = {
  modified: (o) => ({ updatedAt: o }),
  creation: (o) => ({ createdAt: o }),
  name: (o) => ({ code: o }),
};

/** Frappe's indicator for a doctype with a Status field: the status, Passive in grey. */
export const contactIndicator = (c: { status: string | null }) =>
  c.status ? ({ label: c.status, colour: c.status === "Open" ? "orange" : c.status === "Replied" ? "blue" : "gray" } as const) : null;

export async function listContacts(q: MasterListQuery): Promise<ListPage> {
  const has = (s: string) => ({ contains: s, mode: "insensitive" as const });
  const where: Prisma.PurchaseContactWhereInput = {
    ...(q.q ? { OR: [{ code: has(q.q) }, { firstName: has(q.q) }, { lastName: has(q.q) }, { emailId: has(q.q) }, { companyName: has(q.q) }] } : {}),
    ...(q.filters.status ? { status: q.filters.status } : {}),
  };
  const [rows, total] = await Promise.all([
    db.purchaseContact.findMany({
      where,
      orderBy: [(ORDER[q.sort] ?? ORDER.modified)(q.order), { code: "asc" }],
      take: q.limit,
      select: { id: true, code: true, status: true, emailId: true, phone: true, updatedAt: true },
    }),
    db.purchaseContact.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      href: masterPath("contacts", c.id),
      title: c.code,
      name: c.code,
      pill: contactIndicator(c),
      cells: { email_id: c.emailId, phone: c.phone },
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

// One contact -------------------------------------------------------------------------------------

export interface ContactDoc {
  id: string;
  code: string;
  updatedAt: string;
  indicator: ReturnType<typeof contactIndicator>;
  values: Values;
  created: Stamp;
  edited: Stamp;
}

export async function loadContact(id: string): Promise<ContactDoc | null> {
  const c = await db.purchaseContact.findUnique({
    where: { id },
    include: { emails: { orderBy: { idx: "asc" } }, phones: { orderBy: { idx: "asc" } }, links: { orderBy: { idx: "asc" } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    code: c.code,
    updatedAt: c.updatedAt.toISOString(),
    indicator: contactIndicator(c),
    values: {
      _name: c.code,
      first_name: c.firstName,
      middle_name: c.middleName,
      last_name: c.lastName,
      email_id: c.emailId,
      user: c.userEmail,
      status: c.status,
      salutation: c.salutation,
      designation: c.designation,
      gender: c.gender,
      phone: c.phone,
      mobile_no: c.mobileNo,
      company_name: c.companyName,
      is_primary_contact: c.isPrimaryContact,
      email_ids: c.emails.map((e) => ({ _key: e.id, email_id: e.emailId, is_primary: e.isPrimary })),
      phone_nos: c.phones.map((p) => ({ _key: p.id, phone: p.phone, is_primary_phone: p.isPrimaryPhone, is_primary_mobile_no: p.isPrimaryMobileNo })),
      links: c.links.map((l) => ({ _key: l.id, link_doctype: l.linkDoctype, link_name: l.linkName, link_title: l.linkTitle })),
    },
    ...(await stampsOf(c)),
  };
}

// Save --------------------------------------------------------------------------------------------

export function saveContact(user: PurchaseUser, req: SaveMasterRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const cleaned = cleanValues(contactSpec, req.values);
    if ("invalid" in cleaned) throw new MasterError(cleaned.invalid);
    const v = cleaned.values;
    refuseIf(cleaned.errors);
    const missing = mandatoryErrors(contactSpec, v, isNew);
    refuseIf(missing.errors, missing.message);

    const emails = rowsOf(v, "email_ids").map((r) => ({ _key: r._key, emailId: rstr(r, "email_id")!, isPrimary: rflag(r, "is_primary") }));
    const phones = rowsOf(v, "phone_nos").map((r) => ({ _key: r._key, phone: rstr(r, "phone")!, isPrimaryPhone: rflag(r, "is_primary_phone"), isPrimaryMobileNo: rflag(r, "is_primary_mobile_no") }));
    const primary = primaryOf({ emails, phones });

    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchaseContact.findUnique({ where: { id: req.id }, include: { links: true, emails: true, phones: true } }) : null;
      if (req.id && !before) throw new MasterError("This Contact no longer exists. It may have been deleted.");
      if (before) assertFresh("Contact", before.updatedAt, req.expectedUpdatedAt);

      // User Id: as given (it must be a user of the old site), else the user with the contact's email (set_user).
      let userEmail = str(v, "user");
      if (userEmail && !(await tx.purchaseUser.findUnique({ where: { email: userEmail }, select: { email: true } }))) {
        throw new MasterError(`Could not find User Id: ${userEmail}`, { user: `Could not find User Id: ${userEmail}` });
      }
      if (!userEmail && primary.emailId) userEmail = (await tx.purchaseUser.findFirst({ where: { email: { equals: primary.emailId, mode: "insensitive" } }, select: { email: true } }))?.email ?? null;

      const kept = new Map((before?.links ?? []).map((l) => [linkKey(l), l.linkTitle] as const));
      const links = await linksOf(tx, rowsOf(v, "links"), kept);
      const extra = { status: str(v, "status") ?? "Passive", salutation: str(v, "salutation"), designation: str(v, "designation"), gender: str(v, "gender"), userEmail };

      if (!before) {
        const c = await insertContact(
          tx,
          {
            firstName: str(v, "first_name")!, middleName: str(v, "middle_name"), lastName: str(v, "last_name"), companyName: str(v, "company_name"),
            isPrimaryContact: flag(v, "is_primary_contact"), emails: primary.emails, phones, links,
          },
          user.email,
          extra,
        );
        return { id: c.id, notices: [] };
      }

      await tx.purchaseContact.update({
        where: { id: before.id },
        data: {
          firstName: str(v, "first_name")!.trim(),
          middleName: str(v, "middle_name"),
          lastName: str(v, "last_name"),
          companyName: str(v, "company_name"),
          isPrimaryContact: flag(v, "is_primary_contact"),
          emailId: primary.emailId,
          phone: primary.phone,
          mobileNo: primary.mobileNo,
          ...extra,
          updatedBy: user.email,
        },
      });
      const lone = primary.emails;
      await syncRows(before.emails.map((e) => e.id), lone.map((e, i) => ({ _key: emails[i]._key })), {
        remove: (ids) => tx.purchaseContactEmail.deleteMany({ where: { id: { in: ids }, contactId: before.id } }),
        update: (id, _r, idx) => tx.purchaseContactEmail.update({ where: { id }, data: { idx, emailId: lone[idx - 1].emailId.trim(), isPrimary: lone[idx - 1].isPrimary } }),
        create: (_r, idx) => tx.purchaseContactEmail.create({ data: { contactId: before.id, idx, emailId: lone[idx - 1].emailId.trim(), isPrimary: lone[idx - 1].isPrimary } }),
      });
      await syncRows(before.phones.map((p) => p.id), phones.map((p) => ({ _key: p._key })), {
        remove: (ids) => tx.purchaseContactPhone.deleteMany({ where: { id: { in: ids }, contactId: before.id } }),
        update: (id, _r, idx) => tx.purchaseContactPhone.update({ where: { id }, data: { idx, phone: phones[idx - 1].phone, isPrimaryPhone: phones[idx - 1].isPrimaryPhone, isPrimaryMobileNo: phones[idx - 1].isPrimaryMobileNo } }),
        create: (_r, idx) => tx.purchaseContactPhone.create({ data: { contactId: before.id, idx, phone: phones[idx - 1].phone, isPrimaryPhone: phones[idx - 1].isPrimaryPhone, isPrimaryMobileNo: phones[idx - 1].isPrimaryMobileNo } }),
      });
      await syncLinks(tx, "contact", before.id, before.links.map((l) => l.id), links);
      // A supplier whose primary contact this is shows its Mobile No and Email Id (fetch_from); they
      // follow on the supplier's next save, as in ERPNext.
      return { id: before.id, notices: [] };
    });
  });
}

// Delete ------------------------------------------------------------------------------------------

/** Deletes a contact no PO or supplier points at (check_if_doc_is_linked). */
export function deleteContact(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const c = await tx.purchaseContact.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!c) throw new MasterError("This Contact no longer exists. It may have been deleted.");
      await assertContactUnused(tx, c);
      await tx.purchaseContact.delete({ where: { id: c.id } });
    });
    return undefined;
  });
}
