// The Supplier master on the server: its list, one supplier's form values
// with what its screen shows beside them (its addresses, contacts and
// Purchase Orders), and its save and delete. A save re-checks everything the
// form checked and sets every derived field itself (CLAUDE.md, server
// authority): the GST fields (India Compliance), the hold fields
// (Supplier.before_save), the primary contact's mobile and email
// (fetch_from) and the primary address's text.
import "server-only";
import type { Prisma } from "@prisma/client";
import { addressDisplay } from "../../address";
import { isCountry } from "../../countries";
import { addressGst, partyGst } from "../../gstin";
import type { ActionResult } from "../../orders/form-schema";
import { masterPath } from "../../routes";
import type { PurchaseUser } from "../../server/current-user";
import { db } from "../../server/db";
import { assertFresh, dateOf, linkId, MasterError, masterResult, refuseIf, stampsOf, ymd, type Stamp } from "../kit";
import type { ListPage, ListShape, MasterListQuery } from "../list-query";
import { deleteContactAndAddress, insertAddress, insertContact, partyCards, type AddressCard, type ContactCard } from "../parties";
import type { Values } from "../spec";
import { checkNewName, cleanValues, flag, mandatoryErrors, parseFullName, str } from "../values";
import { supplierIndicator, supplierQuickSpec, supplierSpec } from "./spec";

type Tx = Prisma.TransactionClient;

// The list ----------------------------------------------------------------------------------------

/** Supplier list: Supplier Group is its standard filter; sorted as the doctype said (modified, ascending). */
export const SUPPLIER_LIST: ListShape = {
  filters: ["supplier_group"],
  sorts: ["modified", "creation", "name", "supplier_name"],
  defaultSort: "modified",
  defaultOrder: "asc",
};

const ORDER: Record<string, (o: "asc" | "desc") => Prisma.PurchaseSupplierOrderByWithRelationInput> = {
  modified: (o) => ({ updatedAt: o }),
  creation: (o) => ({ createdAt: o }),
  name: (o) => ({ code: o }),
  supplier_name: (o) => ({ supplierName: o }),
};

export async function listSuppliers(q: MasterListQuery): Promise<ListPage> {
  const base: Prisma.PurchaseSupplierWhereInput = {
    ...(q.q ? { OR: [{ code: { contains: q.q, mode: "insensitive" } }, { supplierName: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.filters.supplier_group ? { supplierGroup: { code: q.filters.supplier_group } } : {}),
  };
  const where: Prisma.PurchaseSupplierWhereInput = q.idFilter ? { AND: [base, { id: q.idFilter }] } : base;
  const [rows, total] = await Promise.all([
    db.purchaseSupplier.findMany({
      where,
      orderBy: [(ORDER[q.sort] ?? ORDER.modified)(q.order), { code: "asc" }],
      take: q.limit,
      select: { id: true, code: true, supplierName: true, onHold: true, disabled: true, updatedAt: true, supplierGroup: { select: { code: true } } },
    }),
    db.purchaseSupplier.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((s) => ({
      id: s.id,
      href: masterPath("suppliers", s.id),
      title: s.supplierName,
      name: s.code,
      pill: supplierIndicator(s),
      cells: { supplier_group: s.supplierGroup?.code ?? null },
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}

/** The Supplier Group filter's options. */
export async function supplierGroupNames(): Promise<string[]> {
  return (await db.purchaseSupplierGroup.findMany({ select: { code: true }, orderBy: { code: "asc" } })).map((g) => g.code);
}

// One supplier ------------------------------------------------------------------------------------

export interface SupplierDoc {
  id: string;
  code: string;
  title: string;
  updatedAt: string;
  indicator: ReturnType<typeof supplierIndicator>;
  values: Values;
  addresses: AddressCard[];
  contacts: ContactCard[];
  /** How many Purchase Orders name this supplier (the Dashboard's connection). */
  orders: number;
  created: Stamp;
  edited: Stamp;
}

export async function loadSupplier(id: string): Promise<SupplierDoc | null> {
  const s = await db.purchaseSupplier.findUnique({
    where: { id },
    include: {
      supplierGroup: { select: { code: true } },
      defaultPriceList: { select: { code: true } },
      paymentTermsTemplate: { select: { code: true } },
      taxCategory: { select: { code: true } },
      primaryContact: { select: { code: true } },
      primaryAddressRef: { select: { code: true } },
    },
  });
  if (!s) return null;
  const [cards, orders, stamps] = await Promise.all([partyCards(db, { supplierId: s.id }), db.purchaseOrder.count({ where: { supplierId: s.id } }), stampsOf(s)]);
  return {
    id: s.id,
    code: s.code,
    title: s.supplierName,
    updatedAt: s.updatedAt.toISOString(),
    indicator: supplierIndicator(s),
    values: {
      // The record's name, for the links that list the supplier's own contacts and addresses.
      _name: s.code,
      supplier_name: s.supplierName,
      country: s.country,
      supplier_group: s.supplierGroup?.code ?? null,
      supplier_type: s.supplierType,
      is_transporter: s.isTransporter,
      default_currency: s.defaultCurrency,
      default_price_list: s.defaultPriceList?.code ?? null,
      payment_terms: s.paymentTermsTemplate?.code ?? null,
      tax_id: s.taxId,
      tax_category: s.taxCategory?.code ?? null,
      tax_withholding_category: s.taxWithholdingCategory,
      gstin: s.gstin,
      pan: s.pan,
      gst_category: s.gstCategory,
      supplier_primary_contact: s.primaryContact?.code ?? null,
      mobile_no: s.mobileNo,
      email_id: s.emailId,
      supplier_primary_address: s.primaryAddressRef?.code ?? null,
      primary_address: s.primaryAddress,
      is_frozen: s.isFrozen,
      disabled: s.disabled,
      on_hold: s.onHold,
      hold_type: s.holdType,
      release_date: ymd(s.releaseDate),
    },
    ...cards,
    orders,
    ...stamps,
  };
}

/** The primary contact's Mobile No and Email Id (fetch_from), for the form to show at once. */
export async function supplierContactFetch(code: string): Promise<{ mobile_no: string | null; email_id: string | null } | null> {
  const c = await db.purchaseContact.findUnique({ where: { code }, select: { mobileNo: true, emailId: true } });
  return c ? { mobile_no: c.mobileNo, email_id: c.emailId } : null;
}

/** The primary address's text (get_address_display), for the form to show at once. */
export async function supplierAddressFetch(code: string): Promise<{ primary_address: string } | null> {
  const a = await db.purchaseAddress.findUnique({ where: { code } });
  return a ? { primary_address: addressDisplay(a) } : null;
}

// Save --------------------------------------------------------------------------------------------

export interface SaveSupplierRequest {
  /** The supplier's id; null for a new one. */
  id: string | null;
  values: unknown;
  /** The updatedAt the form was opened with (a save over a later change is refused). */
  expectedUpdatedAt?: string | null;
  /** A new supplier from the quick entry (with its primary contact and address). */
  quick?: boolean;
}

const fieldError = (field: string, message: string) => new MasterError(message, { [field]: message });

export function saveSupplier(user: PurchaseUser, req: SaveSupplierRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const quick = isNew && req.quick === true;
    const spec = quick ? supplierQuickSpec : supplierSpec;
    const cleaned = cleanValues(spec, req.values);
    if ("invalid" in cleaned) throw new MasterError(cleaned.invalid);
    const v = cleaned.values;
    refuseIf(cleaned.errors);
    const missing = mandatoryErrors(spec, v, isNew);
    refuseIf(missing.errors, missing.message);

    const notices: string[] = [];
    const country = str(v, "country");
    if (country && !isCountry(country)) throw fieldError("country", `Could not find Country: ${country}`);

    // India Compliance's validate_party: GSTIN checked, GST Category set from it, PAN from it.
    const gst = partyGst({ gstin: str(v, "gstin"), gstCategory: str(v, "gst_category"), pan: str(v, "pan"), country });
    refuseIf(Object.fromEntries(gst.problems.map((p) => [p.field, p.message])));
    if (gst.gstCategory !== str(v, "gst_category")) notices.push(`GST Category updated to ${gst.gstCategory}.`);

    // Supplier.before_save: an unblocked supplier has no hold; a blocked one holds All by default.
    const onHold = flag(v, "on_hold");
    const holdType = onHold ? (str(v, "hold_type") ?? "All") : null;
    const releaseDate = onHold ? str(v, "release_date") : null;

    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchaseSupplier.findUnique({ where: { id: req.id } }) : null;
      if (req.id && !before) throw new MasterError("This Supplier no longer exists. It may have been deleted.");
      if (before) assertFresh("Supplier", before.updatedAt, req.expectedUpdatedAt);

      const supplierGroupId = await linkId(str(v, "supplier_group"), "Supplier Group", "supplier_group", (code) => tx.purchaseSupplierGroup.findUnique({ where: { code }, select: { id: true } }));
      const currency = str(v, "default_currency");
      if (currency && !(await tx.purchaseCurrency.findUnique({ where: { code: currency }, select: { code: true } }))) throw fieldError("default_currency", `Could not find Billing Currency: ${currency}`);
      const defaultPriceListId = await linkId(str(v, "default_price_list"), "Price List", "default_price_list", (code) => tx.purchasePriceList.findUnique({ where: { code }, select: { id: true } }));
      const paymentTermsTemplateId = await linkId(str(v, "payment_terms"), "Default Payment Terms Template", "payment_terms", (code) => tx.purchasePaymentTermsTemplate.findUnique({ where: { code }, select: { id: true } }));
      const taxCategoryId = await linkId(str(v, "tax_category"), "Tax Category", "tax_category", (code) => tx.purchaseTaxCategory.findUnique({ where: { code }, select: { id: true } }));
      const twc = str(v, "tax_withholding_category");
      if (twc && !(await tx.purchaseSupplier.findFirst({ where: { taxWithholdingCategory: twc }, select: { id: true } }))) throw fieldError("tax_withholding_category", `Could not find Tax Withholding Category: ${twc}`);

      const contactCode = str(v, "supplier_primary_contact");
      const contact = contactCode ? await tx.purchaseContact.findUnique({ where: { code: contactCode }, select: { id: true, mobileNo: true, emailId: true } }) : null;
      if (contactCode && !contact) throw fieldError("supplier_primary_contact", `Could not find Supplier Primary Contact: ${contactCode}`);
      const addressCode = str(v, "supplier_primary_address");
      const address = addressCode ? await tx.purchaseAddress.findUnique({ where: { code: addressCode } }) : null;
      if (addressCode && !address) throw fieldError("supplier_primary_address", `Could not find Supplier Primary Address: ${addressCode}`);

      // Mobile No and Email Id come from the primary contact on every save (fetch_from); without one
      // they stay as they were, unless the contact was just taken off (supplier.js cleared them).
      const contactChanged = (before?.primaryContactId ?? null) !== (contact?.id ?? null);
      const contactFields = contact
        ? { mobileNo: contact.mobileNo, emailId: contact.emailId }
        : contactChanged || !before
          ? { mobileNo: null, emailId: null }
          : { mobileNo: before.mobileNo, emailId: before.emailId };
      // Primary Address was written when the address was picked (supplier.js), not on save.
      const addressChanged = (before?.primaryAddressId ?? null) !== (address?.id ?? null);
      const primaryAddress = address ? (addressChanged || !before ? addressDisplay(address) : before.primaryAddress) : null;

      const data = {
        supplierName: str(v, "supplier_name")!,
        supplierGroupId,
        supplierType: str(v, "supplier_type"),
        country,
        isTransporter: flag(v, "is_transporter"),
        defaultCurrency: currency,
        defaultPriceListId,
        paymentTermsTemplateId,
        taxId: str(v, "tax_id"),
        taxCategoryId,
        taxWithholdingCategory: twc,
        gstin: gst.gstin || null,
        gstCategory: gst.gstCategory,
        pan: gst.pan,
        primaryContactId: contact?.id ?? null,
        ...contactFields,
        primaryAddressId: address?.id ?? null,
        primaryAddress,
        isFrozen: flag(v, "is_frozen"),
        disabled: flag(v, "disabled"),
        onHold,
        holdType,
        releaseDate: dateOf(releaseDate),
        updatedBy: user.email,
      };

      if (before) {
        await tx.purchaseSupplier.update({ where: { id: before.id }, data });
        return { id: before.id, notices };
      }

      // Buying Settings named suppliers by Supplier Name (Supplier.autoname); a name in use is refused.
      const name = checkNewName("Supplier", data.supplierName);
      if ("problem" in name) throw fieldError("supplier_name", name.problem);
      if (await tx.purchaseSupplier.findUnique({ where: { code: name.name }, select: { id: true } })) throw fieldError("supplier_name", `Supplier ${name.name} already exists`);
      const created = await tx.purchaseSupplier.create({ data: { ...data, code: name.name, createdBy: user.email } });
      if (quick) await quickEntryParties(tx, created, v, user.email);
      return { id: created.id, notices };
    });
  });
}

/**
 * What the quick entry made with the supplier: India Compliance's create_primary_address
 * (after_insert, when Address Line 1 was given) and ERPNext's create_primary_contact (on_update,
 * when an email or mobile was given), each then set as the supplier's primary.
 */
async function quickEntryParties(tx: Tx, s: { id: string; code: string; supplierName: string; supplierType: string | null; gstin: string | null; gstCategory: string | null; country: string | null }, v: Values, by: string) {
  const patch: Prisma.PurchaseSupplierUpdateInput = {};
  const link = [{ linkDoctype: "Supplier", linkName: s.code }];

  const line1 = str(v, "qe_address_line1");
  if (line1) {
    const city = str(v, "qe_city");
    const missing = { ...(city ? {} : { qe_city: "City/Town is required" }), ...(s.country ? {} : { country: "Country is required" }) };
    refuseIf(missing, `Mandatory fields required in Address: ${[!city && "City/Town", !s.country && "Country"].filter(Boolean).join(", ")}`);
    const state = str(v, "qe_state");
    const pincode = str(v, "qe_pincode");
    const g = addressGst({ gstin: s.gstin, gstCategory: s.gstCategory, country: s.country!, state, pincode });
    const at: Record<string, string> = { state: "qe_state", pincode: "qe_pincode" };
    refuseIf(Object.fromEntries(g.problems.map((p) => [at[p.field] ?? p.field, `Address: ${p.message}`])));
    const a = await insertAddress(
      tx,
      {
        addressTitle: s.code, addressType: "Billing", addressLine1: line1, addressLine2: str(v, "qe_address_line2"), city: city!, county: null, state, country: s.country!,
        pincode, emailId: null, phone: null, fax: null, isPrimaryAddress: flag(v, "qe_is_primary_address"), isShippingAddress: flag(v, "qe_is_shipping_address"),
        disabled: false, gstin: g.gstin || null, gstCategory: g.gstCategory, links: link,
      },
      by,
    );
    patch.primaryAddressRef = { connect: { id: a.id } };
    patch.primaryAddress = a.display;
  }

  const email = str(v, "qe_email_id");
  const mobile = str(v, "qe_mobile_no");
  if (email || mobile) {
    // make_contact: an individual's name split into first, middle and last; a firm's whole.
    const individual = s.supplierType === "Individual";
    const n = individual ? parseFullName(s.supplierName) : { first: s.supplierName, middle: null, last: null };
    const c = await insertContact(
      tx,
      {
        firstName: n.first, middleName: n.middle, lastName: n.last, companyName: individual ? null : s.supplierName, isPrimaryContact: true,
        emails: email ? [{ emailId: email, isPrimary: true }] : [],
        phones: mobile ? [{ phone: mobile, isPrimaryPhone: false, isPrimaryMobileNo: true }] : [],
        links: link,
      },
      by,
    );
    patch.primaryContact = { connect: { id: c.id } };
    patch.mobileNo = mobile;
    patch.emailId = email;
  }
  if (Object.keys(patch).length) await tx.purchaseSupplier.update({ where: { id: s.id }, data: patch });
}

// Delete ------------------------------------------------------------------------------------------

/**
 * Deletes a supplier no document points at (check_if_doc_is_linked), with the addresses and
 * contacts that were its alone (Supplier.on_trash).
 */
export function deleteSupplier(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const s = await tx.purchaseSupplier.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!s) throw new MasterError("This Supplier no longer exists. It may have been deleted.");
      const po = await tx.purchaseOrder.findFirst({ where: { supplierId: s.id }, select: { number: true }, orderBy: { number: "asc" } });
      if (po) throw new MasterError(`Cannot delete or cancel because Supplier ${s.code} is linked with Purchase Order ${po.number}`);
      const itemDefault = await tx.purchaseItemDefault.findFirst({ where: { defaultSupplier: s.code }, select: { idx: true, item: { select: { code: true } } } });
      if (itemDefault) throw new MasterError(`Cannot delete or cancel because Supplier ${s.code} is linked with Item ${itemDefault.item.code} at Row: ${itemDefault.idx}`);
      await tx.purchaseSupplier.update({ where: { id: s.id }, data: { primaryContactId: null, primaryAddressId: null } });
      await deleteContactAndAddress(tx, { supplierId: s.id });
      await tx.purchaseSupplier.delete({ where: { id: s.id } });
    });
    return undefined;
  });
}
