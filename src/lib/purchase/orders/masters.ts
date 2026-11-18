// What the PO form fetches from the masters when a field changes — the old
// site's fetches (ERPNext get_party_details / get_item_details, India
// Compliance's GST template choice, the add-on's Cost Overhead account), read
// from the imported masters. Server only; the browser reaches these through
// app/purchase/orders/fetches.ts.
import "server-only";
import { addressDisplay, contactDisplay, placeOfSupply } from "../address";
import type { PaymentTermInput } from "../calc/schedule";
import { db } from "../server/db";
import { ADD_DEDUCT_KEYS, CHARGE_TYPE_KEYS, TAX_CATEGORY_KEYS, labelOf } from "./labels";
import type { TaxRowValues } from "./form-schema";

const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface CurrencyInfo {
  code: string;
  symbol: string | null;
  fraction: string | null;
  fractionUnits: number | null;
  smallestFraction: number;
  numberFormat: string | null;
}

export async function currencies(): Promise<CurrencyInfo[]> {
  const rows = await db.purchaseCurrency.findMany({ where: { enabled: true }, orderBy: { code: "asc" } });
  return rows.map((c) => ({
    code: c.code, symbol: c.symbol, fraction: c.fraction, fractionUnits: c.fractionUnits,
    smallestFraction: num(c.smallestCurrencyFractionValue), numberFormat: c.numberFormat,
  }));
}

export interface ItemTaxTemplateInfo {
  code: string;
  /** Account → % (what ERPNext stores on a row as item_tax_rate). */
  rates: Record<string, number>;
  gstTreatment: string | null;
}

export async function itemTaxTemplates(): Promise<ItemTaxTemplateInfo[]> {
  const rows = await db.purchaseItemTaxTemplate.findMany({
    where: { disabled: false },
    orderBy: { code: "asc" },
    include: { rates: { orderBy: { idx: "asc" }, include: { account: { select: { code: true } } } } },
  });
  return rows.map((t) => ({ code: t.code, gstTreatment: t.gstTreatment, rates: Object.fromEntries(t.rates.map((r) => [r.account.code, num(r.taxRate)])) }));
}

/**
 * GST Settings' account → GST tax type (igst, cgst, sgst, cess, … and "_rcm"), as India Compliance
 * set it on every tax row. Read from the tax templates and the stored POs, which recorded it.
 */
export async function gstAccountTypes(): Promise<Record<string, string>> {
  const rows = await db.$queryRaw<{ code: string; gst_tax_type: string }[]>`
    select a.code, t.gst_tax_type from purchase_tax_template_rows t join purchase_accounts a on a.id = t.account_head_id where t.gst_tax_type is not null
    union
    select a.code, t.gst_tax_type from purchase_order_taxes t join purchase_accounts a on a.id = t.account_head_id where t.gst_tax_type is not null`;
  return Object.fromEntries(rows.map((r) => [r.code, r.gst_tax_type]));
}

export interface AddressInfo {
  code: string;
  display: string;
  gstin: string | null;
  gstCategory: string | null;
  gstState: string | null;
  gstStateNumber: string | null;
  taxCategory: string | null;
}

type AddressRow = Awaited<ReturnType<typeof db.purchaseAddress.findFirstOrThrow>>;
const toAddress = (a: AddressRow): AddressInfo => ({
  code: a.code,
  display: addressDisplay(a),
  gstin: a.gstin,
  gstCategory: a.gstCategory,
  gstState: a.gstState,
  gstStateNumber: a.gstStateNumber,
  taxCategory: a.taxCategory,
});

export async function addressInfo(code: string): Promise<AddressInfo | null> {
  const a = await db.purchaseAddress.findUnique({ where: { code } });
  return a ? toAddress(a) : null;
}

/** A supplier's or company's addresses, the default first (ERPNext get_default_address: primary first). */
export async function partyAddresses(party: { supplier?: string; company?: string }): Promise<AddressInfo[]> {
  const rows = await db.purchaseAddress.findMany({
    where: {
      disabled: false,
      links: { some: party.supplier ? { supplier: { code: party.supplier } } : { company: { code: party.company ?? "" } } },
    },
    orderBy: [{ isPrimaryAddress: "desc" }, { code: "asc" }],
  });
  return rows.map(toAddress);
}

export interface ContactInfo {
  code: string;
  display: string;
  mobile: string | null;
  email: string | null;
}

type ContactRow = Awaited<ReturnType<typeof db.purchaseContact.findFirstOrThrow>>;
const toContact = (c: ContactRow): ContactInfo => ({ code: c.code, display: contactDisplay(c), mobile: c.mobileNo ?? c.phone, email: c.emailId });

export async function contactInfo(code: string): Promise<ContactInfo | null> {
  const c = await db.purchaseContact.findUnique({ where: { code } });
  return c ? toContact(c) : null;
}

export async function supplierContacts(supplier: string): Promise<ContactInfo[]> {
  const rows = await db.purchaseContact.findMany({
    where: { links: { some: { supplier: { code: supplier } } } },
    orderBy: [{ isPrimaryContact: "desc" }, { code: "asc" }],
  });
  return rows.map(toContact);
}

export interface SupplierDetails {
  code: string;
  supplierName: string;
  disabled: boolean;
  onHold: boolean;
  preventPos: boolean;
  warnPos: boolean;
  defaultCurrency: string | null;
  defaultPriceList: string | null;
  paymentTermsTemplate: string | null;
  taxCategory: string | null;
  gstCategory: string | null;
  isInternalSupplier: boolean;
  address: AddressInfo | null;
  contact: ContactInfo | null;
}

export async function supplierDetails(code: string): Promise<SupplierDetails | null> {
  const s = await db.purchaseSupplier.findUnique({
    where: { code },
    include: { defaultPriceList: true, paymentTermsTemplate: true, taxCategory: true, primaryAddressRef: true, primaryContact: true },
  });
  if (!s) return null;
  const address = s.primaryAddressRef ? toAddress(s.primaryAddressRef) : ((await partyAddresses({ supplier: code }))[0] ?? null);
  const contact = s.primaryContact ? toContact(s.primaryContact) : ((await supplierContacts(code))[0] ?? null);
  return {
    code: s.code,
    supplierName: s.supplierName,
    disabled: s.disabled,
    onHold: s.onHold,
    preventPos: s.preventPos,
    warnPos: s.warnPos,
    defaultCurrency: s.defaultCurrency,
    defaultPriceList: s.defaultPriceList?.code ?? null,
    paymentTermsTemplate: s.paymentTermsTemplate?.code ?? null,
    // get_address_tax_category (Accounts Settings: from the Billing Address): the address's, else the supplier's.
    taxCategory: address?.taxCategory ?? s.taxCategory?.code ?? null,
    gstCategory: s.gstCategory,
    isInternalSupplier: s.isInternalSupplier,
    address,
    contact,
  };
}

export interface CompanyDetails {
  code: string;
  defaultCurrency: string;
  costCenter: string | null;
  letterHead: string | null;
  billingAddress: AddressInfo | null;
  shippingAddress: AddressInfo | null;
  placeOfSupply: string | null;
}

export async function companyDetails(code: string): Promise<CompanyDetails | null> {
  const c = await db.purchaseCompany.findUnique({ where: { code } });
  if (!c) return null;
  const legacy = (c.legacy ?? {}) as Record<string, string | null>;
  const addresses = await partyAddresses({ company: code });
  const billing = addresses[0] ?? null;
  const shipping = (await db.purchaseAddress.findFirst({ where: { isShippingAddress: true, links: { some: { company: { code } } } } }).then((a) => (a ? toAddress(a) : null))) ?? billing;
  const letterHead = await db.purchaseLetterHead.findFirst({ where: { disabled: false }, orderBy: { isDefault: "desc" } });
  return {
    code: c.code,
    defaultCurrency: c.defaultCurrency ?? "INR",
    costCenter: legacy.cost_center ?? null,
    letterHead: legacy.default_letter_head ?? letterHead?.code ?? null,
    billingAddress: billing,
    shippingAddress: shipping,
    placeOfSupply: placeOfSupply(billing?.gstStateNumber, billing?.gstState),
  };
}

/**
 * India Compliance's choice of GST template when the supplier has no Tax Category: same GST state
 * as the company → in-state, another state → out-state; reverse charge picks the RCM pair. None
 * for a supplier without a GSTIN (overseas, unregistered).
 */
export function gstTaxCategory(supplierGstin: string | null, companyGstin: string | null, reverseCharge: boolean): string | null {
  if (!supplierGstin || !companyGstin) return null;
  const inState = supplierGstin.slice(0, 2) === companyGstin.slice(0, 2);
  if (reverseCharge) return inState ? "Reverse Charge In-State" : "Reverse Charge Out-State";
  return inState ? "In-State" : "Out-State";
}

/** The Purchase Taxes and Charges Template of a Tax Category. */
export async function taxTemplateForCategory(category: string): Promise<string | null> {
  const t = await db.purchaseTaxTemplate.findFirst({ where: { disabled: false, taxCategory: { code: category } }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] });
  return t?.code ?? null;
}

/** A taxes template's rows, as they are copied onto the PO. */
export async function taxTemplateRows(code: string): Promise<TaxRowValues[]> {
  const t = await db.purchaseTaxTemplate.findUnique({
    where: { code },
    include: { rows: { orderBy: { idx: "asc" }, include: { accountHead: { select: { code: true } } } } },
  });
  return (t?.rows ?? []).map((r) => ({
    category: labelOf(TAX_CATEGORY_KEYS, r.category),
    addDeductTax: labelOf(ADD_DEDUCT_KEYS, r.addDeductTax),
    chargeType: labelOf(CHARGE_TYPE_KEYS, r.chargeType),
    rowId: r.rowId,
    accountHead: r.accountHead.code,
    description: r.description ?? "",
    rate: num(r.rate),
    taxAmount: num(r.taxAmount),
    includedInPrintRate: r.includedInPrintRate,
    costCenter: null,
    servicePrice: 0,
  }));
}

/** The latest buying exchange rate on or before the date (Currency Exchange). */
export async function exchangeRate(from: string, to: string, date: string): Promise<number | null> {
  if (from === to) return 1;
  const r = await db.purchaseCurrencyExchange.findFirst({
    where: { fromCurrency: from, toCurrency: to, forBuying: true, date: { lte: new Date(`${date}T00:00:00Z`) } },
    orderBy: { date: "desc" },
  });
  return r ? num(r.exchangeRate) : null;
}

export interface ItemDetails {
  itemCode: string;
  itemName: string;
  description: string;
  gstHsnCode: string | null;
  stockUom: string;
  uom: string;
  conversionFactor: number;
  itemTaxTemplate: string | null;
  warehouse: string | null;
  expenseAccount: string | null;
  costCenter: string | null;
  weightPerUnit: number;
  lastPurchaseRate: number;
  /** Why it cannot be ordered, if it cannot (disabled, a template with variants). */
  refusal: string | null;
}

export interface ItemContext {
  company: string;
  taxCategory: string | null;
  transactionDate: string;
  setWarehouse: string | null;
  conversionRate: number;
}

/**
 * ERPNext's _get_item_tax_template: the item's Item Tax rows valid on the date (newest first),
 * the one for the PO's Tax Category, else one without a category.
 */
function pickItemTaxTemplate(
  taxes: { validFrom: Date | null; taxCategory: { code: string } | null; itemTaxTemplate: { code: string; disabled: boolean } }[],
  taxCategory: string | null,
  date: string,
): string | null {
  const valid = taxes
    .filter((t) => !t.itemTaxTemplate.disabled && (!t.validFrom || ymd(t.validFrom) <= date))
    .sort((a, b) => (b.validFrom?.getTime() ?? 0) - (a.validFrom?.getTime() ?? 0));
  const match = valid.find((t) => (t.taxCategory?.code ?? null) === taxCategory) ?? valid.find((t) => !t.taxCategory);
  return match?.itemTaxTemplate.code ?? null;
}

export async function itemDetails(code: string, ctx: ItemContext): Promise<ItemDetails | null> {
  const item = await db.purchaseItem.findUnique({
    where: { code },
    include: {
      uomConversions: true,
      taxes: { include: { taxCategory: { select: { code: true } }, itemTaxTemplate: { select: { code: true, disabled: true } } } },
      defaults: {
        where: { company: { code: ctx.company } },
        include: { defaultWarehouse: { select: { code: true } }, expenseAccount: { select: { code: true } }, buyingCostCenter: { select: { code: true } } },
      },
    },
  });
  if (!item) return null;
  const uom = item.purchaseUom ?? item.stockUom;
  const factor = uom === item.stockUom ? 1 : num(item.uomConversions.find((c) => c.uom === uom)?.conversionFactor) || 1;
  const d = item.defaults[0];
  const company = await companyDetails(ctx.company);
  const refusal = item.disabled
    ? `Item ${item.code} is disabled`
    : item.hasVariants
      ? `Item ${item.code} is a template, please select one of its variants`
      : null;
  return {
    itemCode: item.code,
    itemName: item.itemName,
    description: item.description ?? item.itemName,
    gstHsnCode: item.gstHsnCode,
    stockUom: item.stockUom,
    uom,
    conversionFactor: factor,
    itemTaxTemplate: pickItemTaxTemplate(item.taxes, ctx.taxCategory, ctx.transactionDate),
    warehouse: ctx.setWarehouse ?? d?.defaultWarehouse?.code ?? null,
    expenseAccount: d?.expenseAccount?.code ?? null,
    costCenter: d?.buyingCostCenter?.code ?? company?.costCenter ?? null,
    weightPerUnit: num(item.weightPerUnit),
    lastPurchaseRate: ctx.conversionRate ? num(item.lastPurchaseRate) / ctx.conversionRate : 0,
    refusal,
  };
}

/** The UOM conversion factor of an item for a UOM (1 for its stock UOM). */
export async function uomFactor(itemCode: string, uom: string): Promise<number | null> {
  const item = await db.purchaseItem.findUnique({ where: { code: itemCode }, include: { uomConversions: true } });
  if (!item) return null;
  if (uom === item.stockUom) return 1;
  const c = item.uomConversions.find((x) => x.uom === uom);
  return c ? num(c.conversionFactor) : null;
}

/** A Payment Terms Template's terms, for the Payment Schedule. */
export async function paymentTerms(code: string): Promise<PaymentTermInput[]> {
  const t = await db.purchasePaymentTermsTemplate.findUnique({ where: { code }, include: { rows: { orderBy: { idx: "asc" } } } });
  return (t?.rows ?? []).map((r) => ({
    paymentTermName: r.paymentTermName,
    description: r.description,
    invoicePortion: num(r.invoicePortion),
    modeOfPayment: r.modeOfPayment,
    dueDateBasedOn: r.dueDateBasedOn,
    creditDays: r.creditDays,
    creditMonths: r.creditMonths,
    discountType: r.discountType,
    discount: num(r.discount),
    discountValidityBasedOn: r.discountValidityBasedOn,
    discountValidity: r.discountValidity,
  }));
}

/** A Terms and Conditions template's text. */
export async function termsText(code: string): Promise<string> {
  const t = await db.purchaseTermsTemplate.findUnique({ where: { code } });
  return t?.terms ?? "";
}

/**
 * A Cost Overhead's service item (the add-on): its account is the item's default expense account
 * for the company, and the GST on the charge is at its tax template's highest rate.
 */
export async function serviceItemDetails(code: string, company: string): Promise<{ accountHead: string | null; gstRate: number } | null> {
  const item = await db.purchaseItem.findUnique({
    where: { code },
    include: {
      defaults: { where: { company: { code: company } }, include: { expenseAccount: { select: { code: true } } } },
      taxes: { include: { itemTaxTemplate: { include: { rates: true } } } },
    },
  });
  if (!item) return null;
  const rates = item.taxes.flatMap((t) => t.itemTaxTemplate.rates.map((r) => num(r.taxRate)));
  return { accountHead: item.defaults[0]?.expenseAccount?.code ?? null, gstRate: rates.length ? Math.max(...rates) : 0 };
}
