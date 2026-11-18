// One stored PO, as the form and the change history see it. The record is read
// with ORDER_INCLUDE (lib/purchase/orders/load.ts); these are pure functions
// of it:
//   * orderFormValues — what the form edits (links by their ERPNext name);
//   * storedFigures   — the figures as stored, in the engine's result shape, so
//                       a submitted PO shows what was approved (its figures are
//                       never recomputed for display: CLAUDE.md, golden tests);
//   * orderSnapshot   — every field by its ERPNext fieldname, formatted as
//                       Frappe's get_formatted showed it, for version.ts.
import type { Prisma } from "@prisma/client";
import type { PurchaseOrderCalcResult } from "../calc/index";
import type { ItemGstDetail } from "../calc/gst";
import { formatCurrency, formatDate, formatNumber, type CurrencyDisplay } from "../format";
import type { OrderFormValues } from "./form-schema";
import { ADD_DEDUCT_KEYS, CHARGE_TYPE_KEYS, DISCOUNT_ON_KEYS, MARGIN_TYPE_KEYS, PO_STATUS_KEYS, TAX_CATEGORY_KEYS, labelOf } from "./labels";

const code = { select: { code: true } } as const;

export const ORDER_INCLUDE = {
  supplier: code,
  company: { select: { code: true, defaultCurrency: true } },
  costCenter: code,
  currencyRef: true,
  buyingPriceList: code,
  setWarehouse: code,
  taxCategory: code,
  taxesAndCharges: code,
  supplierAddress: code,
  contactPerson: code,
  shippingAddress: code,
  billingAddress: code,
  paymentTermsTemplate: code,
  termsTemplate: code,
  letterHead: code,
  customer: code,
  customerContactPerson: code,
  amendedFrom: { select: { id: true, number: true } },
  items: { orderBy: { idx: "asc" }, include: { itemTaxTemplate: code, warehouse: code, expenseAccount: code, costCenter: code } },
  taxes: { orderBy: { idx: "asc" }, include: { accountHead: code, costCenter: code } },
  costOverheads: { orderBy: { idx: "asc" }, include: { serviceItem: code, accountHead: code } },
  paymentSchedule: { orderBy: { idx: "asc" } },
} satisfies Prisma.PurchaseOrderInclude;

export type OrderRecord = Prisma.PurchaseOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type ItemRecord = OrderRecord["items"][number];
type TaxRecord = OrderRecord["taxes"][number];
type OverheadRecord = OrderRecord["costOverheads"][number];
type ScheduleRecord = OrderRecord["paymentSchedule"][number];

const n = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const jsonObject = <T>(v: Prisma.JsonValue | null): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : (typeof v === "string" ? safeParse<T>(v) : ({} as T)));
function safeParse<T>(s: string): T {
  try {
    const x = JSON.parse(s);
    return x && typeof x === "object" ? (x as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

export const WORKFLOW_STATE_LABEL = { CREATED: "Created", APPROVED: "Approved", REJECTED: "Rejected" } as const;
export const DOC_STATUS_LABEL = { DRAFT: "Draft", SUBMITTED: "Submitted", CANCELLED: "Cancelled" } as const;
export const DOC_STATUS_NUMBER = { DRAFT: 0, SUBMITTED: 1, CANCELLED: 2 } as const;

/** The form's values for a stored PO. */
export function orderFormValues(o: OrderRecord): OrderFormValues {
  return {
    supplier: o.supplier.code,
    transactionDate: ymd(o.transactionDate)!,
    scheduleDate: ymd(o.scheduleDate),
    company: o.company.code,
    // Text as stored: an option the add-on no longer offers is refused on save, as Frappe refused it.
    shipmentType: o.shipmentType as OrderFormValues["shipmentType"],
    modeOfTransport: o.modeOfTransport as OrderFormValues["modeOfTransport"],
    purposeOfPurchase: o.purposeOfPurchase as OrderFormValues["purposeOfPurchase"],
    applyTds: o.applyTds,
    taxWithholdingCategory: o.taxWithholdingCategory,
    isReverseCharge: o.isReverseCharge,
    isSubcontracted: o.isSubcontracted,
    costCenter: o.costCenter?.code ?? null,
    currency: o.currency,
    conversionRate: n(o.conversionRate),
    buyingPriceList: o.buyingPriceList?.code ?? null,
    plcConversionRate: n(o.plcConversionRate),
    ignorePricingRule: o.ignorePricingRule,
    setWarehouse: o.setWarehouse?.code ?? null,
    items: o.items.map((i) => ({
      id: i.id,
      itemCode: i.itemCode,
      itemName: i.itemName,
      description: i.description ?? "",
      scheduleDate: ymd(i.scheduleDate) ?? ymd(o.scheduleDate) ?? ymd(o.transactionDate)!,
      expectedDeliveryDate: ymd(i.expectedDeliveryDate),
      qty: n(i.qty),
      uom: i.uom,
      conversionFactor: n(i.conversionFactor),
      priceListRate: n(i.priceListRate),
      discountPercentage: n(i.discountPercentage),
      discountAmount: n(i.discountAmount),
      marginType: i.marginType ? labelOf(MARGIN_TYPE_KEYS, i.marginType) : null,
      marginRateOrAmount: n(i.marginRateOrAmount),
      rate: n(i.rate),
      itemTaxTemplate: i.itemTaxTemplate?.code ?? null,
      warehouse: i.warehouse?.code ?? null,
      expenseAccount: i.expenseAccount?.code ?? null,
      costCenter: i.costCenter?.code ?? null,
      applyTds: i.applyTds,
      weightPerUnit: n(i.weightPerUnit),
    })),
    costOverheads: o.costOverheads.map((c) => ({
      id: c.id,
      serviceItem: c.serviceItem?.code ?? null,
      serviceCharges: c.serviceCharges == null ? null : n(c.serviceCharges),
      accountHead: c.accountHead?.code ?? null,
      chargeType: c.chargeType,
    })),
    taxCategory: o.taxCategory?.code ?? null,
    taxesAndCharges: o.taxesAndCharges?.code ?? null,
    taxes: o.taxes.map((t) => ({
      id: t.id,
      category: labelOf(TAX_CATEGORY_KEYS, t.category),
      addDeductTax: labelOf(ADD_DEDUCT_KEYS, t.addDeductTax),
      chargeType: labelOf(CHARGE_TYPE_KEYS, t.chargeType),
      rowId: t.rowId,
      accountHead: t.accountHead.code,
      description: t.description ?? "",
      rate: n(t.rate),
      taxAmount: n(t.taxAmount),
      includedInPrintRate: t.includedInPrintRate,
      costCenter: t.costCenter?.code ?? null,
      servicePrice: n(t.servicePrice),
    })),
    disableRoundedTotal: o.disableRoundedTotal,
    applyDiscountOn: labelOf(DISCOUNT_ON_KEYS, o.applyDiscountOn),
    additionalDiscountPercentage: n(o.additionalDiscountPercentage),
    discountAmount: n(o.discountAmount),
    supplierAddress: o.supplierAddress?.code ?? null,
    contactPerson: o.contactPerson?.code ?? null,
    shippingAddress: o.shippingAddress?.code ?? null,
    billingAddress: o.billingAddress?.code ?? null,
    placeOfSupply: o.placeOfSupply,
    customer: o.customer?.code ?? null,
    customerContactPerson: o.customerContactPerson?.code ?? null,
    paymentTermsTemplate: o.paymentTermsTemplate?.code ?? null,
    paymentSchedule: o.paymentSchedule.map((s) => ({
      id: s.id,
      paymentTerm: s.paymentTermName,
      description: s.description,
      dueDate: ymd(s.dueDate)!,
      invoicePortion: n(s.invoicePortion),
      paymentAmount: n(s.paymentAmount),
      modeOfPayment: s.modeOfPayment,
      dueDateBasedOn: s.dueDateBasedOn,
      creditDays: s.creditDays,
      creditMonths: s.creditMonths,
      discountType: s.discountType,
      discount: n(s.discount),
      discountValidityBasedOn: s.discountValidityBasedOn,
      discountValidity: s.discountValidity,
      discountDate: ymd(s.discountDate),
    })),
    termsTemplate: o.termsTemplate?.code ?? null,
    terms: o.terms ?? "",
    letterHead: o.letterHead?.code ?? null,
    groupSameItems: o.groupSameItems,
    selectPrintHeading: o.selectPrintHeading,
    language: o.language,
  };
}

/** The figures stored on a PO, in the engine's result shape. */
export function storedFigures(o: OrderRecord): PurchaseOrderCalcResult {
  return {
    conversionRate: n(o.conversionRate),
    totalQty: n(o.totalQty),
    total: n(o.total),
    baseTotal: n(o.baseTotal),
    netTotal: n(o.netTotal),
    baseNetTotal: n(o.baseNetTotal),
    taxWithholdingNetTotal: n(o.taxWithholdingNetTotal),
    baseTaxWithholdingNetTotal: n(o.baseTaxWithholdingNetTotal),
    taxesAndChargesAdded: n(o.taxesAndChargesAdded),
    taxesAndChargesDeducted: n(o.taxesAndChargesDeducted),
    baseTaxesAndChargesAdded: n(o.baseTaxesAndChargesAdded),
    baseTaxesAndChargesDeducted: n(o.baseTaxesAndChargesDeducted),
    totalTaxesAndCharges: n(o.totalTaxesAndCharges),
    baseTotalTaxesAndCharges: n(o.baseTotalTaxesAndCharges),
    grandTotal: n(o.grandTotal),
    baseGrandTotal: n(o.baseGrandTotal),
    roundingAdjustment: n(o.roundingAdjustment),
    baseRoundingAdjustment: n(o.baseRoundingAdjustment),
    roundedTotal: n(o.roundedTotal),
    baseRoundedTotal: n(o.baseRoundedTotal),
    discountAmount: n(o.discountAmount),
    baseDiscountAmount: n(o.baseDiscountAmount),
    totalNetWeight: n(o.totalNetWeight),
    costOverheadCharges: o.costOverheads.reduce((s, c) => s + n(c.serviceCharges), 0),
    inWords: o.inWords ?? "",
    baseInWords: o.baseInWords ?? "",
    items: o.items.map((i) => ({
      itemCode: i.itemCode,
      itemName: i.itemName,
      qty: n(i.qty),
      conversionFactor: n(i.conversionFactor),
      priceListRate: n(i.priceListRate),
      discountPercentage: n(i.discountPercentage),
      discountAmount: n(i.discountAmount),
      marginType: i.marginType ? labelOf(MARGIN_TYPE_KEYS, i.marginType) : null,
      marginRateOrAmount: n(i.marginRateOrAmount),
      rate: n(i.rate),
      itemTaxRate: jsonObject<Record<string, number>>(i.itemTaxRate),
      applyTds: i.applyTds,
      weightPerUnit: n(i.weightPerUnit),
      rateWithMargin: n(i.rateWithMargin),
      baseRateWithMargin: n(i.baseRateWithMargin),
      amount: n(i.amount),
      netRate: n(i.netRate),
      netAmount: n(i.netAmount),
      basePriceListRate: n(i.basePriceListRate),
      baseRate: n(i.baseRate),
      baseAmount: n(i.baseAmount),
      baseNetRate: n(i.baseNetRate),
      baseNetAmount: n(i.baseNetAmount),
      itemTaxAmount: 0,
      stockQty: n(i.stockQty),
      stockUomRate: n(i.stockUomRate),
      totalWeight: n(i.totalWeight),
      itemTaxTemplate: i.itemTaxTemplate?.code ?? null,
      taxableValue: n(i.taxableValue),
      gst: {
        igst_rate: n(i.igstRate), cgst_rate: n(i.cgstRate), sgst_rate: n(i.sgstRate), cess_rate: n(i.cessRate), cess_non_advol_rate: n(i.cessNonAdvolRate),
        igst_amount: n(i.igstAmount), cgst_amount: n(i.cgstAmount), sgst_amount: n(i.sgstAmount), cess_amount: n(i.cessAmount), cess_non_advol_amount: n(i.cessNonAdvolAmount),
      } as ItemGstDetail,
      gstTreatment: i.gstTreatment,
      igst: n(i.igst), igstAmt: n(i.igstAmt), cgst: n(i.cgst), cgstAmt: n(i.cgstAmt), sgst: n(i.sgst), sgstAmt: n(i.sgstAmt),
    })),
    taxes: o.taxes.map((t) => ({
      idx: t.idx,
      chargeType: labelOf(CHARGE_TYPE_KEYS, t.chargeType),
      rowId: t.rowId,
      accountHead: t.accountHead.code,
      rate: n(t.rate),
      taxAmount: n(t.taxAmount),
      category: labelOf(TAX_CATEGORY_KEYS, t.category),
      addDeductTax: labelOf(ADD_DEDUCT_KEYS, t.addDeductTax),
      includedInPrintRate: t.includedInPrintRate,
      taxAmountAfterDiscountAmount: n(t.taxAmountAfterDiscountAmount),
      total: n(t.total),
      baseTaxAmount: n(t.baseTaxAmount),
      baseTaxAmountAfterDiscountAmount: n(t.baseTaxAmountAfterDiscountAmount),
      baseTotal: n(t.baseTotal),
      itemWiseTaxDetail: jsonObject<Record<string, [number, number]>>(t.itemWiseTaxDetail),
      gstTaxType: t.gstTaxType,
    })),
    paymentSchedule: o.paymentSchedule.map((s) => ({ paymentAmount: n(s.paymentAmount), basePaymentAmount: n(s.basePaymentAmount), outstanding: n(s.outstanding) })),
  };
}

// ---------------------------------------------------------------------------
// The snapshot for the change history
// ---------------------------------------------------------------------------

/** How Frappe shows a field's value in a Version: money (doc or company currency), float, date, … */
type Kind = "data" | "check" | "int" | "float" | "money" | "base" | "date" | "raw";
type Spec<T> = readonly (readonly [fieldname: string, kind: Kind, get: (r: T) => unknown])[];

export type CellValue = string | number | null;
export interface Cell {
  /** The value as stored (compared first, as Frappe compares old_value != new_value). */
  raw: CellValue;
  /** The value as get_formatted shows it (what the Version keeps). */
  shown: CellValue;
}
export interface SnapshotRow {
  name: string;
  idx: number;
  values: Record<string, Cell>;
}
export interface Snapshot {
  number: string;
  docStatus: 0 | 1 | 2;
  header: Record<string, Cell>;
  tables: Record<string, { doctype: string; rows: SnapshotRow[] }>;
}

// In the order of the old form's fields (a Version lists them so).
const HEADER: Spec<OrderRecord> = [
  ["title", "data", (o) => o.title],
  ["supplier", "data", (o) => o.supplier.code],
  ["supplier_name", "data", (o) => o.supplierName],
  ["custom_shipment_type", "data", (o) => o.shipmentType],
  ["custom_mode_of_transport", "data", (o) => o.modeOfTransport],
  ["workflow_state", "data", (o) => WORKFLOW_STATE_LABEL[o.workflowState]],
  ["transaction_date", "date", (o) => o.transactionDate],
  ["schedule_date", "date", (o) => o.scheduleDate],
  ["custom_purpose_of_purchase", "data", (o) => o.purposeOfPurchase],
  ["company", "data", (o) => o.company.code],
  ["apply_tds", "check", (o) => o.applyTds],
  ["tax_withholding_category", "data", (o) => o.taxWithholdingCategory],
  ["is_reverse_charge", "check", (o) => o.isReverseCharge],
  ["is_subcontracted", "check", (o) => o.isSubcontracted],
  ["cost_center", "data", (o) => o.costCenter?.code],
  ["supplier_address", "data", (o) => o.supplierAddress?.code],
  ["address_display", "data", (o) => o.addressDisplay],
  ["supplier_gstin", "data", (o) => o.supplierGstin],
  ["gst_category", "data", (o) => o.gstCategory],
  ["contact_person", "data", (o) => o.contactPerson?.code],
  ["contact_display", "data", (o) => o.contactDisplay],
  ["contact_mobile", "data", (o) => o.contactMobile],
  ["contact_email", "data", (o) => o.contactEmail],
  ["shipping_address", "data", (o) => o.shippingAddress?.code],
  ["shipping_address_display", "data", (o) => o.shippingAddressDisplay],
  ["billing_address", "data", (o) => o.billingAddress?.code],
  ["billing_address_display", "data", (o) => o.billingAddressDisplay],
  ["company_gstin", "data", (o) => o.companyGstin],
  ["place_of_supply", "data", (o) => o.placeOfSupply],
  ["customer", "data", (o) => o.customer?.code],
  ["customer_name", "data", (o) => o.customerName],
  ["customer_contact_person", "data", (o) => o.customerContactPerson?.code],
  ["customer_contact_display", "data", (o) => o.customerContactDisplay],
  ["customer_contact_mobile", "data", (o) => o.customerContactMobile],
  ["customer_contact_email", "data", (o) => o.customerContactEmail],
  ["currency", "data", (o) => o.currency],
  ["conversion_rate", "float", (o) => o.conversionRate],
  ["buying_price_list", "data", (o) => o.buyingPriceList?.code],
  ["price_list_currency", "data", (o) => o.priceListCurrency],
  ["plc_conversion_rate", "float", (o) => o.plcConversionRate],
  ["ignore_pricing_rule", "check", (o) => o.ignorePricingRule],
  ["set_warehouse", "data", (o) => o.setWarehouse?.code],
  ["total_qty", "float", (o) => o.totalQty],
  ["total_net_weight", "float", (o) => o.totalNetWeight],
  ["base_total", "base", (o) => o.baseTotal],
  ["base_net_total", "base", (o) => o.baseNetTotal],
  ["total", "money", (o) => o.total],
  ["net_total", "money", (o) => o.netTotal],
  ["tax_withholding_net_total", "money", (o) => o.taxWithholdingNetTotal],
  ["base_tax_withholding_net_total", "base", (o) => o.baseTaxWithholdingNetTotal],
  ["tax_category", "data", (o) => o.taxCategory?.code],
  ["taxes_and_charges", "data", (o) => o.taxesAndCharges?.code],
  ["base_taxes_and_charges_added", "base", (o) => o.baseTaxesAndChargesAdded],
  ["base_taxes_and_charges_deducted", "base", (o) => o.baseTaxesAndChargesDeducted],
  ["base_total_taxes_and_charges", "base", (o) => o.baseTotalTaxesAndCharges],
  ["taxes_and_charges_added", "money", (o) => o.taxesAndChargesAdded],
  ["taxes_and_charges_deducted", "money", (o) => o.taxesAndChargesDeducted],
  ["total_taxes_and_charges", "money", (o) => o.totalTaxesAndCharges],
  ["base_grand_total", "base", (o) => o.baseGrandTotal],
  ["base_rounding_adjustment", "base", (o) => o.baseRoundingAdjustment],
  ["base_rounded_total", "base", (o) => o.baseRoundedTotal],
  ["base_in_words", "data", (o) => o.baseInWords],
  ["grand_total", "money", (o) => o.grandTotal],
  ["rounding_adjustment", "money", (o) => o.roundingAdjustment],
  ["rounded_total", "money", (o) => o.roundedTotal],
  ["disable_rounded_total", "check", (o) => o.disableRoundedTotal],
  ["in_words", "data", (o) => o.inWords],
  ["apply_discount_on", "data", (o) => labelOf(DISCOUNT_ON_KEYS, o.applyDiscountOn)],
  ["base_discount_amount", "base", (o) => o.baseDiscountAmount],
  ["additional_discount_percentage", "float", (o) => o.additionalDiscountPercentage],
  ["discount_amount", "money", (o) => o.discountAmount],
  ["payment_terms_template", "data", (o) => o.paymentTermsTemplate?.code],
  ["tc_name", "data", (o) => o.termsTemplate?.code],
  ["terms", "raw", (o) => o.terms],
  ["status", "data", (o) => labelOf(PO_STATUS_KEYS, o.status)],
  ["per_billed", "float", (o) => o.perBilled],
  ["per_received", "float", (o) => o.perReceived],
  ["letter_head", "data", (o) => o.letterHead?.code],
  ["group_same_items", "check", (o) => o.groupSameItems],
  ["select_print_heading", "data", (o) => o.selectPrintHeading],
  ["language", "data", (o) => o.language],
  ["is_internal_supplier", "check", (o) => o.isInternalSupplier],
  ["party_account_currency", "data", (o) => o.partyAccountCurrency],
];

const ITEM: Spec<ItemRecord> = [
  ["item_code", "data", (i) => i.itemCode],
  ["item_name", "data", (i) => i.itemName],
  ["schedule_date", "date", (i) => i.scheduleDate],
  ["expected_delivery_date", "date", (i) => i.expectedDeliveryDate],
  ["description", "raw", (i) => i.description],
  ["gst_hsn_code", "data", (i) => i.gstHsnCode],
  ["is_ineligible_for_itc", "check", (i) => i.isIneligibleForItc],
  ["qty", "float", (i) => i.qty],
  ["stock_uom", "data", (i) => i.stockUom],
  ["uom", "data", (i) => i.uom],
  ["conversion_factor", "float", (i) => i.conversionFactor],
  ["stock_qty", "float", (i) => i.stockQty],
  ["price_list_rate", "money", (i) => i.priceListRate],
  ["last_purchase_rate", "money", (i) => i.lastPurchaseRate],
  ["base_price_list_rate", "base", (i) => i.basePriceListRate],
  ["margin_type", "data", (i) => (i.marginType ? labelOf(MARGIN_TYPE_KEYS, i.marginType) : null)],
  ["margin_rate_or_amount", "float", (i) => i.marginRateOrAmount],
  ["rate_with_margin", "money", (i) => i.rateWithMargin],
  ["discount_percentage", "float", (i) => i.discountPercentage],
  ["discount_amount", "money", (i) => i.discountAmount],
  ["base_rate_with_margin", "base", (i) => i.baseRateWithMargin],
  ["rate", "money", (i) => i.rate],
  ["amount", "money", (i) => i.amount],
  ["item_tax_template", "data", (i) => i.itemTaxTemplate?.code],
  ["gst_treatment", "data", (i) => i.gstTreatment],
  ["base_rate", "base", (i) => i.baseRate],
  ["base_amount", "base", (i) => i.baseAmount],
  ["stock_uom_rate", "money", (i) => i.stockUomRate],
  ["net_rate", "money", (i) => i.netRate],
  ["net_amount", "money", (i) => i.netAmount],
  ["base_net_rate", "base", (i) => i.baseNetRate],
  ["base_net_amount", "base", (i) => i.baseNetAmount],
  ["taxable_value", "base", (i) => i.taxableValue],
  ["sgst", "float", (i) => i.sgst],
  ["sgst_amt", "float", (i) => i.sgstAmt],
  ["cgst", "float", (i) => i.cgst],
  ["cgst_amt", "float", (i) => i.cgstAmt],
  ["igst", "float", (i) => i.igst],
  ["igst_amt", "float", (i) => i.igstAmt],
  ["igst_rate", "float", (i) => i.igstRate],
  ["cgst_rate", "float", (i) => i.cgstRate],
  ["sgst_rate", "float", (i) => i.sgstRate],
  ["cess_rate", "float", (i) => i.cessRate],
  ["cess_non_advol_rate", "float", (i) => i.cessNonAdvolRate],
  ["igst_amount", "base", (i) => i.igstAmount],
  ["cgst_amount", "base", (i) => i.cgstAmount],
  ["sgst_amount", "base", (i) => i.sgstAmount],
  ["cess_amount", "base", (i) => i.cessAmount],
  ["cess_non_advol_amount", "base", (i) => i.cessNonAdvolAmount],
  ["warehouse", "data", (i) => i.warehouse?.code],
  ["expense_account", "data", (i) => i.expenseAccount?.code],
  ["cost_center", "data", (i) => i.costCenter?.code],
  ["apply_tds", "check", (i) => i.applyTds],
  ["item_tax_rate", "raw", (i) => i.itemTaxRate],
  ["weight_per_unit", "float", (i) => i.weightPerUnit],
  ["total_weight", "float", (i) => i.totalWeight],
  ["weight_uom", "data", (i) => i.weightUom],
  ["received_qty", "float", (i) => i.receivedQty],
  ["billed_amt", "money", (i) => i.billedAmt],
];

const TAX: Spec<TaxRecord> = [
  ["category", "data", (t) => labelOf(TAX_CATEGORY_KEYS, t.category)],
  ["add_deduct_tax", "data", (t) => labelOf(ADD_DEDUCT_KEYS, t.addDeductTax)],
  ["charge_type", "data", (t) => labelOf(CHARGE_TYPE_KEYS, t.chargeType)],
  ["row_id", "data", (t) => (t.rowId == null ? null : String(t.rowId))],
  ["included_in_print_rate", "check", (t) => t.includedInPrintRate],
  ["account_head", "data", (t) => t.accountHead.code],
  ["description", "data", (t) => t.description],
  ["rate", "float", (t) => t.rate],
  ["gst_tax_type", "data", (t) => t.gstTaxType],
  ["service_price", "float", (t) => t.servicePrice],
  ["cost_center", "data", (t) => t.costCenter?.code],
  ["account_currency", "data", (t) => t.accountCurrency],
  ["tax_amount", "money", (t) => t.taxAmount],
  ["tax_amount_after_discount_amount", "money", (t) => t.taxAmountAfterDiscountAmount],
  ["total", "money", (t) => t.total],
  ["base_tax_amount", "base", (t) => t.baseTaxAmount],
  ["base_total", "base", (t) => t.baseTotal],
  ["base_tax_amount_after_discount_amount", "base", (t) => t.baseTaxAmountAfterDiscountAmount],
  ["item_wise_tax_detail", "raw", (t) => t.itemWiseTaxDetail],
];

const OVERHEAD: Spec<OverheadRecord> = [
  ["service_item", "data", (c) => c.serviceItem?.code],
  ["service_charges", "float", (c) => c.serviceCharges],
  ["account_head", "data", (c) => c.accountHead?.code],
  ["charge_type", "data", (c) => c.chargeType],
];

const SCHEDULE: Spec<ScheduleRecord> = [
  ["payment_term", "data", (s) => s.paymentTermName],
  ["description", "data", (s) => s.description],
  ["due_date", "date", (s) => s.dueDate],
  ["mode_of_payment", "data", (s) => s.modeOfPayment],
  ["invoice_portion", "float", (s) => s.invoicePortion],
  ["discount_type", "data", (s) => s.discountType],
  ["discount_date", "date", (s) => s.discountDate],
  ["discount", "float", (s) => s.discount],
  ["payment_amount", "money", (s) => s.paymentAmount],
  ["outstanding", "money", (s) => s.outstanding],
  ["paid_amount", "money", (s) => s.paidAmount],
  ["discounted_amount", "money", (s) => s.discountedAmount],
  ["base_payment_amount", "base", (s) => s.basePaymentAmount],
  ["due_date_based_on", "data", (s) => s.dueDateBasedOn],
  ["credit_days", "int", (s) => s.creditDays],
  ["credit_months", "int", (s) => s.creditMonths],
  ["discount_validity_based_on", "data", (s) => s.discountValidityBasedOn],
  ["discount_validity", "int", (s) => s.discountValidity],
];

const NUMERIC = new Set<Kind>(["int", "float", "money", "base"]);

function rawOf(v: unknown, kind: Kind): CellValue {
  if (v === null || v === undefined) return null;
  if (NUMERIC.has(kind)) return Number(String(v));
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Frappe keeps a falsy value as it is (0, "", None) and formats the rest. */
function shownOf(raw: CellValue, kind: Kind, money: { doc: CurrencyDisplay; base: CurrencyDisplay }): CellValue {
  if (!raw) return raw;
  switch (kind) {
    case "money":
      return formatCurrency(raw, money.doc);
    case "base":
      return formatCurrency(raw, money.base);
    case "float": {
      // format_value: "1.000000 shows as 1", else at the float precision (3).
      const x = Number(raw);
      return Number.isInteger(x) ? formatNumber(x, 0) : formatNumber(x, 3);
    }
    case "date":
      return formatDate(String(raw));
    default:
      return raw;
  }
}

function cells<T>(spec: Spec<T>, r: T, money: { doc: CurrencyDisplay; base: CurrencyDisplay }): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const [field, kind, get] of spec) {
    const raw = rawOf(get(r), kind);
    out[field] = { raw, shown: shownOf(raw, kind, money) };
  }
  return out;
}

/** Every field of a PO and its rows, by ERPNext fieldname. `base`: the company currency's display. */
export function orderSnapshot(o: OrderRecord, base: CurrencyDisplay): Snapshot {
  const money = { doc: { symbol: o.currencyRef.symbol, fractionUnits: o.currencyRef.fractionUnits }, base };
  const rows = <T extends { id: string; idx: number }>(spec: Spec<T>, list: T[]): SnapshotRow[] =>
    list.map((r) => ({ name: r.id, idx: r.idx, values: cells(spec, r, money) }));
  return {
    number: o.number,
    docStatus: DOC_STATUS_NUMBER[o.docStatus],
    header: cells(HEADER, o, money),
    tables: {
      items: { doctype: "Purchase Order Item", rows: rows(ITEM, o.items) },
      services_items: { doctype: "Services Items", rows: rows(OVERHEAD, o.costOverheads) },
      taxes: { doctype: "Purchase Taxes and Charges", rows: rows(TAX, o.taxes) },
      payment_schedule: { doctype: "Payment Schedule", rows: rows(SCHEDULE, o.paymentSchedule) },
    },
  };
}
