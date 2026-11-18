// What the PO form fetches when a field changes — the old form's server calls
// (ERPNext get_party_details, get_item_details, get_conversion_factor,
// get_exchange_rate, get_payment_terms, get_taxes_and_charges; India
// Compliance's GST template choice; the add-on's Cost Overhead account and
// its GST row). Server only; the browser reaches these through
// app/purchase/orders/fetches.ts.
import "server-only";
import { flt } from "../calc/pymath";
import { SITE_PRECISION } from "../calc/settings";
import { scheduleFromTerms } from "../calc/schedule";
import { db } from "../server/db";
import type { ScheduleRowValues, TaxRowValues } from "./form-schema";
import {
  addressInfo, companyDetails, contactInfo, exchangeRate, gstTaxCategory, itemDetails, paymentTerms, serviceItemDetails,
  supplierDetails, taxTemplateForCategory, taxTemplateRows, termsText, uomFactor,
  type AddressInfo, type ContactInfo, type ItemDetails,
} from "./masters";
import { derivePlaceOfSupply } from "./gst-rules";

/** The GST template choice for a party (India Compliance get_gst_details, for a purchase). */
export interface PartyTaxes {
  /** null: leave the PO's taxes as they are. */
  taxesAndCharges: string | null;
  taxes: TaxRowValues[] | null;
}

export interface PartyContext {
  company: string;
  companyGstin: string | null;
  placeOfSupply: string | null;
  isReverseCharge: boolean;
}

/**
 * GST not applicable (same GSTIN, a composition dealer, or no supplier GSTIN without reverse
 * charge) clears the taxes; a Tax Category picks its template; otherwise the template follows
 * inter- or intra-state supply and reverse charge.
 */
export async function partyTaxes(a: { address: AddressInfo | null; taxCategory: string | null; gstCategory: string | null }, ctx: PartyContext): Promise<PartyTaxes> {
  const supplierGstin = a.address?.gstin ?? null;
  const gstCategory = a.address?.gstCategory ?? a.gstCategory;
  if ((ctx.companyGstin && supplierGstin && ctx.companyGstin === supplierGstin) || gstCategory === "Registered Composition" || (!ctx.isReverseCharge && !supplierGstin)) {
    return { taxesAndCharges: "", taxes: [] };
  }
  let template = a.taxCategory ? await taxTemplateForCategory(a.taxCategory) : null;
  if (!template) {
    const placeOfSupply = ctx.placeOfSupply || derivePlaceOfSupply(ctx.companyGstin, supplierGstin);
    if (!placeOfSupply) return { taxesAndCharges: null, taxes: null };
    const source = gstCategory === "Overseas" ? "96" : gstCategory === "Unregistered" ? (a.address?.gstStateNumber ?? "") : (supplierGstin || ctx.companyGstin || "").slice(0, 2);
    const category = gstTaxCategory(`${source}`, placeOfSupply.slice(0, 2), ctx.isReverseCharge);
    template = category ? await taxTemplateForCategory(category) : null;
  }
  if (!template) return { taxesAndCharges: null, taxes: null };
  return { taxesAndCharges: template, taxes: await taxTemplateRows(template) };
}

export interface SupplierFetch {
  supplierName: string;
  /** The address's GST Category, else the supplier's. */
  gstCategory: string | null;
  address: AddressInfo | null;
  contact: ContactInfo | null;
  currency: string;
  buyingPriceList: string | null;
  priceListCurrency: string | null;
  paymentTermsTemplate: string | null;
  taxCategory: string | null;
  taxWithholdingCategory: string | null;
  taxes: PartyTaxes;
}

/** get_party_details for a supplier, with India Compliance's GST template. */
export async function fetchSupplier(code: string, ctx: PartyContext & { currentPriceList: string | null }): Promise<SupplierFetch | null> {
  const s = await supplierDetails(code);
  if (!s) return null;
  const company = await db.purchaseCompany.findUnique({ where: { code: ctx.company }, select: { defaultCurrency: true } });
  const priceList = s.defaultPriceList ?? ctx.currentPriceList;
  const pl = priceList ? await db.purchasePriceList.findUnique({ where: { code: priceList }, select: { currency: true } }) : null;
  const supplier = await db.purchaseSupplier.findUnique({ where: { code }, select: { taxWithholdingCategory: true } });
  return {
    supplierName: s.supplierName,
    gstCategory: s.address?.gstCategory ?? s.gstCategory,
    address: s.address,
    contact: s.contact,
    currency: s.defaultCurrency ?? company?.defaultCurrency ?? "INR",
    buyingPriceList: priceList,
    priceListCurrency: pl?.currency ?? null,
    paymentTermsTemplate: s.paymentTermsTemplate,
    taxCategory: s.taxCategory,
    taxWithholdingCategory: supplier?.taxWithholdingCategory ?? null,
    taxes: await partyTaxes({ address: s.address, taxCategory: s.taxCategory, gstCategory: s.gstCategory }, ctx),
  };
}

/** The supplier address changed: its texts, and the Tax Category and template it implies. */
export async function fetchSupplierAddress(code: string, supplier: string, ctx: PartyContext) {
  const a = await addressInfo(code);
  if (!a) return null;
  const s = supplier ? await supplierDetails(supplier) : null;
  // get_address_tax_category: the address's Tax Category, else the supplier's.
  const taxCategory = a.taxCategory ?? s?.taxCategory ?? null;
  return { address: a, taxCategory, taxes: await partyTaxes({ address: a, taxCategory, gstCategory: s?.gstCategory ?? null }, ctx) };
}

export const fetchAddress = (code: string) => addressInfo(code);
export const fetchContact = (code: string) => contactInfo(code);
export const fetchCompany = (code: string) => companyDetails(code);

export async function fetchCustomer(code: string) {
  const c = await db.purchaseCustomer.findUnique({ where: { code }, select: { customerName: true } });
  return c ? { customerName: c.customerName } : null;
}

export async function fetchItem(code: string, ctx: Parameters<typeof itemDetails>[1]): Promise<ItemDetails | null> {
  return itemDetails(code, ctx);
}

export const fetchUomFactor = (itemCode: string, uom: string) => uomFactor(itemCode, uom);

/** A price list's currency (price_list_currency). */
export async function fetchPriceList(code: string) {
  const p = await db.purchasePriceList.findUnique({ where: { code }, select: { currency: true } });
  return p ? { currency: p.currency } : null;
}
export const fetchTaxRows = (template: string) => taxTemplateRows(template);
export const fetchTerms = (template: string) => termsText(template);

/** Tax Category changed: its template, and each item's Item Tax Template for it (update_item_tax_map). */
export async function fetchTaxCategory(category: string | null, items: { itemCode: string }[], ctx: { company: string; transactionDate: string; setWarehouse: string | null; conversionRate: number }) {
  const template = category ? await taxTemplateForCategory(category) : null;
  const itemTemplates: (string | null)[] = [];
  for (const row of items) {
    const d = row.itemCode ? await itemDetails(row.itemCode, { ...ctx, taxCategory: category }) : null;
    itemTemplates.push(d?.itemTaxTemplate ?? null);
  }
  return { taxesAndCharges: template, taxes: template ? await taxTemplateRows(template) : null, itemTemplates };
}

/** Payment Terms Template changed: its schedule rows, dated from the PO date (get_payment_terms). */
export async function fetchPaymentSchedule(template: string, transactionDate: string): Promise<ScheduleRowValues[]> {
  return scheduleFromTerms(await paymentTerms(template), transactionDate).map((t) => ({
    paymentTerm: t.paymentTermName,
    description: t.description,
    dueDate: t.dueDate,
    invoicePortion: t.invoicePortion,
    paymentAmount: 0,
    modeOfPayment: t.modeOfPayment,
    dueDateBasedOn: t.dueDateBasedOn,
    creditDays: t.creditDays,
    creditMonths: t.creditMonths,
    discountType: t.discountType,
    discount: t.discount,
    discountValidityBasedOn: t.discountValidityBasedOn,
    discountValidity: t.discountValidity,
    discountDate: t.discountDate,
  }));
}

/** A schedule row's Payment Term changed (get_payment_term_details). */
export async function fetchPaymentTerm(code: string, transactionDate: string): Promise<Partial<ScheduleRowValues> | null> {
  const t = await db.purchasePaymentTerm.findUnique({ where: { code } });
  if (!t) return null;
  const [row] = scheduleFromTerms(
    [{
      paymentTermName: t.code, description: t.description, invoicePortion: Number(t.invoicePortion ?? 0), modeOfPayment: t.modeOfPayment,
      dueDateBasedOn: t.dueDateBasedOn, creditDays: t.creditDays, creditMonths: t.creditMonths, discountType: t.discountType,
      discount: Number(t.discount ?? 0), discountValidityBasedOn: t.discountValidityBasedOn, discountValidity: t.discountValidity,
    }],
    transactionDate,
  );
  return {
    description: row.description, dueDate: row.dueDate, invoicePortion: row.invoicePortion, modeOfPayment: row.modeOfPayment,
    dueDateBasedOn: row.dueDateBasedOn, creditDays: row.creditDays, creditMonths: row.creditMonths, discountType: row.discountType,
    discount: row.discount, discountValidityBasedOn: row.discountValidityBasedOn, discountValidity: row.discountValidity, discountDate: row.discountDate,
  };
}

/**
 * get_exchange_rate as the old site ran it: its buying Currency Exchange records (stale ones
 * allowed: Accounts Settings), else Currency Exchange Settings' service, frankfurter.dev. Only
 * the two currency codes and the date are sent. null when neither answers.
 */
export async function fetchExchangeRate(from: string, to: string, date: string): Promise<number | null> {
  if (from === to) return 1;
  const stored = await exchangeRate(from, to, date);
  if (stored) return stored;
  try {
    const url = `https://api.frankfurter.dev/v1/${encodeURIComponent(date)}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { rates?: Record<string, number> };
    const rate = body.rates?.[to];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/** The add-on's get_account_head: a service item's expense account for the company. */
export async function fetchServiceItem(code: string, company: string) {
  return serviceItemDetails(code, company);
}

/**
 * The add-on's services_charges: the Actual tax row a Cost Overhead charge adds — on the overhead's
 * account, the GST of the service item (its Item Tax Template's highest rate) on the charges of
 * every overhead row with that account (as the 258 historical rows have it).
 */
export async function fetchOverheadTax(rows: { serviceItem: string | null; serviceCharges: number | null; accountHead: string | null }[], accountHead: string, company: string) {
  const same = rows.filter((r) => r.accountHead === accountHead);
  const service = same.find((r) => r.serviceItem)?.serviceItem;
  const details = service ? await serviceItemDetails(service, company) : null;
  const charges = same.reduce((s, r) => s + (r.serviceCharges ?? 0), 0);
  const account = await db.purchaseAccount.findUnique({ where: { code: accountHead }, select: { accountName: true } });
  return {
    taxAmount: flt((charges * (details?.gstRate ?? 0)) / 100, SITE_PRECISION.currency),
    accountHead,
    description: account?.accountName ?? accountHead,
  };
}

/** An account's name and tax rate, for a tax row (get_tax_rate). */
export async function fetchAccount(code: string) {
  const a = await db.purchaseAccount.findUnique({ where: { code }, select: { accountName: true, legacy: true } });
  if (!a) return null;
  const rate = Number(((a.legacy ?? {}) as Record<string, unknown>).tax_rate ?? 0) || 0;
  return { description: a.accountName, taxRate: rate };
}
