// The form's values as the calculation engine's input — the same mapping in the
// browser (live totals while typing) and on the server (the figures that are
// stored), so the two cannot disagree. Pure.
import type { CalcCurrency, PurchaseOrderCalcInput } from "../calc/index";
import type { OrderFormValues } from "./form-schema";

export interface EngineMasters {
  /** Every enabled currency, by code. */
  currencies: Record<string, CalcCurrency>;
  companyCurrency: string;
  /** Item Tax Templates by code: account → %, and their GST treatment. */
  itemTaxTemplates: Record<string, { rates: Record<string, number>; gstTreatment: string | null }>;
  /** GST Settings' account → GST tax type. */
  gstAccountTypes: Record<string, string>;
}

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

const FALLBACK_CURRENCY: CalcCurrency = { code: "INR", smallestFraction: 0, fraction: "Paisa", numberFormat: "#,##,###.##" };

export function engineInput(v: OrderFormValues, m: EngineMasters): PurchaseOrderCalcInput {
  const company = m.currencies[m.companyCurrency] ?? FALLBACK_CURRENCY;
  const currency = m.currencies[v.currency] ?? { ...company, code: v.currency || company.code };
  return {
    currency,
    companyCurrency: company,
    conversionRate: n(v.conversionRate) || 1,
    applyDiscountOn: v.applyDiscountOn ?? "Grand Total",
    additionalDiscountPercentage: n(v.additionalDiscountPercentage),
    discountAmount: n(v.discountAmount),
    disableRoundedTotal: Boolean(v.disableRoundedTotal),
    taxCategory: v.taxCategory || null,
    items: (v.items ?? []).map((it) => {
      const tpl = it.itemTaxTemplate ? m.itemTaxTemplates[it.itemTaxTemplate] : undefined;
      return {
        itemCode: it.itemCode || null,
        itemName: it.itemName || null,
        qty: n(it.qty),
        conversionFactor: n(it.conversionFactor) || 1,
        priceListRate: n(it.priceListRate),
        discountPercentage: n(it.discountPercentage),
        discountAmount: n(it.discountAmount),
        marginType: it.marginType ?? null,
        marginRateOrAmount: n(it.marginRateOrAmount),
        rate: n(it.rate),
        itemTaxRate: tpl?.rates ?? {},
        applyTds: it.applyTds !== false,
        weightPerUnit: n(it.weightPerUnit),
        itemTaxTemplate: it.itemTaxTemplate || null,
        templateRates: tpl ? Object.values(tpl.rates) : null,
        gstTreatment: null,
      };
    }),
    taxes: (v.taxes ?? []).map((t) => ({
      chargeType: t.chargeType,
      rowId: t.rowId ?? null,
      accountHead: t.accountHead,
      rate: n(t.rate),
      taxAmount: n(t.taxAmount),
      category: t.category ?? "Total",
      addDeductTax: t.addDeductTax ?? "Add",
      includedInPrintRate: Boolean(t.includedInPrintRate),
      gstTaxType: m.gstAccountTypes[t.accountHead] ?? null,
    })),
    costOverheadCharges: (v.costOverheads ?? []).map((o) => n(o.serviceCharges)),
    paymentSchedule: (v.paymentSchedule ?? []).map((s) => ({
      invoicePortion: n(s.invoicePortion),
      paymentAmount: n(s.paymentAmount),
      outstanding: n(s.paymentAmount),
    })),
    templateGstTreatment: (code) => m.itemTaxTemplates[code]?.gstTreatment ?? null,
  };
}
