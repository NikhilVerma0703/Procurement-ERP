// The Purchase Order calculation engine: everything the PO stores that is computed rather than
// typed. One entry point, used by the form (live) and by the server action (authoritative).
//
//   totals, taxes, discount, rounded total — ERPNext 14 (totals.ts), with the add-on's
//                                           Cost Overheads inside its totals step
//   in words                               — Frappe (words.ts)
//   payment schedule amounts               — ERPNext 14 (schedule.ts)
//   taxable value, GST per row, treatment  — India Compliance 14 (gst.ts)
//   GST columns of the PO sheet            — the pacific_group add-on (addon.ts)
//
// Pure: inputs in, figures out. Masters (currencies, account → GST type, templates) are passed
// in. The rules and the old site's defects it does not repeat: docs/04-calculation-engine.md.
import { addonGstColumns, type AddonGstColumns } from "./addon";
import { itemGstDetails, itemGstTreatments, taxableValues, type ItemGstDetail } from "./gst";
import { scheduleAmounts, type ScheduleAmounts } from "./schedule";
import { calculateTotals, sumCharges, type OldSiteMode, type TotalsItem, type TotalsItemInput, type TotalsResult, type TotalsTax, type TotalsTaxInput, type ApplyDiscountOn } from "./totals";
import { SITE_PRECISION, type Precision } from "./settings";
import { moneyInWords, type WordsCurrency } from "./words";

export interface CalcCurrency extends WordsCurrency {
  /** Smallest currency fraction value (INR 0 → round to whole rupees). */
  smallestFraction: number;
}

export interface PurchaseOrderCalcInput {
  currency: CalcCurrency;
  companyCurrency: CalcCurrency;
  conversionRate: number;
  applyDiscountOn: ApplyDiscountOn;
  additionalDiscountPercentage: number;
  discountAmount: number;
  disableRoundedTotal: boolean;
  /** "In-State" / "Out-State" / …: decides the add-on's GST columns. */
  taxCategory: string | null;
  items: (TotalsItemInput & {
    itemTaxTemplate: string | null;
    /** Rates of that template (for the add-on's GST columns); null when the row has none. */
    templateRates: readonly number[] | null;
    gstTreatment: string | null;
  })[];
  taxes: (TotalsTaxInput & { gstTaxType: string | null })[];
  /** Service charges of the Cost Overhead rows. */
  costOverheadCharges: number[];
  paymentSchedule: { invoicePortion: number; paymentAmount: number; outstanding: number }[];
  /** Tax-withholding accounts of the company (for taxable values on non-GST POs). */
  tdsAccounts?: readonly string[];
  /** GST treatment of an Item Tax Template (Taxable, Nil-Rated, Exempted, Non-GST). */
  templateGstTreatment?: (template: string) => string | null;
  /** Decimal places; the old site's current settings by default. */
  precision?: Precision;
  /** Golden check only: reproduce the old site's code of a period (totals.ts). */
  oldSite?: OldSiteMode;
}

export interface PurchaseOrderCalcItem extends TotalsItem, AddonGstColumns {
  itemTaxTemplate: string | null;
  taxableValue: number;
  gst: ItemGstDetail;
  gstTreatment: string | null;
}

export interface PurchaseOrderCalcResult extends Omit<TotalsResult, "items" | "taxes"> {
  costOverheadCharges: number;
  inWords: string;
  baseInWords: string;
  items: PurchaseOrderCalcItem[];
  taxes: (TotalsTax & { gstTaxType: string | null })[];
  paymentSchedule: ScheduleAmounts[];
}

export function calculatePurchaseOrder(input: PurchaseOrderCalcInput): PurchaseOrderCalcResult {
  const precision = input.precision ?? SITE_PRECISION;
  const isCompanyCurrency = !input.currency.code || input.currency.code === input.companyCurrency.code;
  const totals = calculateTotals({
    isCompanyCurrency,
    conversionRate: input.conversionRate,
    smallestCurrencyFraction: input.currency.smallestFraction,
    applyDiscountOn: input.applyDiscountOn,
    additionalDiscountPercentage: input.additionalDiscountPercentage,
    discountAmount: input.discountAmount,
    disableRoundedTotal: input.disableRoundedTotal,
    items: input.items,
    taxes: input.taxes,
    costOverheadCharges: input.costOverheadCharges,
    precision,
    oldSite: input.oldSite,
  });

  // In Words (BuyingController.set_total_in_words): the rounded total unless rounding is off.
  const amount = input.disableRoundedTotal ? Math.abs(totals.grandTotal) : Math.abs(totals.roundedTotal);
  const baseAmount = input.disableRoundedTotal ? Math.abs(totals.baseGrandTotal) : Math.abs(totals.baseRoundedTotal);

  const taxes = totals.taxes.map((tax, i) => ({ ...tax, gstTaxType: input.taxes[i].gstTaxType }));
  const gstItems = totals.items.map((it, i) => ({
    itemCode: it.itemCode,
    itemName: it.itemName,
    qty: it.qty,
    baseNetAmount: it.baseNetAmount,
    itemTaxTemplate: input.items[i].itemTaxTemplate,
    gstTreatment: input.items[i].gstTreatment,
  }));
  const taxable = taxableValues(gstItems, taxes, totals, new Set(input.tdsAccounts ?? []), precision);
  // The old site's India Compliance before 03-12-2025 had no rounding correction (OldSiteMode).
  const icBefore2025 = input.oldSite?.era === "2024-03" || input.oldSite?.era === "2024-10";
  const details = itemGstDetails(gstItems, taxes, taxable, precision, !icBefore2025);
  const treatments = itemGstTreatments(gstItems, taxes, input.templateGstTreatment ?? (() => null));

  return {
    ...totals,
    costOverheadCharges: sumCharges(input.costOverheadCharges),
    inWords: moneyInWords(amount, input.currency),
    baseInWords: moneyInWords(baseAmount, input.companyCurrency),
    taxes,
    items: totals.items.map((it, i) => ({
      ...it,
      ...addonGstColumns(it.amount, input.items[i].templateRates, input.taxCategory, precision),
      itemTaxTemplate: input.items[i].itemTaxTemplate,
      taxableValue: taxable[i],
      gst: details[i],
      gstTreatment: treatments[i],
    })),
    paymentSchedule: scheduleAmounts(input.paymentSchedule, totals, precision),
  };
}

export { purchaseOrderStatus, PO_STATUSES, type PoStatus } from "./status";
export { moneyInWords } from "./words";
