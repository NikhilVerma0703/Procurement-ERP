// New rows of the PO form's tables, with the old doctypes' defaults
// (Purchase Taxes and Charges: Total / Add / On Net Total; Payment Schedule:
// discount type Percentage; an item row's Required By from the header or the
// first row, as buying.js items_add did). Pure.
import { flt } from "@/lib/purchase/calc/pymath";
import { SITE_PRECISION } from "@/lib/purchase/calc/settings";
import type { ItemRowValues, OverheadRowValues, ScheduleRowValues, TaxRowValues } from "@/lib/purchase/orders/form-schema";

export const emptyItemRow = (scheduleDate: string | null = null): ItemRowValues => ({
  itemCode: "", itemName: "", description: "", scheduleDate: scheduleDate ?? "", expectedDeliveryDate: null,
  qty: 0, uom: "", conversionFactor: 1, priceListRate: 0, discountPercentage: 0, discountAmount: 0,
  marginType: null, marginRateOrAmount: 0, rate: 0, itemTaxTemplate: null, warehouse: null,
  expenseAccount: null, costCenter: null, applyTds: true, weightPerUnit: 0,
});

export const emptyTaxRow = (): TaxRowValues => ({
  category: "Total", addDeductTax: "Add", chargeType: "On Net Total", rowId: null, accountHead: "", description: "",
  rate: 0, taxAmount: 0, includedInPrintRate: false, costCenter: null, servicePrice: 0,
});

export const emptyOverheadRow = (): OverheadRowValues => ({ serviceItem: null, serviceCharges: null, accountHead: null, chargeType: "Actual" });

export const emptyScheduleRow = (): ScheduleRowValues => ({
  paymentTerm: null, description: null, dueDate: "", invoicePortion: 0, paymentAmount: 0, modeOfPayment: null,
  dueDateBasedOn: null, creditDays: 0, creditMonths: 0, discountType: "Percentage", discount: 0,
  discountValidityBasedOn: null, discountValidity: 0, discountDate: null,
});

/**
 * Frappe's remove_empty_rows before a save: a row whose list-view fields are all empty is dropped
 * (the empty row a new PO starts with, a row added and left blank).
 */
export function dropEmptyRows<T extends { items: ItemRowValues[]; costOverheads?: OverheadRowValues[]; paymentSchedule?: ScheduleRowValues[]; taxes?: TaxRowValues[] }>(v: T): T {
  return {
    ...v,
    items: v.items.filter((r) => r.itemCode || r.scheduleDate || Number(r.rate) || r.uom),
    costOverheads: (v.costOverheads ?? []).filter((r) => r.serviceItem || r.serviceCharges),
    paymentSchedule: (v.paymentSchedule ?? []).filter((r) => r.paymentTerm || r.description || r.dueDate || Number(r.invoicePortion) || Number(r.paymentAmount)),
    taxes: (v.taxes ?? []).filter((r) => r.accountHead || Number(r.taxAmount) || Number(r.rate)),
  };
}

/** apply_pricing_rule_on_item: the rate from the price list rate, its margin and its discount. */
export function pricedRate(row: Pick<ItemRowValues, "priceListRate" | "marginType" | "marginRateOrAmount" | "discountPercentage" | "discountAmount">) {
  const plr = Number(row.priceListRate ?? 0);
  const margin = Number(row.marginRateOrAmount ?? 0);
  const withMargin = row.marginType === "Percentage" ? plr + plr * (margin / 100) : plr + margin;
  let rate = flt(withMargin, SITE_PRECISION.currency);
  let discountAmount = Number(row.discountAmount ?? 0);
  let discountPercentage = Number(row.discountPercentage ?? 0);
  if (discountPercentage && !discountAmount) discountAmount = (withMargin * discountPercentage) / 100;
  if (discountAmount > 0) {
    rate = flt(withMargin - discountAmount, SITE_PRECISION.currency);
    discountPercentage = withMargin ? (100 * discountAmount) / withMargin : 0;
  }
  return { rate, discountAmount, discountPercentage };
}
