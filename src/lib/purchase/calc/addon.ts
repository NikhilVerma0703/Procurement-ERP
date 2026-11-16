// What the custom add-on `pacific_group` added to the PO calculation. Its code was never
// released; these rules come from calling its functions on the live site (16-11-2026,
// docs/reference/live-capture/addon-server-probe-2026-11-16.md) and from the 3,199 stored POs
// (golden check, Step 4). Pure.
import { flt } from "./pymath";
import { SITE_PRECISION, type Precision } from "./settings";

// Cost Overheads (service charges such as freight or insurance) are the add-on's other rule: they
// join the Grand Total inside ERPNext's own totals step, so they live in totals.ts
// (calculateTotals). The GST on a charge is a separate Actual tax row.

export interface AddonGstColumns {
  igst: number;
  igstAmt: number;
  cgst: number;
  cgstAmt: number;
  sgst: number;
  sgstAmt: number;
}

export const NO_ADDON_GST: AddonGstColumns = { igst: 0, igstAmt: 0, cgst: 0, cgstAmt: 0, sgst: 0, sgstAmt: 0 };

/**
 * The add-on's own GST columns on an item row (shown on the form and printed on the PO sheet):
 * from the row's Item Tax Template, the highest rate is IGST and the lowest is CGST = SGST;
 * the amount is the row amount × rate. Out-State POs fill IGST, In-State POs fill CGST and SGST.
 * A row without a template, or a PO of any other tax category, gets none.
 * The old form filled them in the browser, 2 s after an item, qty or rate was typed, so many
 * stored rows are stale or empty; here they are computed on every save.
 */
export function addonGstColumns(
  amount: number,
  templateRates: readonly number[] | null,
  taxCategory: string | null,
  precision: Precision = SITE_PRECISION,
): AddonGstColumns {
  if (!templateRates?.length) return { ...NO_ADDON_GST };
  const max = Math.max(...templateRates);
  const min = Math.min(...templateRates);
  if (taxCategory === "Out-State") return { ...NO_ADDON_GST, igst: max, igstAmt: flt((amount * max) / 100, precision.float) };
  if (taxCategory === "In-State") {
    const amt = flt((amount * min) / 100, precision.float);
    return { ...NO_ADDON_GST, cgst: min, cgstAmt: amt, sgst: min, sgstAmt: amt };
  }
  return { ...NO_ADDON_GST };
}
