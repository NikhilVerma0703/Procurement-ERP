// GST figures on each PO item row, as India Compliance 14 sets them on save
// (india_compliance/gst_india/overrides/transaction.py):
//   * update_taxable_values — Taxable Value: the row's net amount plus its share of charges
//     that GST is levied on (a GST row "On Previous Row Total" over a freight row, say);
//   * ItemGSTDetails.update  — IGST/CGST/SGST/Cess rate and amount per row, taken from the tax
//     rows' item-wise breakup, with rounding differences on the last taxed row;
//   * ItemGSTTreatment.set   — Taxable / Nil-Rated / Exempted / Non-GST per row.
// Pure.
import { cint, flt } from "./pymath";
import { GST_TAX_TYPES, GST_TAX_TYPES_WITH_RCM, SITE_PRECISION, type GstTaxType, type Precision } from "./settings";

export interface GstTaxRowInput {
  chargeType: string;
  rowId: number | null;
  rate: number;
  accountHead: string;
  addDeductTax: string;
  /** GST Settings maps the account to igst / cgst / sgst / cess / cess_non_advol (+ "_rcm"); null otherwise. */
  gstTaxType: string | null;
  baseTaxAmountAfterDiscountAmount: number;
  baseTotal: number;
  itemWiseTaxDetail: Record<string, [number, number]>;
}

export interface GstItemInput {
  itemCode: string | null;
  itemName: string | null;
  qty: number;
  baseNetAmount: number;
  itemTaxTemplate: string | null;
  /** What the row had before (kept when it is Exempted / Non-GST and the PO has no GST rows). */
  gstTreatment: string | null;
}

export type ItemGstDetail = Record<`${GstTaxType}_rate` | `${GstTaxType}_amount`, number>;

const itemKey = (i: { itemCode: string | null; itemName: string | null }) => i.itemCode || i.itemName || "";

/** Taxable Value of each row (`update_taxable_values`). `tdsAccounts`: tax-withholding accounts of the company. */
export function taxableValues(
  items: GstItemInput[],
  taxes: GstTaxRowInput[],
  doc: { baseNetTotal: number; totalQty: number },
  tdsAccounts: ReadonlySet<string> = new Set(),
  precision: Precision = SITE_PRECISION,
): number[] {
  let totalCharges = 0;
  let apportioned = 0;
  let tds = 0;
  let hasNoQtyValue = false;

  if (taxes.length) {
    let refIndex: number | null;
    if (taxes.some((r) => r.baseTaxAmountAfterDiscountAmount && GST_TAX_TYPES_WITH_RCM.includes(r.gstTaxType ?? ""))) {
      const ref = taxes.find(
        (r) => r.baseTaxAmountAfterDiscountAmount && r.chargeType === "On Previous Row Total" && GST_TAX_TYPES_WITH_RCM.includes(r.gstTaxType ?? ""),
      );
      refIndex = ref ? cint(ref.rowId ?? 0) - 1 : null;
    } else {
      refIndex = -1;
      for (const r of taxes) {
        if (!tdsAccounts.has(r.accountHead)) continue;
        if (r.addDeductTax === "Deduct") tds -= r.baseTaxAmountAfterDiscountAmount;
        else tds += r.baseTaxAmountAfterDiscountAmount;
      }
    }
    if (refIndex !== null) {
      const row = taxes[refIndex < 0 ? taxes.length + refIndex : refIndex];
      totalCharges = row.baseTotal - doc.baseNetTotal - tds;
    }
  }

  let totalValue = doc.baseNetTotal ? doc.baseNetTotal : doc.totalQty;
  if (!totalValue) {
    totalValue = items.length;
    hasNoQtyValue = true;
  }

  const out = items.map((item) => {
    let taxable = item.baseNetAmount;
    if (totalCharges) {
      const proportionate = hasNoQtyValue ? 1 : doc.baseNetTotal ? item.baseNetAmount : item.qty;
      const applicable = flt(proportionate * (totalCharges / totalValue), precision.currency);
      taxable += applicable;
      apportioned += applicable;
    }
    return taxable;
  });
  if (out.length && apportioned !== totalCharges) out[out.length - 1] += totalCharges - apportioned;
  return out;
}

const blankDetail = (): ItemGstDetail & { count: number } => {
  const d = { count: 0 } as ItemGstDetail & { count: number };
  for (const t of GST_TAX_TYPES) {
    d[`${t}_rate`] = 0;
    d[`${t}_amount`] = 0;
  }
  return d;
};

/** Per-row GST rates and amounts (`ItemGSTDetails.update`). `taxableValues` from the step above. */
export function itemGstDetails(
  items: GstItemInput[],
  taxes: GstTaxRowInput[],
  taxable: number[],
  precision: Precision = SITE_PRECISION,
  /** Put the tax rows' rounding differences on the last taxed row (India Compliance since 03-12-2025 on the old site). */
  roundingDifferenceToLastRow = true,
): ItemGstDetail[] {
  const details = new Map<string, ItemGstDetail & { count: number }>();
  for (const row of items) {
    const key = itemKey(row);
    if (!details.has(key)) details.set(key, blankDetail());
    details.get(key)!.count += 1;
  }

  for (const row of taxes) {
    const type = row.gstTaxType as GstTaxType | null;
    if (!row.baseTaxAmountAfterDiscountAmount || !type || !GST_TAX_TYPES.includes(type) || !Object.keys(row.itemWiseTaxDetail ?? {}).length) continue;
    const rateField = `${type}_rate` as const;
    const amountField = `${type}_amount` as const;
    let difference = row.baseTaxAmountAfterDiscountAmount;
    let lastWithTax: (ItemGstDetail & { count: number }) | null = null;
    for (const [name, [rate, amount]] of Object.entries(row.itemWiseTaxDetail)) {
      const d = details.get(name);
      if (!d) continue;
      difference -= amount;
      if (amount && !rate) continue; // an Actual charge
      d[rateField] = rate;
      d[amountField] += amount;
      if (amount) lastWithTax = d;
    }
    difference = flt(difference, 5);
    if (roundingDifferenceToLastRow && difference && lastWithTax) lastWithTax[amountField] += difference;
  }

  // Several rows of one item share its totals: each but the last gets rate × its taxable value.
  return items.map((item, i) => {
    const d = details.get(itemKey(item))!;
    const { count: _count, ...detail } = d;
    void _count;
    if (d.count === 1) return { ...detail };
    d.count -= 1;
    const response = { ...detail };
    for (const t of GST_TAX_TYPES) {
      const rate = d[`${t}_rate`];
      if (rate === 0) continue;
      const multiplier = t === "cess_non_advol" ? item.qty : taxable[i] / 100;
      const amount = flt(rate * multiplier, precision.float);
      d[`${t}_amount`] -= amount;
      response[`${t}_amount`] = amount;
    }
    return response;
  });
}

/** GST treatment of each row (`ItemGSTTreatment.set`, purchase side). */
export function itemGstTreatments(
  items: GstItemInput[],
  taxes: Pick<GstTaxRowInput, "chargeType" | "gstTaxType" | "rate">[],
  templateTreatment: (template: string) => string | null,
): (string | null)[] {
  const hasGstAccounts = taxes.some((r) => GST_TAX_TYPES_WITH_RCM.includes(r.gstTaxType ?? ""));
  if (!hasGstAccounts) {
    return items.map((i) => (i.gstTreatment === "Exempted" || i.gstTreatment === "Non-GST" ? i.gstTreatment : "Nil-Rated"));
  }
  let fallback = "Taxable";
  for (const r of taxes) {
    if (r.chargeType === "Actual" || r.chargeType === "On Item Quantity") continue;
    if (!GST_TAX_TYPES.includes((r.gstTaxType ?? "") as GstTaxType)) continue;
    if (r.rate === 0) fallback = "Nil-Rated";
    break;
  }
  return items.map((i) => {
    const t = i.itemTaxTemplate ? templateTreatment(i.itemTaxTemplate) : null;
    return !t || !i.itemTaxTemplate ? fallback : t;
  });
}
