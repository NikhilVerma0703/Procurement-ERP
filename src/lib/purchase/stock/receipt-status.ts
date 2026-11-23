// A Purchase Receipt's status pill, as the old list and form showed it (Phase II, owner 21-11-2026).
//
// Frappe's frappe.get_indicator: a draft "Draft" and a cancelled receipt "Cancelled" (both red);
// a submitted one by ERPNext 14.92's purchase_receipt_list.js get_indicator — Return, Closed, Return
// Issued, To Bill, Partly Billed, Completed, in that order. Pure.

import { flt } from "../calc/pymath";

export type IndicatorColour = "red" | "orange" | "yellow" | "green" | "blue" | "gray";
export interface Indicator {
  label: string;
  colour: IndicatorColour;
}

export interface ReceiptStatusInput {
  docStatus: "DRAFT" | "SUBMITTED" | "CANCELLED";
  status: string;
  isReturn: boolean;
  grandTotal: number;
  perBilled: number;
  perReturned: number;
}

export function receiptIndicator(d: ReceiptStatusInput): Indicator {
  if (d.docStatus === "DRAFT") return { label: "Draft", colour: "red" };
  if (d.docStatus === "CANCELLED") return { label: "Cancelled", colour: "red" };
  if (d.isReturn) return { label: "Return", colour: "gray" };
  if (d.status === "Closed") return { label: "Closed", colour: "green" };
  if (flt(d.perReturned, 2) === 100) return { label: "Return Issued", colour: "gray" };
  if (flt(d.grandTotal) !== 0 && flt(d.perBilled, 2) === 0) return { label: "To Bill", colour: "orange" };
  if (flt(d.perBilled, 2) > 0 && flt(d.perBilled, 2) < 100) return { label: "Partly Billed", colour: "yellow" };
  if (flt(d.grandTotal) === 0 || flt(d.perBilled, 2) === 100) return { label: "Completed", colour: "green" };
  return { label: "Submitted", colour: "blue" };
}
