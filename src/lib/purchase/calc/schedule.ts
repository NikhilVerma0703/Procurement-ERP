// Payment Schedule of a Purchase Order (ERPNext 14 accounts_controller: set_payment_schedule,
// get_payment_term_details, get_due_date). Rows come from the Payment Terms Template when the
// PO has none yet; their amounts are recomputed from the Rounded Total on every save. Pure.
import { flt } from "./pymath";
import { SITE_PRECISION, type Precision } from "./settings";

export type DueDateBasedOn =
  | "Day(s) after invoice date"
  | "Day(s) after the end of the invoice month"
  | "Month(s) after the end of the invoice month";

export interface PaymentTermInput {
  paymentTermName: string | null;
  description: string | null;
  invoicePortion: number;
  modeOfPayment: string | null;
  dueDateBasedOn: DueDateBasedOn | string | null;
  creditDays: number;
  creditMonths: number;
  discountType: string | null;
  discount: number;
  discountValidityBasedOn: DueDateBasedOn | string | null;
  discountValidity: number;
}

export interface ScheduleAmounts {
  paymentAmount: number;
  basePaymentAmount: number;
  outstanding: number;
}

/** Dates are calendar dates ("YYYY-MM-DD"), as ERPNext keeps them. */
function parse(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}
const fmt = (y: number, m: number, day: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(date: string, n: number): string {
  const { y, m, day } = parse(date);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Frappe add_months (relativedelta): the day is clamped to the target month's length. */
export function addMonths(date: string, n: number): string {
  const { y, m, day } = parse(date);
  const idx = y * 12 + (m - 1) + n;
  const ty = Math.floor(idx / 12);
  const tm = (idx % 12) + 1;
  return fmt(ty, tm, Math.min(day, daysInMonth(ty, tm)));
}

export function lastDayOfMonth(date: string): string {
  const { y, m } = parse(date);
  return fmt(y, m, daysInMonth(y, m));
}

function dateBy(basedOn: string | null, date: string, days: number, months: number): string | null {
  if (basedOn === "Day(s) after invoice date") return addDays(date, days);
  if (basedOn === "Day(s) after the end of the invoice month") return addDays(lastDayOfMonth(date), days);
  if (basedOn === "Month(s) after the end of the invoice month") return lastDayOfMonth(addMonths(date, months));
  return null;
}

/** A PO has no posting or bill date: terms run from the transaction date. */
export function scheduleFromTerms(terms: PaymentTermInput[], transactionDate: string) {
  return terms.map((t) => {
    let dueDate = dateBy(t.dueDateBasedOn, transactionDate, t.creditDays, t.creditMonths) ?? transactionDate;
    if (dueDate < transactionDate) dueDate = transactionDate;
    const discountDate = dateBy(t.discountValidityBasedOn, transactionDate, t.discountValidity, t.discountValidity);
    return { ...t, dueDate, discountDate };
  });
}

/** One row for the whole amount, due on the transaction date, when the PO has no terms template. */
export function defaultSchedule(transactionDate: string) {
  return [{ dueDate: transactionDate, invoicePortion: 100 }];
}

/**
 * Amounts of each schedule row: the portion of the Rounded Total (the Grand Total when rounding
 * is off or the rounded total is 0). A row without a portion keeps its typed amount and its
 * outstanding.
 */
export function scheduleAmounts(
  rows: { invoicePortion: number; paymentAmount: number; outstanding: number }[],
  t: { grandTotal: number; baseGrandTotal: number; roundedTotal: number; baseRoundedTotal: number; conversionRate: number },
  precision: Precision = SITE_PRECISION,
): ScheduleAmounts[] {
  const grandTotal = t.roundedTotal || t.grandTotal;
  const baseGrandTotal = t.baseRoundedTotal || t.baseGrandTotal;
  return rows.map((d) => {
    if (d.invoicePortion) {
      const paymentAmount = flt(grandTotal * flt(d.invoicePortion / 100), precision.currency);
      return { paymentAmount, basePaymentAmount: flt(baseGrandTotal * flt(d.invoicePortion / 100), precision.currency), outstanding: paymentAmount };
    }
    return { paymentAmount: d.paymentAmount, basePaymentAmount: flt(d.paymentAmount * t.conversionRate, precision.currency), outstanding: d.outstanding };
  });
}
