// Purchase Order totals, taxes and discount, exactly as the old site computed them.
//
// This is ERPNext 14.92.14's `calculate_taxes_and_totals` (erpnext/controllers/taxes_and_totals.py)
// for a Purchase Order, re-implemented step by step: same order of steps, same rounding points,
// same float arithmetic. That is the only way to reproduce the 3,199 stored POs to the last
// decimal (golden check, Step 4). Parts that a Purchase Order never reaches (POS, returns,
// consolidated invoices, cash discount, advances, shipping rules, pricing rules) are left out.
//
// Inputs are the user's entries (qty, rates, discounts, tax rows); everything else is computed.
// Pure: no I/O. The form runs it live; the server action runs it again and stores only its own
// result (server authority).
import { cint, flt, roundToCurrencyFraction } from "./pymath";
import { SITE_PRECISION, type Precision } from "./settings";

export type ChargeType = "Actual" | "On Net Total" | "On Previous Row Amount" | "On Previous Row Total" | "On Item Quantity";
export type TaxCategory = "Total" | "Valuation" | "Valuation and Total";
export type AddDeduct = "Add" | "Deduct";
export type ApplyDiscountOn = "Grand Total" | "Net Total";
export type MarginType = "Percentage" | "Amount";

export interface TotalsItemInput {
  itemCode: string | null;
  itemName: string | null;
  qty: number;
  conversionFactor: number;
  priceListRate: number;
  discountPercentage: number;
  discountAmount: number;
  marginType: MarginType | null;
  marginRateOrAmount: number;
  rate: number;
  /** Rates of the row's Item Tax Template, account name → % (ERPNext `item_tax_rate`). */
  itemTaxRate: Record<string, number>;
  applyTds: boolean;
  weightPerUnit: number;
}

export interface TotalsTaxInput {
  chargeType: ChargeType;
  /** ERPNext `row_id`: the idx (1-based) of the row this one is computed on. */
  rowId: number | null;
  accountHead: string;
  rate: number;
  /** Read only for Actual rows, where the user types the amount. */
  taxAmount: number;
  category: TaxCategory;
  addDeductTax: AddDeduct;
  includedInPrintRate: boolean;
}

export interface TotalsInput {
  /** Transaction currency is the company currency → the rate is forced to 1. */
  isCompanyCurrency: boolean;
  conversionRate: number;
  /** The currency's smallest fraction (INR 0 → whole rupees; USD 0.01). */
  smallestCurrencyFraction: number;
  applyDiscountOn: ApplyDiscountOn;
  additionalDiscountPercentage: number;
  discountAmount: number;
  disableRoundedTotal: boolean;
  items: TotalsItemInput[];
  taxes: TotalsTaxInput[];
  /** Service charges of the Cost Overhead rows (add-on). */
  costOverheadCharges?: number[];
  /** Decimal places of Currency and Float/Percent fields; the old site's current settings by default. */
  precision?: Precision;
  /** Golden check only: reproduce the old site's own code of a period, defects included. */
  oldSite?: OldSiteMode;
}

/**
 * The old site ran four versions of this code (app updates on 15-10-2024, 03-12-2025 and
 * 24-04-2026, from its patch log). Each stored PO was computed by the version of its last save.
 * The add-on replaced ERPNext's `calculate_totals` with a copy of ERPNext's 2023 code plus the
 * Cost Overheads; that copy uses the PO's own `rounding_adjustment` field as its working
 * difference. Until 03-12-2025 ERPNext reset that field at the start of every calculation. From
 * then on (ERPNext #46829) it did not, so the copy carried over the rounding adjustment the form
 * held when it was saved: `roundingAdjustmentIn`. See docs/04-calculation-engine.md.
 */
export type OldSiteEra = "2024-03" | "2024-10" | "2025-12" | "2026-04";
export interface OldSiteMode {
  era: OldSiteEra;
  /** The PO's rounding adjustment before the save (only read from the 2025-12 era on). */
  roundingAdjustmentIn?: number;
}

/** The old site's code period at a moment (its update times, UTC). */
export function oldSiteEraAt(at: Date): OldSiteEra {
  const t = at.getTime();
  if (t < Date.parse("2024-10-15T11:46:56Z")) return "2024-03";
  if (t < Date.parse("2025-12-03T08:05:58Z")) return "2024-10";
  if (t < Date.parse("2026-04-24T01:26:25Z")) return "2025-12";
  return "2026-04";
}

export interface TotalsItem extends TotalsItemInput {
  rateWithMargin: number;
  baseRateWithMargin: number;
  amount: number;
  netRate: number;
  netAmount: number;
  basePriceListRate: number;
  baseRate: number;
  baseAmount: number;
  baseNetRate: number;
  baseNetAmount: number;
  itemTaxAmount: number;
  stockQty: number;
  stockUomRate: number;
  totalWeight: number;
}

export interface TotalsTax extends TotalsTaxInput {
  idx: number;
  taxAmountAfterDiscountAmount: number;
  total: number;
  baseTaxAmount: number;
  baseTaxAmountAfterDiscountAmount: number;
  baseTotal: number;
  /** Per item (code, else name): [rate, amount in company currency] — ERPNext `item_wise_tax_detail`. */
  itemWiseTaxDetail: Record<string, [number, number]>;
}

export interface TotalsResult {
  conversionRate: number;
  totalQty: number;
  total: number;
  baseTotal: number;
  netTotal: number;
  baseNetTotal: number;
  taxWithholdingNetTotal: number;
  baseTaxWithholdingNetTotal: number;
  taxesAndChargesAdded: number;
  taxesAndChargesDeducted: number;
  baseTaxesAndChargesAdded: number;
  baseTaxesAndChargesDeducted: number;
  totalTaxesAndCharges: number;
  baseTotalTaxesAndCharges: number;
  grandTotal: number;
  baseGrandTotal: number;
  roundingAdjustment: number;
  baseRoundingAdjustment: number;
  roundedTotal: number;
  baseRoundedTotal: number;
  discountAmount: number;
  baseDiscountAmount: number;
  totalNetWeight: number;
  items: TotalsItem[];
  taxes: TotalsTax[];
}

interface WorkTax extends Omit<TotalsTax, "itemWiseTaxDetail"> {
  taxAmountForCurrentItem: number;
  grandTotalForCurrentItem: number;
  taxFractionForCurrentItem: number;
  grandTotalFractionForCurrentItem: number;
  itemWiseTaxDetail: Map<string, [number, number]>;
}

// `round_floats_in(item)` rounds every numeric field of the row: Currency fields to the currency
// precision, Float and Percent fields to the float precision (PO Item doctype field types).
const ITEM_CURRENCY_FIELDS = [
  "priceListRate", "discountAmount", "rateWithMargin", "baseRateWithMargin", "rate", "amount", "netRate", "netAmount",
  "basePriceListRate", "baseRate", "baseAmount", "baseNetRate", "baseNetAmount", "stockUomRate",
] as const;
const ITEM_FLOAT_FIELDS = ["qty", "conversionFactor", "discountPercentage", "marginRateOrAmount", "weightPerUnit", "stockQty", "totalWeight"] as const;
const TAX_CURRENCY_FIELDS = [
  "taxAmount", "taxAmountAfterDiscountAmount", "total", "baseTaxAmount", "baseTaxAmountAfterDiscountAmount", "baseTotal",
] as const;

class PurchaseOrderTotals {
  readonly doc: TotalsResult;
  private readonly taxes: WorkTax[];
  private readonly input: TotalsInput;
  private discountAmountApplied = false;
  private grandTotalDiff = 0;
  /** Currency and Float/Percent precision. */
  private readonly c: number;
  private readonly f: number;
  private readonly costOverheads: number;
  private readonly old: OldSiteMode | null;

  constructor(input: TotalsInput) {
    this.input = input;
    this.old = input.oldSite ?? null;
    this.costOverheads = sumCharges(input.costOverheadCharges ?? []);
    this.c = (input.precision ?? SITE_PRECISION).currency;
    this.f = (input.precision ?? SITE_PRECISION).float;
    this.taxes = input.taxes.map((t, i) => ({
      ...t,
      idx: i + 1,
      taxAmountAfterDiscountAmount: 0,
      total: 0,
      baseTaxAmount: 0,
      baseTaxAmountAfterDiscountAmount: 0,
      baseTotal: 0,
      taxAmountForCurrentItem: 0,
      grandTotalForCurrentItem: 0,
      taxFractionForCurrentItem: 0,
      grandTotalFractionForCurrentItem: 0,
      itemWiseTaxDetail: new Map(),
    }));
    this.doc = {
      conversionRate: input.conversionRate,
      totalQty: 0, total: 0, baseTotal: 0, netTotal: 0, baseNetTotal: 0,
      taxWithholdingNetTotal: 0, baseTaxWithholdingNetTotal: 0,
      taxesAndChargesAdded: 0, taxesAndChargesDeducted: 0, baseTaxesAndChargesAdded: 0, baseTaxesAndChargesDeducted: 0,
      totalTaxesAndCharges: 0, baseTotalTaxesAndCharges: 0,
      grandTotal: 0, baseGrandTotal: 0, roundingAdjustment: 0, baseRoundingAdjustment: 0,
      roundedTotal: 0, baseRoundedTotal: 0,
      discountAmount: input.discountAmount, baseDiscountAmount: 0, totalNetWeight: 0,
      ...(input.oldSite ? { roundingAdjustment: input.oldSite.roundingAdjustmentIn ?? 0 } : {}),
      items: input.items.map((it) => {
        // Set on the form as the user types (ERPNext transaction.js): stock qty and total weight.
        const stockQty = flt(it.qty) * flt(it.conversionFactor);
        return {
          ...it,
          itemTaxRate: { ...it.itemTaxRate },
          rateWithMargin: 0, baseRateWithMargin: 0, amount: 0, netRate: 0, netAmount: 0,
          basePriceListRate: 0, baseRate: 0, baseAmount: 0, baseNetRate: 0, baseNetAmount: 0,
          itemTaxAmount: 0, stockQty, stockUomRate: 0,
          totalWeight: flt(stockQty * flt(it.weightPerUnit), this.f),
        };
      }),
      taxes: [],
    };
  }

  run(): TotalsResult {
    if (this.doc.items.length) {
      this.calculate();
      for (const item of this.doc.items) {
        // BuyingController.set_qty_as_per_stock_uom, after the totals: an unrounded product.
        item.stockQty = flt(item.qty) * flt(item.conversionFactor);
        // Rate per stock UOM, set on the form (ERPNext transaction.js).
        item.stockUomRate = item.conversionFactor ? flt(item.rate) / flt(item.conversionFactor) : 0;
      }
    }
    this.doc.taxes = this.taxes.map((t) => {
      const { taxAmountForCurrentItem, grandTotalForCurrentItem, taxFractionForCurrentItem, grandTotalFractionForCurrentItem, itemWiseTaxDetail, ...rest } = t;
      void taxAmountForCurrentItem; void grandTotalForCurrentItem; void taxFractionForCurrentItem; void grandTotalFractionForCurrentItem;
      return { ...rest, itemWiseTaxDetail: Object.fromEntries(itemWiseTaxDetail) };
    });
    return this.doc;
  }

  private calculate() {
    this.discountAmountApplied = false;
    this.calculateOnce();
    this.setDiscountAmount();
    this.applyDiscountAmount();
  }

  private calculateOnce() {
    this.validateConversionRate();
    this.calculateItemValues();
    this.initializeTaxes();
    this.determineExclusiveRate();
    this.calculateNetTotal();
    this.calculateTaxWithholdingNetTotal();
    this.calculateTaxes();
    this.adjustGrandTotalForInclusiveTax();
    this.calculateTotals();
    this.calculateTotalNetWeight();
  }

  private validateConversionRate() {
    if (this.input.isCompanyCurrency) this.doc.conversionRate = 1.0;
    this.doc.conversionRate = flt(this.doc.conversionRate);
  }

  /** `_set_in_company_currency`: base_x = flt(flt(x, p) * conversion_rate, p). */
  private toBase(x: number) {
    return flt(flt(x, this.c) * this.doc.conversionRate, this.c);
  }

  private calculateItemValues() {
    if (this.discountAmountApplied) return;
    for (const item of this.doc.items) {
      for (const k of ITEM_CURRENCY_FIELDS) item[k] = flt(item[k], this.c);
      for (const k of ITEM_FLOAT_FIELDS) item[k] = flt(item[k], this.f);

      if (item.discountPercentage === 100) {
        item.rate = 0.0;
      } else if (item.priceListRate) {
        // A Purchase Order has no pricing rules here, so only "no rate typed" fills it from the price list.
        if (!item.rate) {
          item.rate = flt(item.priceListRate * (1.0 - item.discountPercentage / 100.0), this.c);
          item.discountAmount = item.priceListRate * (item.discountPercentage / 100.0);
        }
      }

      [item.rateWithMargin, item.baseRateWithMargin] = this.calculateMargin(item);
      if (flt(item.rateWithMargin) > 0) {
        item.rate = flt(item.rateWithMargin * (1.0 - item.discountPercentage / 100.0), this.c);
        if (item.discountAmount && !item.discountPercentage) item.rate = item.rateWithMargin - item.discountAmount;
        else item.discountAmount = item.rateWithMargin - item.rate;
      } else if (flt(item.priceListRate) > 0) {
        item.discountAmount = item.priceListRate - item.rate;
      }

      item.netRate = item.rate;
      item.amount = flt(item.rate * item.qty, this.c);
      item.netAmount = item.amount;
      item.basePriceListRate = this.toBase(item.priceListRate);
      item.baseRate = this.toBase(item.rate);
      item.baseNetRate = this.toBase(item.netRate);
      item.baseAmount = this.toBase(item.amount);
      item.baseNetAmount = this.toBase(item.netAmount);
      item.itemTaxAmount = 0.0;
    }
  }

  /**
   * `calculate_margin`. Note ERPNext's quirk, kept: when the typed rate is above the price list rate
   * the row gets margin type "Amount", but the margin rate it returns is 0.
   */
  private calculateMargin(item: TotalsItem): [number, number] {
    let rateWithMargin = 0.0;
    let baseRateWithMargin = 0.0;
    if (item.priceListRate) {
      if (flt(item.rate) > flt(item.priceListRate)) {
        item.marginType = "Amount";
        item.marginRateOrAmount = flt(item.rate - item.priceListRate, this.f);
      } else if (item.marginType && item.marginRateOrAmount) {
        const marginValue = item.marginType === "Amount"
          ? item.marginRateOrAmount
          : (flt(item.priceListRate) * flt(item.marginRateOrAmount)) / 100;
        rateWithMargin = flt(item.priceListRate) + flt(marginValue);
        baseRateWithMargin = flt(rateWithMargin) * flt(this.doc.conversionRate);
      }
    }
    return [rateWithMargin, baseRateWithMargin];
  }

  private initializeTaxes() {
    const keepTaxAmount = this.discountAmountApplied && this.input.applyDiscountOn === "Grand Total";
    for (const tax of this.taxes) {
      tax.itemWiseTaxDetail = new Map();
      tax.total = 0.0;
      tax.taxAmountAfterDiscountAmount = 0.0;
      tax.taxAmountForCurrentItem = 0.0;
      tax.grandTotalForCurrentItem = 0.0;
      tax.taxFractionForCurrentItem = 0.0;
      tax.grandTotalFractionForCurrentItem = 0.0;
      if (tax.chargeType !== "Actual" && !keepTaxAmount) tax.taxAmount = 0.0;
      tax.rate = flt(tax.rate, this.f);
      for (const k of TAX_CURRENCY_FIELDS) tax[k] = flt(tax[k], this.c);
    }
  }

  /** The item's own rate for this account (Item Tax Template), else the row's rate. */
  private taxRate(tax: WorkTax, itemTaxMap: Record<string, number>) {
    return Object.prototype.hasOwnProperty.call(itemTaxMap, tax.accountHead)
      ? flt(itemTaxMap[tax.accountHead], this.f)
      : tax.rate;
  }

  private determineExclusiveRate() {
    if (!this.taxes.some((t) => cint(Number(t.includedInPrintRate)))) return;
    for (const item of this.doc.items) {
      let cumulatedTaxFraction = 0;
      let totalInclusiveTaxAmountPerQty = 0;
      this.taxes.forEach((tax, i) => {
        const [fraction, inclusivePerQty] = this.currentTaxFraction(tax, item.itemTaxRate);
        tax.taxFractionForCurrentItem = fraction;
        tax.grandTotalFractionForCurrentItem = i === 0
          ? 1 + tax.taxFractionForCurrentItem
          : this.taxes[i - 1].grandTotalFractionForCurrentItem + tax.taxFractionForCurrentItem;
        cumulatedTaxFraction += tax.taxFractionForCurrentItem;
        totalInclusiveTaxAmountPerQty += inclusivePerQty * flt(item.qty);
      });
      if (!this.discountAmountApplied && item.qty && (cumulatedTaxFraction || totalInclusiveTaxAmountPerQty)) {
        const amount = flt(item.amount) - totalInclusiveTaxAmountPerQty;
        // Unrounded until ERPNext #39481 reached the old site (15-10-2024).
        item.netAmount = this.old?.era === "2024-03" ? flt(amount / (1 + cumulatedTaxFraction)) : flt(amount / (1 + cumulatedTaxFraction), this.c);
        item.netRate = flt(item.netAmount / item.qty, this.c);
        item.discountPercentage = flt(item.discountPercentage, this.f);
        item.baseNetRate = this.toBase(item.netRate);
        item.baseNetAmount = this.toBase(item.netAmount);
      }
    }
  }

  private currentTaxFraction(tax: WorkTax, itemTaxMap: Record<string, number>): [number, number] {
    let fraction = 0;
    let inclusivePerQty = 0;
    if (cint(Number(tax.includedInPrintRate))) {
      const rate = this.taxRate(tax, itemTaxMap);
      if (tax.chargeType === "On Net Total") fraction = rate / 100.0;
      else if (tax.chargeType === "On Previous Row Amount") fraction = (rate / 100.0) * this.refRow(tax).taxFractionForCurrentItem;
      else if (tax.chargeType === "On Previous Row Total") fraction = (rate / 100.0) * this.refRow(tax).grandTotalFractionForCurrentItem;
      else if (tax.chargeType === "On Item Quantity") inclusivePerQty = flt(rate);
    }
    if (tax.addDeductTax === "Deduct") {
      fraction *= -1.0;
      inclusivePerQty *= -1.0;
    }
    return [fraction, inclusivePerQty];
  }

  /** The row a "previous row" tax is computed on (Python's taxes[row_id - 1], negative index included). */
  private refRow(tax: WorkTax): WorkTax {
    const i = cint(tax.rowId ?? 0) - 1;
    const row = this.taxes[i < 0 ? this.taxes.length + i : i];
    if (!row) throw new Error(`Tax row ${tax.idx}: reference row ${tax.rowId} does not exist`);
    return row;
  }

  private calculateNetTotal() {
    const d = this.doc;
    d.totalQty = d.total = d.baseTotal = d.netTotal = d.baseNetTotal = 0.0;
    for (const item of d.items) {
      d.total += item.amount;
      d.totalQty += item.qty;
      d.baseTotal += item.baseAmount;
      d.netTotal += item.netAmount;
      d.baseNetTotal += item.baseNetAmount;
    }
    d.total = flt(d.total, this.c);
    d.baseTotal = flt(d.baseTotal, this.c);
    d.netTotal = flt(d.netTotal, this.c);
    d.baseNetTotal = flt(d.baseNetTotal, this.c);
  }

  private calculateTaxWithholdingNetTotal() {
    let net = 0;
    let base = 0;
    for (const item of this.doc.items) {
      if (item.applyTds) {
        net += item.netAmount;
        base += item.baseNetAmount;
      }
    }
    this.doc.taxWithholdingNetTotal = net;
    this.doc.baseTaxWithholdingNetTotal = base;
  }

  /** Old site before 03-12-2025: ERPNext kept its working difference in the PO's rounding_adjustment. */
  private get oldDocDiff() {
    return this.old?.era === "2024-03" || this.old?.era === "2024-10";
  }

  /** Valuation-only taxes do not count in the total; Deduct rows count negative. */
  private forTotal(amount: number, tax: WorkTax) {
    let a = tax.category === "Valuation" ? 0.0 : amount;
    a *= tax.addDeductTax === "Deduct" ? -1.0 : 1.0;
    return a;
  }

  private calculateTaxes() {
    this.grandTotalDiff = 0;
    const d = this.doc;
    if (this.oldDocDiff) d.roundingAdjustment = 0;
    const keepTaxAmount = this.discountAmountApplied && this.input.applyDiscountOn === "Grand Total";
    const actualLeft = new Map<number, number>();
    for (const tax of this.taxes) if (tax.chargeType === "Actual") actualLeft.set(tax.idx, flt(tax.taxAmount, this.c));

    d.items.forEach((item, n) => {
      const last = n === d.items.length - 1;
      this.taxes.forEach((tax, i) => {
        let current = this.currentTaxAmount(item, tax);
        // Rounding loss of an Actual amount spread over the items goes to the last item.
        if (tax.chargeType === "Actual") {
          actualLeft.set(tax.idx, actualLeft.get(tax.idx)! - current);
          if (last) current += actualLeft.get(tax.idx)!;
        }
        if (tax.chargeType !== "Actual" && !keepTaxAmount) tax.taxAmount += current;
        tax.taxAmountForCurrentItem = current;
        tax.taxAmountAfterDiscountAmount += current;
        current = this.forTotal(current, tax);
        tax.grandTotalForCurrentItem = i === 0
          ? flt(item.netAmount + current)
          : flt(this.taxes[i - 1].grandTotalForCurrentItem + current);

        if (last) {
          tax.taxAmount = flt(tax.taxAmount, this.c);
          tax.taxAmountAfterDiscountAmount = flt(tax.taxAmountAfterDiscountAmount, this.c);
          tax.baseTaxAmount = this.toBase(tax.taxAmount);
          tax.baseTaxAmountAfterDiscountAmount = this.toBase(tax.taxAmountAfterDiscountAmount);
          const forTotal = this.forTotal(tax.taxAmountAfterDiscountAmount, tax);
          tax.total = i === 0 ? flt(d.netTotal + forTotal, this.c) : flt(this.taxes[i - 1].total + forTotal, this.c);
          tax.baseTotal = this.toBase(tax.total);
          if (i === this.taxes.length - 1 && this.discountAmountApplied && d.discountAmount && this.input.applyDiscountOn === "Grand Total") {
            // What the discount spread over the items did not cover. The Grand Total it starts from
            // includes the Cost Overheads, which calculateTotals adds back on its own. The old site
            // counted them twice here; counted once by owner decision 16-11-2026 (docs/04, D2).
            const overheads = this.old ? 0 : this.costOverheads;
            const diff = flt(d.grandTotal - flt(d.discountAmount) - tax.total - overheads, this.c);
            if (this.oldDocDiff) d.roundingAdjustment = diff;
            else this.grandTotalDiff = diff;
          }
        }
      });
    });
  }

  private currentTaxAmount(item: TotalsItem, tax: WorkTax) {
    const rate = this.taxRate(tax, item.itemTaxRate);
    let current = 0.0;
    switch (tax.chargeType) {
      case "Actual": {
        const actual = flt(tax.taxAmount, this.c);
        current = this.doc.netTotal ? (item.netAmount * actual) / this.doc.netTotal : 0.0;
        break;
      }
      case "On Net Total":
        current = (rate / 100.0) * item.netAmount;
        break;
      case "On Previous Row Amount":
        current = (rate / 100.0) * this.refRow(tax).taxAmountForCurrentItem;
        break;
      case "On Previous Row Total":
        current = (rate / 100.0) * this.refRow(tax).grandTotalForCurrentItem;
        break;
      case "On Item Quantity":
        current = rate * item.qty;
        break;
    }
    // item_wise_tax_detail, in company currency, summed per item code.
    const key = item.itemCode || item.itemName || "";
    let amount = current * this.doc.conversionRate;
    const prev = tax.itemWiseTaxDetail.get(key);
    if (prev) amount += prev[1];
    tax.itemWiseTaxDetail.set(key, [rate, flt(amount)]);
    return current;
  }

  private adjustGrandTotalForInclusiveTax() {
    if (!this.taxes.length || !this.taxes.some((t) => cint(Number(t.includedInPrintRate)))) return;
    const lastTax = this.taxes[this.taxes.length - 1];
    let nonInclusive = 0;
    for (const t of this.taxes) {
      if (!t.includedInPrintRate) nonInclusive += this.oldDocDiff ? flt(t.taxAmountAfterDiscountAmount) : this.forTotal(t.taxAmountAfterDiscountAmount, t);
    }
    let diff = this.doc.total + nonInclusive - flt(lastTax.total, this.c);
    if (this.discountAmountApplied && this.doc.discountAmount) diff -= flt(this.doc.discountAmount);
    diff = flt(diff, this.c);
    if (diff && Math.abs(diff) <= 5.0 / 10 ** this.c) {
      // 2024-03 code kept it in rounding_adjustment; 2024-10 code in a field the add-on's totals never read.
      if (this.old?.era === "2024-03") this.doc.roundingAdjustment = diff;
      else if (this.old?.era !== "2024-10") this.grandTotalDiff = diff;
    }
  }

  /**
   * `calculate_totals`, as the add-on replaced it: the Cost Overhead charges join the Grand Total
   * here, so they also count in Total Taxes and Charges (when the PO has tax rows), in a discount
   * on the Grand Total and in the Rounded Total (addon.ts).
   */
  private calculateTotals() {
    const d = this.doc;
    const taxes = this.taxes;
    // The working difference (discount not spread over items, inclusive-tax rounding). The
    // add-on's copy read it from the PO's rounding_adjustment field (OldSiteMode); from 03-12-2025
    // that carried the form's previous rounding adjustment into the Grand Total. Not carried over,
    // by owner decision 16-11-2026 (docs/04, D1).
    const diff = this.old ? flt(d.roundingAdjustment) : this.grandTotalDiff;
    d.grandTotal = (taxes.length ? flt(taxes[taxes.length - 1].total) + diff : flt(d.netTotal)) + this.costOverheads;
    d.totalTaxesAndCharges = taxes.length ? flt(d.grandTotal - d.netTotal - diff, this.c) : 0.0;
    d.baseTotalTaxesAndCharges = this.toBase(d.totalTaxesAndCharges);
    if (this.old) d.baseRoundingAdjustment = this.toBase(d.roundingAdjustment);

    d.taxesAndChargesAdded = d.taxesAndChargesDeducted = 0.0;
    for (const tax of taxes) {
      if (tax.category === "Valuation and Total" || tax.category === "Total") {
        if (tax.addDeductTax === "Add") d.taxesAndChargesAdded += flt(tax.taxAmountAfterDiscountAmount);
        else d.taxesAndChargesDeducted += flt(tax.taxAmountAfterDiscountAmount);
      }
    }
    d.taxesAndChargesAdded = flt(d.taxesAndChargesAdded, this.c);
    d.taxesAndChargesDeducted = flt(d.taxesAndChargesDeducted, this.c);
    // ERPNext takes the net total when there is no tax; with Cost Overheads that left them out of
    // the company-currency Grand Total on the old site. Here they stay in, by owner decision
    // 16-11-2026 (docs/04, D3).
    d.baseGrandTotal = d.taxesAndChargesAdded || d.taxesAndChargesDeducted || (!this.old && this.costOverheads)
      ? flt(d.grandTotal * d.conversionRate)
      : d.baseNetTotal;
    d.baseTaxesAndChargesAdded = this.toBase(d.taxesAndChargesAdded);
    d.baseTaxesAndChargesDeducted = this.toBase(d.taxesAndChargesDeducted);
    d.grandTotal = flt(d.grandTotal, this.c);
    d.baseGrandTotal = flt(d.baseGrandTotal, this.c);
    this.setRoundedTotal();
  }

  private setRoundedTotal() {
    const d = this.doc;
    if (this.input.disableRoundedTotal) {
      d.roundedTotal = 0;
      d.baseRoundedTotal = 0;
      // Old site before 03-12-2025 left the adjustment as it was; since then ERPNext zeroes it.
      if (!this.oldDocDiff) d.roundingAdjustment = 0;
      if (!this.old) d.baseRoundingAdjustment = 0;
      return;
    }
    d.roundedTotal = roundToCurrencyFraction(d.grandTotal, this.input.smallestCurrencyFraction, this.c);
    const adjustment = flt(d.roundedTotal - d.grandTotal, this.c);
    // Until 15-10-2024 ERPNext added it to the working difference already held there.
    d.roundingAdjustment = this.old?.era === "2024-03" ? d.roundingAdjustment + adjustment : adjustment;
    d.baseRoundingAdjustment = this.toBase(d.roundingAdjustment);
    d.baseRoundedTotal = this.toBase(d.roundedTotal);
  }

  private calculateTotalNetWeight() {
    this.doc.totalNetWeight = 0.0;
    for (const item of this.doc.items) if (item.totalWeight) this.doc.totalNetWeight += item.totalWeight;
  }

  /** `set_discount_amount`: Additional Discount % of the Grand or Net Total. */
  private setDiscountAmount() {
    const d = this.doc;
    if (this.input.additionalDiscountPercentage) {
      const base = this.input.applyDiscountOn === "Grand Total" ? d.grandTotal : d.netTotal;
      d.discountAmount = flt((flt(base) * this.input.additionalDiscountPercentage) / 100, this.c);
    }
  }

  /** `apply_discount_amount`: spread the discount over the items' net amounts, then recompute. */
  private applyDiscountAmount() {
    const d = this.doc;
    if (!d.discountAmount) {
      d.baseDiscountAmount = 0;
      return;
    }
    d.baseDiscountAmount = flt(d.discountAmount * d.conversionRate, this.c);
    if (this.oldDocDiff) return this.applyDiscountAmountBefore2025();
    const totalForDiscount = this.totalForDiscountAmount();
    let netTotal = 0;
    let expectedNetTotal = 0;
    if (!totalForDiscount) return;
    for (const item of d.items) {
      const distributed = (flt(d.discountAmount) * item.netAmount) / totalForDiscount;
      const adjusted = item.netAmount - distributed;
      expectedNetTotal += adjusted;
      item.netAmount = flt(adjusted, this.c);
      netTotal += item.netAmount;
      const roundingDifference = flt(expectedNetTotal - netTotal, this.c);
      if (roundingDifference) {
        item.netAmount = flt(item.netAmount + roundingDifference, this.c);
        netTotal += roundingDifference;
      }
      item.netRate = item.qty ? flt(item.netAmount / item.qty, this.c) : 0;
      item.baseNetRate = this.toBase(item.netRate);
      item.baseNetAmount = this.toBase(item.netAmount);
    }
    this.discountAmountApplied = true;
    this.calculateOnce();
  }

  /**
   * The old site's discount code until 03-12-2025 (ERPNext before #46720): the whole rounding
   * loss went to the last item, and only when there were no tax rows or the discount was on the
   * Net Total.
   */
  private applyDiscountAmountBefore2025() {
    const d = this.doc;
    const totalForDiscount = this.totalForDiscountAmountBefore2025();
    if (!totalForDiscount) return;
    let netTotal = 0;
    d.items.forEach((item, i) => {
      const distributed = (flt(d.discountAmount) * item.netAmount) / totalForDiscount;
      item.netAmount = flt(item.netAmount - distributed, this.c);
      netTotal += item.netAmount;
      const lossToLastItem = this.input.applyDiscountOn === "Net Total" || !this.taxes.length || totalForDiscount === d.netTotal;
      if (lossToLastItem && i === d.items.length - 1) {
        const loss = flt(d.netTotal - netTotal - d.discountAmount, this.c);
        item.netAmount = flt(item.netAmount + loss, this.c);
      }
      item.netRate = item.qty ? flt(item.netAmount / item.qty, this.c) : 0;
      item.baseNetRate = this.toBase(item.netRate);
      item.baseNetAmount = this.toBase(item.netAmount);
    });
    this.discountAmountApplied = true;
    this.calculateOnce();
  }

  /** Before 03-12-2025. Its row_id lookup compared text with numbers, so it never matched. */
  private totalForDiscountAmountBefore2025() {
    const d = this.doc;
    if (this.input.applyDiscountOn === "Net Total") return d.netTotal;
    let actual = 0;
    for (const tax of this.taxes) {
      if (tax.chargeType === "Actual" || tax.chargeType === "On Item Quantity") actual += this.forTotal(tax.taxAmount, tax);
    }
    return flt(d.grandTotal - actual, this.c);
  }

  /**
   * `get_total_for_discount_amount`: on Grand Total, fixed charges (Actual / per-quantity rows,
   * and here the Cost Overheads, owner decision 16-11-2026, docs/04 D2) are not spread over the items.
   */
  private totalForDiscountAmount() {
    const d = this.doc;
    if (this.input.applyDiscountOn === "Net Total") return d.netTotal;
    let totalActualTax = 0;
    const actualTaxes = new Map<number, { taxAmount: number; cumulative: number }>();
    const update = (tax: WorkTax, amount: number) => {
      let a = amount;
      if (tax.addDeductTax === "Deduct") a *= -1;
      if (tax.category !== "Valuation") totalActualTax += a;
      actualTaxes.set(tax.idx, { taxAmount: a, cumulative: totalActualTax });
    };
    for (const tax of this.taxes) {
      if (tax.chargeType === "Actual" || tax.chargeType === "On Item Quantity") {
        update(tax, tax.taxAmount);
        continue;
      }
      if (!tax.rowId) continue;
      const baseRow = actualTaxes.get(cint(tax.rowId));
      if (!baseRow) continue;
      const baseAmount = tax.chargeType === "On Previous Row Amount" ? baseRow.taxAmount : baseRow.cumulative;
      update(tax, (baseAmount * tax.rate) / 100);
    }
    return d.grandTotal - totalActualTax - (this.old ? 0 : this.costOverheads);
  }
}

/** Σ service charges of the Cost Overhead rows, summed in row order as Python does. */
export function sumCharges(charges: readonly number[]) {
  let total = 0;
  for (const c of charges) total += flt(c);
  return total;
}

/** Totals, taxes and discount of a Purchase Order (ERPNext 14 rules, old-site settings). */
export function calculateTotals(input: TotalsInput): TotalsResult {
  return new PurchaseOrderTotals(input).run();
}
