// The Address master on the server: its list, one address's form values,
// and its save and delete. A save re-checks the form and sets what Frappe
// and India Compliance set: the name of a new address ("{title}-{type}"), the
// links' titles, the preferred-address flags taken from the party's other
// addresses, and the GSTIN, GST Category, GST State and its number.
import "server-only";
import type { Prisma } from "@prisma/client";
import { isCountry } from "../../countries";
import { addressGst } from "../../gstin";
import type { ActionResult } from "../../orders/form-schema";
import { masterPath } from "../../routes";
import type { PurchaseUser } from "../../server/current-user";
import { db } from "../../server/db";
import { assertFresh, MasterError, masterResult, refuseIf, stampsOf, syncRows, type Stamp } from "../kit";
import type { ListPage, ListShape, MasterListQuery } from "../list-query";
import { assertAddressUnused, dedupeLinks, insertAddress, linkKey, resolveLink, takePreferredFlags, type ResolvedLink } from "../parties";
import type { Row, Values } from "../spec";
import { cleanValues, flag, mandatoryErrors, rowsOf, rstr, str } from "../values";
import { addressIndicator, addressSpec } from "./spec";

type Tx = Prisma.TransactionClient;

// The list ----------------------------------------------------------------------------------------

/** Address list: Address Type and Country are its standard filters; the latest change first. */
export const ADDRESS_LIST: ListShape = { filters: ["address_type", "country"], sorts: ["modified", "creation", "name"], defaultSort: "modified", defaultOrder: "desc" };

const ORDER: Record<string, (o: "asc" | "desc") => Prisma.PurchaseAddressOrderByWithRelationInput> = {
  modified: (o) => ({ updatedAt: o }),
  creation: (o) => ({ createdAt: o }),
  name: (o) => ({ code: o }),
};

export async function listAddresses(q: MasterListQuery): Promise<ListPage> {
  const has = (s: string) => ({ contains: s, mode: "insensitive" as const });
  const base: Prisma.PurchaseAddressWhereInput = {
    // The search covers the name and the doctype's search fields (country, state), and the party.
    ...(q.q ? { OR: [{ code: has(q.q) }, { addressTitle: has(q.q) }, { city: has(q.q) }, { state: has(q.q) }, { links: { some: { linkName: has(q.q) } } }] } : {}),
    ...(q.filters.address_type ? { addressType: q.filters.address_type } : {}),
    ...(q.filters.country ? { country: q.filters.country } : {}),
  };
  const where: Prisma.PurchaseAddressWhereInput = q.idFilter ? { AND: [base, { id: q.idFilter }] } : base;
  const [rows, total] = await Promise.all([
    db.purchaseAddress.findMany({
      where,
      orderBy: [(ORDER[q.sort] ?? ORDER.modified)(q.order), { code: "asc" }],
      take: q.limit,
      select: { id: true, code: true, addressType: true, city: true, disabled: true, updatedAt: true },
    }),
    db.purchaseAddress.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((a) => ({
      id: a.id,
      href: masterPath("addresses", a.id),
      title: a.code,
      name: a.code,
      pill: addressIndicator(a),
      cells: { address_type: a.addressType, city: a.city },
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}

/** The Country filter's options: the countries addresses are in. */
export async function addressCountries(): Promise<string[]> {
  return (await db.purchaseAddress.findMany({ select: { country: true }, distinct: ["country"], orderBy: { country: "asc" } })).map((a) => a.country);
}

// One address -------------------------------------------------------------------------------------

export interface AddressDoc {
  id: string;
  code: string;
  updatedAt: string;
  indicator: ReturnType<typeof addressIndicator>;
  values: Values;
  created: Stamp;
  edited: Stamp;
}

export async function loadAddress(id: string): Promise<AddressDoc | null> {
  const a = await db.purchaseAddress.findUnique({ where: { id }, include: { links: { orderBy: { idx: "asc" } } } });
  if (!a) return null;
  return {
    id: a.id,
    code: a.code,
    updatedAt: a.updatedAt.toISOString(),
    indicator: addressIndicator(a),
    values: {
      _name: a.code,
      address_title: a.addressTitle,
      address_type: a.addressType,
      address_line1: a.addressLine1,
      address_line2: a.addressLine2,
      city: a.city,
      county: a.county,
      state: a.state,
      country: a.country,
      pincode: a.pincode,
      email_id: a.emailId,
      phone: a.phone,
      fax: a.fax,
      tax_category: a.taxCategory,
      is_primary_address: a.isPrimaryAddress,
      is_shipping_address: a.isShippingAddress,
      disabled: a.disabled,
      gstin: a.gstin,
      gst_state: a.gstState,
      gst_category: a.gstCategory,
      gst_state_number: a.gstStateNumber,
      is_your_company_address: a.isYourCompanyAddress,
      links: a.links.map((l) => ({ _key: l.id, link_doctype: l.linkDoctype, link_name: l.linkName, link_title: l.linkTitle })),
    },
    ...(await stampsOf({ ...a, createdBy: a.createdBy, updatedBy: a.updatedBy })),
  };
}

// Save --------------------------------------------------------------------------------------------

export interface SaveMasterRequest {
  id: string | null;
  values: unknown;
  expectedUpdatedAt?: string | null;
}

const fieldError = (field: string, message: string) => new MasterError(message, { [field]: message });

/** The form's link rows, resolved to their parties (refusing a party that is not there). */
export async function linksOf(tx: Tx, rows: Row[], kept: Map<string, string | null>): Promise<(ResolvedLink & { _key: string })[]> {
  const typed = rows.map((r) => ({ _key: r._key, linkDoctype: rstr(r, "link_doctype") ?? "", linkName: rstr(r, "link_name") ?? "" }));
  const out = [];
  for (const [i, r] of dedupeLinks(typed).entries()) out.push({ _key: r._key, ...(await resolveLink(tx, r, `Links Row #${i + 1}`, kept)) });
  return out;
}

export function saveAddress(user: PurchaseUser, req: SaveMasterRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const cleaned = cleanValues(addressSpec, req.values);
    if ("invalid" in cleaned) throw new MasterError(cleaned.invalid);
    const v = cleaned.values;
    refuseIf(cleaned.errors);
    const missing = mandatoryErrors(addressSpec, v, isNew);
    refuseIf(missing.errors, missing.message);

    const country = str(v, "country")!;
    if (!isCountry(country)) throw fieldError("country", `Could not find Country: ${country}`);
    // India Compliance's address.validate.
    const gst = addressGst({ gstin: str(v, "gstin"), gstCategory: str(v, "gst_category"), country, state: str(v, "state"), pincode: str(v, "pincode") });
    refuseIf(Object.fromEntries(gst.problems.map((p) => [p.field, p.message])));
    const notices = gst.gstCategory !== str(v, "gst_category") ? [`GST Category updated to ${gst.gstCategory}.`] : [];

    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchaseAddress.findUnique({ where: { id: req.id }, include: { links: true } }) : null;
      if (req.id && !before) throw new MasterError("This Address no longer exists. It may have been deleted.");
      if (before) assertFresh("Address", before.updatedAt, req.expectedUpdatedAt);

      const taxCategory = str(v, "tax_category");
      if (taxCategory && !(await tx.purchaseTaxCategory.findUnique({ where: { code: taxCategory }, select: { id: true } }))) throw fieldError("tax_category", `Could not find Tax Category: ${taxCategory}`);
      const kept = new Map((before?.links ?? []).map((l) => [linkKey(l), l.linkTitle] as const));
      const links = await linksOf(tx, rowsOf(v, "links"), kept);

      const fields = {
        addressType: str(v, "address_type")!,
        addressLine1: str(v, "address_line1")!,
        addressLine2: str(v, "address_line2"),
        city: str(v, "city")!,
        county: str(v, "county"),
        state: str(v, "state"),
        country,
        pincode: str(v, "pincode"),
        emailId: str(v, "email_id"),
        phone: str(v, "phone"),
        fax: str(v, "fax"),
        isPrimaryAddress: flag(v, "is_primary_address"),
        isShippingAddress: flag(v, "is_shipping_address"),
        disabled: flag(v, "disabled"),
        gstin: gst.gstin || null,
        gstCategory: gst.gstCategory,
      };

      if (!before) {
        const a = await insertAddress(tx, { ...fields, addressTitle: str(v, "address_title"), links }, user.email);
        await tx.purchaseAddress.update({ where: { id: a.id }, data: { taxCategory, isYourCompanyAddress: flag(v, "is_your_company_address") } });
        return { id: a.id, notices };
      }

      await tx.purchaseAddress.update({
        where: { id: before.id },
        data: {
          ...fields,
          addressTitle: str(v, "address_title"),
          taxCategory,
          isYourCompanyAddress: flag(v, "is_your_company_address"),
          gstState: gst.gstState,
          gstStateNumber: gst.gstStateNumber,
          updatedBy: user.email,
        },
      });
      await syncLinks(tx, "address", before.id, before.links.map((l) => l.id), links);
      await takePreferredFlags(tx, before.id, fields, links);
      return { id: before.id, notices };
    });
  });
}

/** Saves a record's Links rows (kept by id, as Frappe kept child rows by name). */
export async function syncLinks(tx: Tx, of: "address" | "contact", parentId: string, existingIds: string[], links: (ResolvedLink & { _key: string })[]) {
  const data = (l: ResolvedLink, idx: number) => ({ idx, linkDoctype: l.linkDoctype, linkName: l.linkName, linkTitle: l.linkTitle, supplierId: l.supplierId, customerId: l.customerId, companyId: l.companyId });
  const byKey = new Map(links.map((l) => [l._key, l]));
  const rows: Row[] = links.map((l) => ({ _key: l._key }));
  if (of === "address") {
    await syncRows(existingIds, rows, {
      remove: (ids) => tx.purchaseAddressLink.deleteMany({ where: { id: { in: ids }, addressId: parentId } }),
      update: (id, r, idx) => tx.purchaseAddressLink.update({ where: { id }, data: data(byKey.get(r._key)!, idx) }),
      create: (r, idx) => tx.purchaseAddressLink.create({ data: { addressId: parentId, ...data(byKey.get(r._key)!, idx) } }),
    });
  } else {
    await syncRows(existingIds, rows, {
      remove: (ids) => tx.purchaseContactLink.deleteMany({ where: { id: { in: ids }, contactId: parentId } }),
      update: (id, r, idx) => tx.purchaseContactLink.update({ where: { id }, data: data(byKey.get(r._key)!, idx) }),
      create: (r, idx) => tx.purchaseContactLink.create({ data: { contactId: parentId, ...data(byKey.get(r._key)!, idx) } }),
    });
  }
}

// Delete ------------------------------------------------------------------------------------------

/** Deletes an address no PO or supplier points at (check_if_doc_is_linked). */
export function deleteAddress(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const a = await tx.purchaseAddress.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!a) throw new MasterError("This Address no longer exists. It may have been deleted.");
      await assertAddressUnused(tx, a);
      await tx.purchaseAddress.delete({ where: { id: a.id } });
    });
    return undefined;
  });
}
