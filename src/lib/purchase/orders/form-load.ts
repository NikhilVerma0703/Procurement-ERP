// What the PO form opens with: a stored PO (its values, the texts shown beside
// them, its stored figures), or a new one — blank, duplicated, or an amendment
// of a cancelled PO — with the old site's defaults. Server only.
//
// New PO defaults, as the old form set them: today's date, the company's
// currency at rate 1, Buying Settings' price list ("Standard Buying"),
// Shipment Type "Domestic", Purpose "General" (the first options), Mode Of
// Transport "Road", the company's billing and shipping addresses and Place of
// Supply, letter head "Logo", print language "en", and one empty item row
// (Frappe adds a row to a mandatory table). The company is the one the POs
// belong to.
//
// Duplicate copies the PO as Frappe's copy_doc did: everything but the
// no-copy fields (status, payment schedule, print heading, received/billed
// quantities, links to material requests). Amend copies everything and
// becomes a new draft "<number>-1" in the Created state.
import "server-only";
import type { PurchaseOrderCalcResult } from "../calc/index";
import type { CurrencyDisplay } from "../format";
import { siteToday } from "../format";
import { db } from "../server/db";
import type { EngineMasters } from "./engine-input";
import type { ItemRowValues, OrderFormValues } from "./form-schema";
import { orderRecord } from "./load";
import { companyDetails, currencies, taxTemplateRows } from "./masters";
import { DEFAULT_MODE_OF_TRANSPORT, PURPOSES, SHIPMENT_TYPES } from "./options";
import { DOC_STATUS_LABEL, WORKFLOW_STATE_LABEL, orderFormValues, storedFigures, type OrderRecord } from "./record";
import { engineMasters } from "./save";
import { BUYING_SETTINGS } from "./settings";
import { PO_STATUS_KEYS, labelOf } from "./labels";
import type { DocStatus } from "./workflow";

const n = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));

/** The texts the form shows beside its links (fetched again when a link changes). */
export interface FormDisplays {
  supplierName: string | null;
  addressDisplay: string | null;
  supplierGstin: string | null;
  gstCategory: string | null;
  contactDisplay: string | null;
  contactMobile: string | null;
  contactEmail: string | null;
  shippingAddressDisplay: string | null;
  billingAddressDisplay: string | null;
  companyGstin: string | null;
  customerName: string | null;
  customerContactDisplay: string | null;
  customerContactMobile: string | null;
  customerContactEmail: string | null;
  priceListCurrency: string | null;
}

/** Per item row, what the row form shows that is not edited: from the item and the receipts. */
export interface RowInfo {
  stockUom: string | null;
  gstHsnCode: string | null;
  lastPurchaseRate: number;
  receivedQty: number;
  billedAmt: number;
  pageBreak: boolean;
}

export interface OrderDoc {
  id: string | null;
  number: string | null;
  docStatus: DocStatus;
  workflowState: string;
  status: string;
  perReceived: number;
  perBilled: number;
  advancePaid: number;
  updatedAt: string | null;
  createdAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  amendedFrom: { id: string; number: string } | null;
  /** The PO that amends this cancelled one. */
  amendment: { id: string; number: string } | null;
  values: OrderFormValues;
  displays: FormDisplays;
  rowInfo: RowInfo[];
  /** The stored figures of a submitted or cancelled PO (shown as approved, never recomputed). */
  figures: PurchaseOrderCalcResult | null;
  links: { docType: string; docName: string; docDate: string | null; docStatus: string | null }[];
}

export interface FormMasters {
  engine: EngineMasters;
  currencyDisplay: Record<string, CurrencyDisplay>;
}

export async function formMasters(): Promise<FormMasters> {
  const company = await defaultCompany();
  const [engine, cur] = await Promise.all([engineMasters(company?.defaultCurrency ?? "INR"), currencies()]);
  return {
    engine,
    currencyDisplay: Object.fromEntries(cur.map((c) => [c.code, { symbol: c.symbol, fractionUnits: c.fractionUnits }])),
  };
}

/** The company POs are made for: the one most of them belong to. */
async function defaultCompany() {
  const [top] = await db.purchaseOrder.groupBy({ by: ["companyId"], _count: { _all: true }, orderBy: { _count: { companyId: "desc" } }, take: 1 });
  return top
    ? db.purchaseCompany.findUnique({ where: { id: top.companyId } })
    : db.purchaseCompany.findFirst({ orderBy: { code: "asc" } });
}

export function emptyItem(scheduleDate: string | null = null): ItemRowValues {
  return {
    itemCode: "", itemName: "", description: "", scheduleDate: scheduleDate ?? "", expectedDeliveryDate: null,
    qty: 0, uom: "", conversionFactor: 1, priceListRate: 0, discountPercentage: 0, discountAmount: 0,
    marginType: null, marginRateOrAmount: 0, rate: 0, itemTaxTemplate: null, warehouse: null,
    expenseAccount: null, costCenter: null, applyTds: true, weightPerUnit: 0,
  };
}

const NO_DISPLAYS: FormDisplays = {
  supplierName: null, addressDisplay: null, supplierGstin: null, gstCategory: null, contactDisplay: null,
  contactMobile: null, contactEmail: null, shippingAddressDisplay: null, billingAddressDisplay: null,
  companyGstin: null, customerName: null, customerContactDisplay: null, customerContactMobile: null,
  customerContactEmail: null, priceListCurrency: null,
};

const blankRow = (): RowInfo => ({ stockUom: null, gstHsnCode: null, lastPurchaseRate: 0, receivedQty: 0, billedAmt: 0, pageBreak: false });

function displaysOf(o: OrderRecord): FormDisplays {
  return {
    supplierName: o.supplierName,
    addressDisplay: o.addressDisplay,
    supplierGstin: o.supplierGstin,
    gstCategory: o.gstCategory,
    contactDisplay: o.contactDisplay,
    contactMobile: o.contactMobile,
    contactEmail: o.contactEmail,
    shippingAddressDisplay: o.shippingAddressDisplay,
    billingAddressDisplay: o.billingAddressDisplay,
    companyGstin: o.companyGstin,
    customerName: o.customerName,
    customerContactDisplay: o.customerContactDisplay,
    customerContactMobile: o.customerContactMobile,
    customerContactEmail: o.customerContactEmail,
    priceListCurrency: o.priceListCurrency,
  };
}

const rowInfoOf = (o: OrderRecord): RowInfo[] =>
  o.items.map((i) => ({
    stockUom: i.stockUom,
    gstHsnCode: i.gstHsnCode,
    lastPurchaseRate: n(i.lastPurchaseRate),
    receivedQty: n(i.receivedQty),
    billedAmt: n(i.billedAmt),
    pageBreak: i.pageBreak,
  }));

/** A stored PO, as the form opens it. */
export async function loadOrderDoc(id: string): Promise<OrderDoc | null> {
  const o = await orderRecord(id);
  if (!o) return null;
  const [amendment, links] = await Promise.all([
    db.purchaseOrder.findFirst({ where: { amendedFromId: o.id }, select: { id: true, number: true } }),
    db.purchaseOrderLink.findMany({ where: { orderId: o.id }, orderBy: [{ docType: "asc" }, { docName: "asc" }] }),
  ]);
  const draft = o.docStatus === "DRAFT";
  return {
    id: o.id,
    number: o.number,
    docStatus: DOC_STATUS_LABEL[o.docStatus],
    workflowState: WORKFLOW_STATE_LABEL[o.workflowState],
    status: labelOf(PO_STATUS_KEYS, o.status),
    perReceived: n(o.perReceived),
    perBilled: n(o.perBilled),
    advancePaid: n(o.advancePaid),
    updatedAt: o.updatedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
    createdBy: o.createdBy,
    updatedBy: o.updatedBy,
    amendedFrom: o.amendedFrom,
    amendment,
    values: orderFormValues(o),
    displays: displaysOf(o),
    rowInfo: rowInfoOf(o),
    figures: draft ? null : storedFigures(o),
    links: links.map((l) => ({ docType: l.docType, docName: l.docName, docDate: l.docDate ? l.docDate.toISOString().slice(0, 10) : null, docStatus: l.docStatus })),
  };
}

function newDoc(values: OrderFormValues, displays: FormDisplays, rowInfo: RowInfo[], amendedFrom: OrderDoc["amendedFrom"] = null): OrderDoc {
  return {
    id: null, number: null, docStatus: "Draft", workflowState: "Created", status: "Draft",
    perReceived: 0, perBilled: 0, advancePaid: 0, updatedAt: null, createdAt: null, createdBy: null, updatedBy: null,
    amendedFrom, amendment: null, values, displays, rowInfo, figures: null, links: [],
  };
}

/** A blank new PO with the old form's defaults. */
export async function blankOrderDoc(): Promise<OrderDoc> {
  const company = await defaultCompany();
  const cd = company ? await companyDetails(company.code) : null;
  // apply_default_taxes: the company's default Purchase Taxes and Charges Template, if it has one.
  const defaultTaxes = company
    ? await db.purchaseTaxTemplate.findFirst({ where: { companyId: company.id, isDefault: true, disabled: false } })
    : null;
  const today = siteToday();
  const values: OrderFormValues = {
    supplier: "",
    transactionDate: today,
    scheduleDate: null,
    company: company?.code ?? "",
    shipmentType: SHIPMENT_TYPES[0],
    modeOfTransport: DEFAULT_MODE_OF_TRANSPORT,
    purposeOfPurchase: PURPOSES[0],
    applyTds: false,
    taxWithholdingCategory: null,
    isReverseCharge: false,
    isSubcontracted: false,
    costCenter: null,
    currency: cd?.defaultCurrency ?? "INR",
    conversionRate: 1,
    buyingPriceList: BUYING_SETTINGS.buyingPriceList,
    plcConversionRate: 1,
    ignorePricingRule: false,
    setWarehouse: null,
    items: [emptyItem()],
    costOverheads: [],
    taxCategory: null,
    taxesAndCharges: defaultTaxes?.code ?? null,
    taxes: defaultTaxes ? await taxTemplateRows(defaultTaxes.code) : [],
    disableRoundedTotal: false,
    applyDiscountOn: "Grand Total",
    additionalDiscountPercentage: 0,
    discountAmount: 0,
    supplierAddress: null,
    contactPerson: null,
    shippingAddress: cd?.shippingAddress?.code ?? null,
    billingAddress: cd?.billingAddress?.code ?? null,
    placeOfSupply: cd?.placeOfSupply ?? null,
    customer: null,
    customerContactPerson: null,
    paymentTermsTemplate: null,
    paymentSchedule: [],
    termsTemplate: null,
    terms: "",
    letterHead: cd?.letterHead ?? null,
    groupSameItems: false,
    selectPrintHeading: null,
    language: "en",
  };
  const priceList = await db.purchasePriceList.findUnique({ where: { code: BUYING_SETTINGS.buyingPriceList }, select: { currency: true } });
  return newDoc(
    values,
    {
      ...NO_DISPLAYS,
      shippingAddressDisplay: cd?.shippingAddress?.display ?? null,
      billingAddressDisplay: cd?.billingAddress?.display ?? null,
      companyGstin: cd?.billingAddress?.gstin ?? null,
      priceListCurrency: priceList?.currency ?? null,
    },
    [blankRow()],
  );
}

/** Duplicate: a new draft with the PO's values, as Frappe's copy_doc made it. */
export async function duplicateOrderDoc(id: string): Promise<OrderDoc | null> {
  const o = await orderRecord(id);
  if (!o) return null;
  const v = orderFormValues(o);
  const values: OrderFormValues = {
    ...v,
    items: v.items.map(({ id: _id, ...row }) => row),
    taxes: (v.taxes ?? []).map(({ id: _id, ...row }) => row),
    costOverheads: (v.costOverheads ?? []).map(({ id: _id, ...row }) => row),
    // no_copy: payment_schedule, select_print_heading.
    paymentSchedule: [],
    selectPrintHeading: null,
  };
  return newDoc(values, displaysOf(o), rowInfoOf(o).map((r) => ({ ...r, receivedQty: 0, billedAmt: 0, pageBreak: false })));
}

/** Amend: a new draft carrying everything of the cancelled PO, saved as "<number>-1". */
export async function amendmentDoc(id: string): Promise<{ doc: OrderDoc } | { error: string }> {
  const o = await orderRecord(id);
  if (!o) return { error: "This Purchase Order no longer exists." };
  if (o.docStatus !== "CANCELLED") return { error: `Only a cancelled Purchase Order can be amended; ${o.number} is not cancelled.` };
  const existing = await db.purchaseOrder.findFirst({ where: { amendedFromId: o.id }, select: { number: true } });
  if (existing) return { error: `This document is already amended (${existing.number}), you cannot amend it again.` };
  const v = orderFormValues(o);
  const values: OrderFormValues = {
    ...v,
    items: v.items.map(({ id: _id, ...row }) => row),
    taxes: (v.taxes ?? []).map(({ id: _id, ...row }) => row),
    costOverheads: (v.costOverheads ?? []).map(({ id: _id, ...row }) => row),
    paymentSchedule: (v.paymentSchedule ?? []).map(({ id: _id, ...row }) => row),
  };
  return { doc: newDoc(values, displaysOf(o), rowInfoOf(o).map((r) => ({ ...r, receivedQty: 0, billedAmt: 0 })), { id: o.id, number: o.number }) };
}
