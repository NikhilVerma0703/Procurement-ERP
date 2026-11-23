// A Purchase Receipt's computed figures: the buying calculation engine of the POs (ERPNext's
// taxes_and_totals is one for every buying document; the add-on's services charges and India
// Compliance's GST per row work on receipts as on POs), plus the one rule only receipts have.
// Phase II, owner 21-11-2026. Proven by npm run golden:receipts over all 5,593 old receipts.
import { calculatePurchaseOrder, type PurchaseOrderCalcInput, type PurchaseOrderCalcResult } from "../calc";
import { flt } from "../calc/pymath";
import { GST_TAX_TYPES, SITE_PRECISION } from "../calc/settings";
import type { OldSiteEra } from "../calc/totals";

export type ReceiptCalcInput = PurchaseOrderCalcInput;
export type ReceiptCalcResult = PurchaseOrderCalcResult;

/**
 * True when the old site of that period stored a receipt's GST amounts per row rounded to the
 * currency precision. Since its update of 03-12-2025 every receipt's row GST amounts were stored
 * rounded (not one of the 4,330 receipt rows saved since has more than 3 decimals, while POs of the
 * same days kept India Compliance's unrounded figures): the receipt's own valuation step
 * (update_valuation_rate → round_floats_in) now ran after India Compliance filled them. The
 * replica follows the old site as it is today, so receipts saved here are rounded too.
 */
export const receiptRoundsRowGst = (era: OldSiteEra | undefined) => era === undefined || era === "2025-12" || era === "2026-04";

export function calculateReceipt(input: ReceiptCalcInput): ReceiptCalcResult {
  const r = calculatePurchaseOrder(input);
  if (!receiptRoundsRowGst(input.oldSite?.era)) return r;
  const p = (input.precision ?? SITE_PRECISION).currency;
  return {
    ...r,
    items: r.items.map((it) => {
      const gst = { ...it.gst };
      for (const t of GST_TAX_TYPES) gst[`${t}_amount`] = flt(gst[`${t}_amount`], p);
      return { ...it, gst };
    }),
  };
}
