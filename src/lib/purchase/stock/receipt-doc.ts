// A Purchase Receipt as its form holds it (the Frappe document: header fields, and its items, taxes
// and the add-on's services rows), and every figure the old site computed on it. Pure: the form runs
// it live while the user types, the server action runs it again on save and stores only its own
// result (CLAUDE.md, server authority). Phase II, owner 21-11-2026.
//
// The figures are lib/purchase/stock/receipt-calc.ts (the buying engine the POs and all 5,593 old
// receipts prove: npm run golden:receipts); this maps the document into it and writes its results back
// under the old field names, plus the receipt's own quantities (ERPNext buying_controller
// validate_accepted_rejected_qty and purchase_receipt.js: Received = Accepted + Rejected; stock
// quantities are quantities × the UOM conversion factor).

import type { CalcCurrency } from "../calc";
import { flt } from "../calc/pymath";
import { GST_TAX_TYPES, SITE_PRECISION } from "../calc/settings";
import type { AddDeduct, ApplyDiscountOn, ChargeType, TaxCategory } from "../calc/totals";
import type { PostEntry } from "./ledger-format";
import { calculateReceipt, type ReceiptCalcInput, type ReceiptCalcResult } from "./receipt-calc";

export type Doc = Record<string, unknown>;
export type DocRow = Record<string, unknown>;

export interface ReceiptMasters {
  /** Every enabled currency, by code. */
  currencies: Record<string, CalcCurrency>;
  companyCurrency: string;
  /** Item Tax Templates by code: account → %, and their GST treatment. */
  itemTaxTemplates: Record<string, { rates: Record<string, number>; gstTreatment: string | null }>;
  /** GST Settings' account → GST tax type (igst, cgst, …). */
  gstAccountTypes: Record<string, string>;
}

const FALLBACK_CURRENCY: CalcCurrency = { code: "INR", smallestFraction: 0, fraction: "Paisa", numberFormat: "#,##,###.##" };

/** A number from a form value (Frappe's flt: "1,250.5" → 1250.5; anything else → 0). */
export const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : typeof v === "string" ? flt(v) : 0;
  return Number.isFinite(x) ? x : 0;
};
export const rowsOf = (v: unknown): DocRow[] => (Array.isArray(v) ? (v as DocRow[]) : []);
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

/** The receipt as the engine's input: only what the user typed or chose. */
export function receiptCalcInput(doc: Doc, m: ReceiptMasters): ReceiptCalcInput {
  const company = m.currencies[m.companyCurrency] ?? FALLBACK_CURRENCY;
  const code = str(doc.currency) ?? company.code;
  const currency = m.currencies[code] ?? { ...company, code };
  return {
    currency,
    companyCurrency: company,
    conversionRate: num(doc.conversion_rate) || 1,
    applyDiscountOn: (str(doc.apply_discount_on) ?? "Grand Total") as ApplyDiscountOn,
    additionalDiscountPercentage: num(doc.additional_discount_percentage),
    discountAmount: num(doc.discount_amount),
    disableRoundedTotal: Boolean(num(doc.disable_rounded_total)),
    taxCategory: str(doc.tax_category),
    items: rowsOf(doc.items).map((it) => {
      const template = str(it.item_tax_template);
      const tpl = template ? m.itemTaxTemplates[template] : undefined;
      return {
        itemCode: str(it.item_code),
        itemName: str(it.item_name),
        qty: num(it.qty),
        conversionFactor: num(it.conversion_factor) || 1,
        priceListRate: num(it.price_list_rate),
        discountPercentage: num(it.discount_percentage),
        discountAmount: num(it.discount_amount),
        marginType: (str(it.margin_type) as "Percentage" | "Amount" | null) ?? null,
        marginRateOrAmount: num(it.margin_rate_or_amount),
        rate: num(it.rate),
        itemTaxRate: tpl?.rates ?? {},
        applyTds: it.apply_tds === undefined ? true : Boolean(num(it.apply_tds)),
        weightPerUnit: num(it.weight_per_unit),
        itemTaxTemplate: template,
        templateRates: tpl ? Object.values(tpl.rates) : null,
        gstTreatment: str(it.gst_treatment),
      };
    }),
    taxes: rowsOf(doc.taxes).map((t) => ({
      chargeType: (str(t.charge_type) ?? "Actual") as ChargeType,
      rowId: t.row_id ? Number(t.row_id) || null : null,
      accountHead: str(t.account_head) ?? "",
      rate: num(t.rate),
      taxAmount: num(t.tax_amount),
      category: (str(t.category) ?? "Total") as TaxCategory,
      addDeductTax: (str(t.add_deduct_tax) ?? "Add") as AddDeduct,
      includedInPrintRate: Boolean(num(t.included_in_print_rate)),
      gstTaxType: m.gstAccountTypes[str(t.account_head) ?? ""] ?? null,
    })),
    // The add-on's Services Charges is a Data field ("29,463"): read as Frappe's flt read it.
    costOverheadCharges: rowsOf(doc.services_items).map((s) => num(s.service_charges)),
    paymentSchedule: [],
    templateGstTreatment: (code) => m.itemTaxTemplates[code]?.gstTreatment ?? null,
  };
}

/**
 * Received = Accepted + Rejected on every row (validate_accepted_rejected_qty: a row with nothing
 * received takes accepted + rejected), and its stock quantities.
 */
export function receiptQuantities(it: DocRow): DocRow {
  const fp = SITE_PRECISION.float;
  const qty = num(it.qty);
  const rejected = num(it.rejected_qty);
  const received = num(it.received_qty) || flt(qty + rejected, fp);
  const cf = num(it.conversion_factor) || 1;
  return { ...it, received_qty: received, received_stock_qty: flt(received * cf, fp) };
}

/**
 * Each row's Item Tax Amount and Valuation Rate (ERPNext 14 BuyingController.update_valuation_rate,
 * run on every save): the taxes counted in valuation (category Valuation or Valuation and Total) are
 * spread over the stock rows by their net amount — the last stock row takes what is left — and a
 * row's valuation rate is (net amount + its tax share + landed cost) per stock unit. A row that is
 * not a stock item is valued 0. The old site's GST taxes were "Total", so its rates are the net rates
 * (PR/25-26/MM-03457: 280.000000). Stored to the field's precision, 6.
 */
export function receiptValuation(doc: Doc, isStock: (itemCode: string) => boolean, currencyPrecision: number): Doc {
  const items = rowsOf(doc.items);
  let stockQty = 0;
  let stockAmount = 0;
  let lastStock = -1;
  items.forEach((it, i) => {
    const code = str(it.item_code);
    if (code && isStock(code)) {
      stockQty += num(it.qty);
      stockAmount += num(it.base_net_amount);
      lastStock = i;
    }
  });
  const totalValuation = rowsOf(doc.taxes)
    .filter((t) => t.category === "Valuation" || t.category === "Valuation and Total")
    .reduce((s, t) => s + num(t.base_tax_amount_after_discount_amount), 0);
  let left = totalValuation;
  return {
    ...doc,
    items: items.map((it, i) => {
      const code = str(it.item_code);
      if (!code || !num(it.qty) || !isStock(code)) return { ...it, item_tax_amount: 0, valuation_rate: 0 };
      const share = stockAmount ? num(it.base_net_amount) / stockAmount : num(it.qty) / stockQty;
      let itemTax: number;
      if (i === lastStock) itemTax = flt(left, currencyPrecision);
      else {
        itemTax = flt(share * totalValuation, currencyPrecision);
        left -= itemTax;
      }
      const stockUnits = flt(num(it.qty) * (num(it.conversion_factor) || 1));
      const rate = stockUnits ? (num(it.base_net_amount) + itemTax + num(it.landed_cost_voucher_amount)) / stockUnits : 0;
      return { ...it, item_tax_amount: itemTax, valuation_rate: flt(rate, 6) };
    }),
  };
}

/** The document with every computed figure filled in, as the old site stored them. */
export function computeReceipt(doc: Doc, m: ReceiptMasters): { doc: Doc; result: ReceiptCalcResult } {
  const withQty: Doc = { ...doc, items: rowsOf(doc.items).map(receiptQuantities) };
  const r = calculateReceipt(receiptCalcInput(withQty, m));
  const items = rowsOf(withQty.items).map((it, i) => {
    const c = r.items[i];
    const template = str(it.item_tax_template);
    const gst: DocRow = {};
    for (const t of GST_TAX_TYPES) {
      gst[`${t}_rate`] = c.gst[`${t}_rate`];
      gst[`${t}_amount`] = c.gst[`${t}_amount`];
    }
    return {
      ...it,
      ...gst,
      price_list_rate: c.priceListRate,
      base_price_list_rate: c.basePriceListRate,
      discount_percentage: c.discountPercentage,
      discount_amount: c.discountAmount,
      margin_rate_or_amount: c.marginRateOrAmount,
      rate_with_margin: c.rateWithMargin,
      base_rate_with_margin: c.baseRateWithMargin,
      rate: c.rate,
      amount: c.amount,
      base_rate: c.baseRate,
      base_amount: c.baseAmount,
      net_rate: c.netRate,
      net_amount: c.netAmount,
      base_net_rate: c.baseNetRate,
      base_net_amount: c.baseNetAmount,
      stock_qty: c.stockQty,
      stock_uom_rate: c.stockUomRate,
      total_weight: c.totalWeight,
      taxable_value: c.taxableValue,
      gst_treatment: c.gstTreatment,
      item_tax_rate: JSON.stringify(template ? m.itemTaxTemplates[template]?.rates ?? {} : {}),
      // The add-on's GST columns (its item_tax fetch on item, qty and rate).
      igst: c.igst,
      igst_amt: c.igstAmt,
      cgst: c.cgst,
      cgst_amt: c.cgstAmt,
      sgst: c.sgst,
      sgst_amt: c.sgstAmt,
    };
  });
  const taxes = rowsOf(withQty.taxes).map((t, i) => {
    const c = r.taxes[i];
    return {
      ...t,
      tax_amount: c.taxAmount,
      tax_amount_after_discount_amount: c.taxAmountAfterDiscountAmount,
      total: c.total,
      base_tax_amount: c.baseTaxAmount,
      base_tax_amount_after_discount_amount: c.baseTaxAmountAfterDiscountAmount,
      base_total: c.baseTotal,
      item_wise_tax_detail: JSON.stringify(c.itemWiseTaxDetail),
      gst_tax_type: c.gstTaxType ?? (t.gst_tax_type as string | null) ?? null,
    };
  });
  return {
    result: r,
    doc: {
      ...withQty,
      items,
      taxes,
      conversion_rate: r.conversionRate,
      total_qty: r.totalQty,
      total: r.total,
      base_total: r.baseTotal,
      net_total: r.netTotal,
      base_net_total: r.baseNetTotal,
      taxes_and_charges_added: r.taxesAndChargesAdded,
      taxes_and_charges_deducted: r.taxesAndChargesDeducted,
      base_taxes_and_charges_added: r.baseTaxesAndChargesAdded,
      base_taxes_and_charges_deducted: r.baseTaxesAndChargesDeducted,
      total_taxes_and_charges: r.totalTaxesAndCharges,
      base_total_taxes_and_charges: r.baseTotalTaxesAndCharges,
      discount_amount: r.discountAmount,
      base_discount_amount: r.baseDiscountAmount,
      grand_total: r.grandTotal,
      base_grand_total: r.baseGrandTotal,
      rounding_adjustment: r.roundingAdjustment,
      base_rounding_adjustment: r.baseRoundingAdjustment,
      rounded_total: r.roundedTotal,
      base_rounded_total: r.baseRoundedTotal,
      in_words: r.inWords,
      base_in_words: r.baseInWords,
      total_net_weight: r.totalNetWeight,
    },
  };
}

/** update_stock_ledger's entries for a receipt (accepted, then rejected, row by row). */
export function receiptStockEntries(doc: Doc, isStock: (itemCode: string) => boolean): PostEntry[] {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v));
  const out: PostEntry[] = [];
  const base = {
    company: str(doc.company), voucherType: "Purchase Receipt", voucherNo: str(doc.name), postingDate: str(doc.posting_date), postingTime: str(doc.posting_time),
  };
  for (const r of rowsOf(doc.items)) {
    const code = str(r.item_code);
    if (!code || !isStock(code)) continue;
    const cf = num(r.conversion_factor) || 1;
    const accepted = flt(num(r.qty) * cf, 3);
    if (accepted && str(r.warehouse)) {
      out.push({ ...base, itemCode: code, warehouse: str(r.warehouse), stockUom: str(r.stock_uom) || null, actualQty: accepted, incomingRate: flt(num(r.valuation_rate), 6), voucherDetailNo: str(r.name) || null });
    }
    const rejected = flt(num(r.rejected_qty) * cf, 3);
    if (rejected && str(r.rejected_warehouse)) {
      out.push({ ...base, itemCode: code, warehouse: str(r.rejected_warehouse), stockUom: str(r.stock_uom) || null, actualQty: rejected, incomingRate: 0, voucherDetailNo: str(r.name) || null });
    }
  }
  return out;
}

