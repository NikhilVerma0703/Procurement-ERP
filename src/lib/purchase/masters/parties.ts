// Addresses and contacts as Frappe 14 made them, for every screen that makes
// one (the supplier's quick entry, the Address and Contact screens): their
// names, their links to a party (Dynamic Link) with the party's title, the
// preferred-address rule, the primary email and phone, and India
// Compliance's checks on an address.
import "server-only";
import type { Prisma } from "@prisma/client";
import { addressDisplay } from "../address";
import { addressGst } from "../gstin";
import { MasterError } from "./kit";

type Tx = Prisma.TransactionClient;

/** The parties an address or contact can belong to here. */
export const LINK_DOCTYPES = ["Supplier", "Customer", "Company"] as const;
export type LinkDoctype = (typeof LINK_DOCTYPES)[number];

export interface PartyLink {
  linkDoctype: string;
  linkName: string;
}

export interface ResolvedLink {
  linkDoctype: string;
  linkName: string;
  linkTitle: string | null;
  supplierId: string | null;
  customerId: string | null;
  companyId: string | null;
}

/**
 * A link's party, with its title (set_link_title), or Frappe's refusal. A link to a doctype not
 * kept here (Lead) may stay on a record that came with it (`kept`: its links before, by
 * doctype and name, with their titles), but not be added.
 */
export async function resolveLink(tx: Tx, l: PartyLink, where: string, kept?: Map<string, string | null>): Promise<ResolvedLink> {
  const fail = () => {
    throw new MasterError(`${where}: Could not find ${l.linkDoctype}: ${l.linkName}`);
  };
  if (!(LINK_DOCTYPES as readonly string[]).includes(l.linkDoctype)) {
    const key = linkKey(l);
    if (kept?.has(key)) return { linkDoctype: l.linkDoctype, linkName: l.linkName, linkTitle: kept.get(key) ?? null, supplierId: null, customerId: null, companyId: null };
    throw new MasterError(`${where}: Link Document Type must be one of ${LINK_DOCTYPES.join(", ")}`);
  }
  if (l.linkDoctype === "Supplier") {
    const s = await tx.purchaseSupplier.findUnique({ where: { code: l.linkName }, select: { id: true, supplierName: true } });
    if (!s) fail();
    return { linkDoctype: "Supplier", linkName: l.linkName, linkTitle: s!.supplierName || l.linkName, supplierId: s!.id, customerId: null, companyId: null };
  }
  if (l.linkDoctype === "Customer") {
    const c = await tx.purchaseCustomer.findUnique({ where: { code: l.linkName }, select: { id: true, customerName: true } });
    if (!c) fail();
    return { linkDoctype: "Customer", linkName: l.linkName, linkTitle: c!.customerName || l.linkName, supplierId: null, customerId: c!.id, companyId: null };
  }
  if (l.linkDoctype === "Company") {
    const c = await tx.purchaseCompany.findUnique({ where: { code: l.linkName }, select: { id: true } });
    if (!c) fail();
    return { linkDoctype: "Company", linkName: l.linkName, linkTitle: l.linkName, supplierId: null, customerId: null, companyId: c!.id };
  }
  throw new MasterError(`${where}: Link Document Type must be one of ${LINK_DOCTYPES.join(", ")}`);
}

export const linkKey = (l: PartyLink) => `${l.linkDoctype}\u0000${l.linkName}`;

/** deduplicate_dynamic_links: one row per party. */
export function dedupeLinks<T extends PartyLink>(links: T[]): T[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const k = linkKey(l);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Address.autoname: "{Address Title}-{Address Type}", or the next of the series
 * "{Address Title}-{Address Type}-#" when that is taken. (Frappe kept the series' counter in
 * tabSeries; the next number after the highest in use is the same name.)
 */
export async function addressName(tx: Tx, title: string, type: string): Promise<string> {
  const base = `${title.trim()}-${type.trim()}`;
  if (!(await tx.purchaseAddress.findUnique({ where: { code: base }, select: { id: true } }))) return base;
  return `${base}-${(await highestSuffix(tx, "address", base)) + 1}`;
}

/**
 * Contact.autoname: "{First Name} {Last Name}", then "-{the first link's name}", and a number
 * after a dash when that is taken (append_number_if_name_exists).
 */
export async function contactName(tx: Tx, first: string, last: string | null, firstLink: string | null): Promise<string> {
  let name = [first.trim(), (last ?? "").trim()].filter(Boolean).join(" ");
  if (firstLink) name = `${name}-${firstLink.trim()}`;
  if (!(await tx.purchaseContact.findUnique({ where: { code: name }, select: { id: true } }))) return name;
  return `${name}-${(await highestSuffix(tx, "contact", name)) + 1}`;
}

async function highestSuffix(tx: Tx, table: "address" | "contact", base: string): Promise<number> {
  const where = { code: { startsWith: `${base}-` } };
  const rows = table === "address" ? await tx.purchaseAddress.findMany({ where, select: { code: true } }) : await tx.purchaseContact.findMany({ where, select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^(\d+)$/.exec(r.code.slice(base.length + 1));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

export interface AddressInput {
  addressTitle: string | null;
  addressType: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  county: string | null;
  state: string | null;
  country: string;
  pincode: string | null;
  emailId: string | null;
  phone: string | null;
  fax: string | null;
  isPrimaryAddress: boolean;
  isShippingAddress: boolean;
  disabled: boolean;
  gstin: string | null;
  gstCategory: string | null;
  links: PartyLink[];
}

/**
 * validate_preferred_address: an address made a party's Preferred Billing (or Shipping) Address
 * takes the flag from the party's other addresses.
 */
export async function takePreferredFlags(tx: Tx, addressId: string, a: { isPrimaryAddress: boolean; isShippingAddress: boolean }, links: { supplierId: string | null; customerId: string | null; companyId: string | null }[]) {
  for (const flag of ["isPrimaryAddress", "isShippingAddress"] as const) {
    if (!a[flag]) continue;
    for (const l of links) {
      const party = l.supplierId ? { supplierId: l.supplierId } : l.customerId ? { customerId: l.customerId } : l.companyId ? { companyId: l.companyId } : null;
      if (!party) continue;
      await tx.purchaseAddress.updateMany({ where: { id: { not: addressId }, disabled: false, [flag]: true, links: { some: party } }, data: { [flag]: false } });
    }
  }
}

/** Inserts an address (its GST fields already checked), with its links. Returns its id, name and display. */
export async function insertAddress(tx: Tx, a: AddressInput, by: string): Promise<{ id: string; code: string; display: string }> {
  const links = [];
  for (const [i, l] of dedupeLinks(a.links).entries()) links.push(await resolveLink(tx, l, `Links Row #${i + 1}`));
  // autoname: the title defaults to the first link's title or name. Frappe named the address before
  // validate set the links' titles, so a new address took the party's name (its ID).
  const title = a.addressTitle?.trim() || links[0]?.linkName || null;
  if (!title) throw new MasterError("Address Title is mandatory.", { address_title: "Address Title is mandatory." });
  const code = await addressName(tx, title, a.addressType);
  const created = await tx.purchaseAddress.create({
    data: {
      code, addressTitle: title, addressType: a.addressType, addressLine1: a.addressLine1, addressLine2: a.addressLine2, city: a.city,
      county: a.county, state: a.state, country: a.country, pincode: a.pincode, emailId: a.emailId, phone: a.phone, fax: a.fax,
      isPrimaryAddress: a.isPrimaryAddress, isShippingAddress: a.isShippingAddress, disabled: a.disabled,
      gstin: a.gstin, gstCategory: a.gstCategory, ...gstStateOf(a), createdBy: by, updatedBy: by,
      links: { create: links.map((l, i) => ({ idx: i + 1, ...l })) },
    },
  });
  await takePreferredFlags(tx, created.id, a, links);
  return { id: created.id, code, display: addressDisplay(created) };
}

/** GST State and its number, from an Indian address's state (India Compliance set them on save). */
export function gstStateOf(a: Pick<AddressInput, "gstin" | "gstCategory" | "country" | "state" | "pincode">): { gstState: string | null; gstStateNumber: string | null } {
  const g = addressGst({ gstin: a.gstin, gstCategory: a.gstCategory, country: a.country, state: a.state, pincode: a.pincode });
  return { gstState: g.gstState, gstStateNumber: g.gstStateNumber };
}

export interface ContactInput {
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  companyName: string | null;
  isPrimaryContact: boolean;
  emails: { emailId: string; isPrimary: boolean }[];
  phones: { phone: string; isPrimaryPhone: boolean; isPrimaryMobileNo: boolean }[];
  links: PartyLink[];
}

/**
 * The contact's Email Address, Phone and Mobile No from its tables (set_primary_email,
 * set_primary): the one row marked primary (a lone email is primary), or empty; two rows
 * marked primary are refused.
 */
export function primaryOf(c: Pick<ContactInput, "emails" | "phones">): { emails: ContactInput["emails"]; emailId: string | null; phone: string | null; mobileNo: string | null } {
  const emails = c.emails.length === 1 ? [{ ...c.emails[0], isPrimary: true }] : c.emails;
  if (emails.filter((e) => e.isPrimary).length > 1) throw new MasterError("Only one Email ID can be set as primary.", { email_ids: "Only one Email ID can be set as primary." });
  if (c.phones.filter((p) => p.isPrimaryPhone).length > 1) throw new MasterError("Only one Phone can be set as primary.", { phone_nos: "Only one Phone can be set as primary." });
  if (c.phones.filter((p) => p.isPrimaryMobileNo).length > 1) throw new MasterError("Only one Mobile No can be set as primary.", { phone_nos: "Only one Mobile No can be set as primary." });
  return {
    emails,
    emailId: emails.find((e) => e.isPrimary)?.emailId.trim() ?? null,
    phone: c.phones.find((p) => p.isPrimaryPhone)?.phone ?? null,
    mobileNo: c.phones.find((p) => p.isPrimaryMobileNo)?.phone ?? null,
  };
}

/** Inserts a contact with its emails, numbers and links. Returns its id and name. */
export interface ContactExtra {
  status?: string | null;
  salutation?: string | null;
  designation?: string | null;
  gender?: string | null;
  userEmail?: string | null;
  isBillingContact?: boolean;
}

export async function insertContact(tx: Tx, c: ContactInput, by: string, extra: ContactExtra = {}): Promise<{ id: string; code: string; emailId: string | null; mobileNo: string | null }> {
  const links = [];
  for (const [i, l] of dedupeLinks(c.links).entries()) links.push(await resolveLink(tx, l, `Links Row #${i + 1}`));
  const p = primaryOf(c);
  const code = await contactName(tx, c.firstName, c.lastName, links[0]?.linkName ?? null);
  const created = await tx.purchaseContact.create({
    data: {
      code, firstName: c.firstName.trim(), middleName: c.middleName, lastName: c.lastName, companyName: c.companyName,
      status: extra.status ?? "Passive", salutation: extra.salutation ?? null, designation: extra.designation ?? null, gender: extra.gender ?? null,
      isPrimaryContact: c.isPrimaryContact, isBillingContact: extra.isBillingContact ?? false, userEmail: extra.userEmail ?? null,
      emailId: p.emailId, phone: p.phone, mobileNo: p.mobileNo, createdBy: by, updatedBy: by,
      emails: { create: p.emails.map((e, i) => ({ idx: i + 1, emailId: e.emailId.trim(), isPrimary: e.isPrimary })) },
      phones: { create: c.phones.map((x, i) => ({ idx: i + 1, phone: x.phone, isPrimaryPhone: x.isPrimaryPhone, isPrimaryMobileNo: x.isPrimaryMobileNo })) },
      links: { create: links.map((l, i) => ({ idx: i + 1, ...l })) },
    },
  });
  return { id: created.id, code, emailId: p.emailId, mobileNo: p.mobileNo };
}

/** A party's address, as its form's Address & Contact tab listed it (address_list.html). */
export interface AddressCard {
  id: string;
  title: string;
  type: string | null;
  primary: boolean;
  shipping: boolean;
  display: string;
}

/** A party's contact, as contact_list.html listed it. */
export interface ContactCard {
  id: string;
  name: string;
  primary: boolean;
  designation: string | null;
  phone: string | null;
  mobileNo: string | null;
  emailId: string | null;
  otherPhones: string[];
  otherEmails: string[];
}

type PartyWhere = { supplierId: string } | { customerId: string } | { companyId: string };

/**
 * load_address_and_contact: the party's addresses (oldest first, the Preferred Billing one at the
 * top) and contacts (latest change first, the primary one at the top).
 */
export async function partyCards(tx: Tx, party: PartyWhere): Promise<{ addresses: AddressCard[]; contacts: ContactCard[] }> {
  const [addresses, contacts] = await Promise.all([
    tx.purchaseAddress.findMany({ where: { links: { some: party } }, orderBy: [{ isPrimaryAddress: "desc" }, { createdAt: "asc" }] }),
    tx.purchaseContact.findMany({
      where: { links: { some: party } },
      orderBy: [{ isPrimaryContact: "desc" }, { updatedAt: "desc" }],
      include: { emails: { orderBy: { idx: "asc" } }, phones: { orderBy: { idx: "asc" } } },
    }),
  ]);
  return {
    addresses: addresses.map((a) => ({ id: a.id, title: a.addressTitle ?? a.code, type: a.addressType, primary: a.isPrimaryAddress, shipping: a.isShippingAddress, display: addressDisplay(a) })),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      primary: c.isPrimaryContact,
      designation: c.designation,
      phone: c.phone,
      mobileNo: c.mobileNo,
      emailId: c.emailId,
      otherPhones: c.phones.filter((p) => !p.isPrimaryPhone && !p.isPrimaryMobileNo).map((p) => p.phone),
      otherEmails: c.emails.filter((e) => !e.isPrimary).map((e) => e.emailId),
    })),
  };
}

/** check_if_doc_is_linked for an address: Frappe refused to delete one a PO or supplier points at. */
export async function assertAddressUnused(tx: Tx, a: { id: string; code: string }) {
  const po = await tx.purchaseOrder.findFirst({
    where: { OR: [{ supplierAddressId: a.id }, { shippingAddressId: a.id }, { billingAddressId: a.id }] },
    select: { number: true },
    orderBy: { number: "asc" },
  });
  if (po) throw new MasterError(`Cannot delete or cancel because Address ${a.code} is linked with Purchase Order ${po.number}`);
  const s = await tx.purchaseSupplier.findFirst({ where: { primaryAddressId: a.id }, select: { code: true } });
  if (s) throw new MasterError(`Cannot delete or cancel because Address ${a.code} is linked with Supplier ${s.code}`);
}

/** check_if_doc_is_linked for a contact. */
export async function assertContactUnused(tx: Tx, c: { id: string; code: string }) {
  const po = await tx.purchaseOrder.findFirst({
    where: { OR: [{ contactPersonId: c.id }, { customerContactPersonId: c.id }] },
    select: { number: true },
    orderBy: { number: "asc" },
  });
  if (po) throw new MasterError(`Cannot delete or cancel because Contact ${c.code} is linked with Purchase Order ${po.number}`);
  const s = await tx.purchaseSupplier.findFirst({ where: { primaryContactId: c.id }, select: { code: true } });
  if (s) throw new MasterError(`Cannot delete or cancel because Contact ${c.code} is linked with Supplier ${s.code}`);
}

/**
 * delete_contact_and_address, run when a party is deleted: an address or contact that belongs
 * to this party alone is deleted with it; one shared with another party loses only this link.
 */
export async function deleteContactAndAddress(tx: Tx, party: PartyWhere) {
  const addresses = await tx.purchaseAddress.findMany({ where: { links: { some: party } }, select: { id: true, code: true, _count: { select: { links: true } } } });
  for (const a of addresses) {
    if (a._count.links === 1) {
      await assertAddressUnused(tx, a);
      await tx.purchaseAddress.delete({ where: { id: a.id } });
    } else {
      await tx.purchaseAddressLink.deleteMany({ where: { addressId: a.id, ...party } });
    }
  }
  const contacts = await tx.purchaseContact.findMany({ where: { links: { some: party } }, select: { id: true, code: true, _count: { select: { links: true } } } });
  for (const c of contacts) {
    if (c._count.links === 1) {
      await assertContactUnused(tx, c);
      await tx.purchaseContact.delete({ where: { id: c.id } });
    } else {
      await tx.purchaseContactLink.deleteMany({ where: { contactId: c.id, ...party } });
    }
  }
}
