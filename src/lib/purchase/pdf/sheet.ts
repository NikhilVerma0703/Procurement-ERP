// What a PO sheet prints, taken from the stored PO — every figure as stored
// (a sheet never recomputes: an approved PO prints what was approved), every
// value as the old Jinja templates received it. The layouts (layouts/*.ts)
// only arrange these values. Pure.
import { addressLines } from "../address";
import { formatCurrency, type CurrencyDisplay } from "../format";
import { htmlToText } from "../html";
import { PO_STATUS_KEYS, labelOf } from "../orders/labels";
import { DOC_STATUS_LABEL, type OrderRecord } from "../orders/record";
import { asFloat } from "./pyfmt";

const f = (v: { toString(): string } | null | undefined) => asFloat(v) ?? 0;

export interface SheetItem {
  idx: number;
  itemCode: string;
  itemName: string;
  description: string | null;
  hsn: string | null;
  uom: string;
  qty: number;
  rate: number;
  /** `row.get_formatted("rate", doc)`: "₹ 11,900.00". */
  rateShown: string;
  discountPercentage: number;
  amount: number;
  netAmount: number;
  cgst: number;
  cgstAmt: number;
  sgst: number;
  sgstAmt: number;
  igst: number;
  igstAmt: number;
  scheduleDate: Date | null;
}

export interface PoSheet {
  number: string;
  docStatus: "Draft" | "Submitted" | "Cancelled";
  /** The PO's status label ("To Receive and Bill", "Draft", …). */
  status: string;
  supplier: string;
  supplierName: string;
  supplierAddress: string | null;
  addressDisplay: string | null;
  supplierGstin: string | null;
  transactionDate: Date;
  scheduleDate: Date | null;
  currency: string;
  /** The Terms template's name (printed as the delivery term). */
  tcName: string | null;
  /** The Terms and Conditions as printed, block by block; null when the PO has none ("None"). */
  terms: TermsBlock[] | null;
  shippingAddress: string | null;
  shippingAddressDisplay: string | null;
  billingAddressDisplay: string | null;
  companyGstin: string | null;
  modeOfTransport: string | null;
  shipmentType: string | null;
  purposeOfPurchase: string | null;
  paymentTermsTemplate: string | null;
  schedule: { paymentTerm: string | null; description: string | null; dueDate: Date; invoicePortion: number; paymentAmount: number }[];
  items: SheetItem[];
  /** Cost Overheads; `chargesText` is the charge as typed (the add-on's field was text). */
  services: { serviceItem: string | null; serviceCharges: number | null; chargesText: string | null }[];
  taxes: { accountHead: string; description: string | null; rate: number; taxAmount: number; total: number }[];
  total: number;
  netTotal: number;
  discountAmount: number;
  taxesAndChargesAdded: number;
  totalTaxesAndCharges: number;
  grandTotal: number;
  roundingAdjustment: number;
  roundedTotal: number;
  inWords: string | null;
  /** How amounts in the PO's currency are shown (₹, $, €…). */
  money: CurrencyDisplay;
}

/**
 * A piece of the Terms and Conditions as the sheet prints it. The editor stored paragraphs
 * (`<p>`); the old print CSS gave each paragraph a 3px margin above and below, which is why an
 * empty editor (`<p><br></p>`) still prints an empty line with space around it.
 */
export interface TermsBlock {
  /** The text, one line per line break ("" for an empty paragraph). */
  text: string;
  /** A paragraph (spaced above and below), or loose text outside one. */
  paragraph: boolean;
}

/** Address texts as printed: one line per <br>, no tags. */
export const lines = (display: string | null | undefined) => addressLines(display);

/** Frappe's PDF file name: the document name with "/" and spaces as "-". */
export const pdfFileName = (number: string) => `${number.replace(/ /g, "-").replace(/\//g, "-")}.pdf`;

/** The terms' paragraphs and the loose text between them, in order. */
export function termsBlocks(html: string): TermsBlock[] {
  const out: TermsBlock[] = [];
  const P = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let last = 0;
  const loose = (chunk: string) => {
    const text = htmlToText(chunk);
    if (text) out.push({ text, paragraph: false });
  };
  for (let m = P.exec(html); m; m = P.exec(html)) {
    loose(html.slice(last, m.index));
    out.push({ text: htmlToText(m[1]), paragraph: true });
    last = m.index + m[0].length;
  }
  loose(html.slice(last));
  return out;
}

export function poSheet(o: OrderRecord): PoSheet {
  const money: CurrencyDisplay = { symbol: o.currencyRef.symbol, fractionUnits: o.currencyRef.fractionUnits };
  return {
    number: o.number,
    docStatus: DOC_STATUS_LABEL[o.docStatus],
    status: labelOf(PO_STATUS_KEYS, o.status),
    supplier: o.supplier.code,
    supplierName: o.supplierName,
    supplierAddress: o.supplierAddress?.code ?? null,
    addressDisplay: o.addressDisplay,
    supplierGstin: o.supplierGstin,
    transactionDate: o.transactionDate,
    scheduleDate: o.scheduleDate,
    currency: o.currency,
    tcName: o.termsTemplate?.code ?? null,
    terms: o.terms === null ? null : termsBlocks(o.terms),
    shippingAddress: o.shippingAddress?.code ?? null,
    shippingAddressDisplay: o.shippingAddressDisplay,
    billingAddressDisplay: o.billingAddressDisplay,
    companyGstin: o.companyGstin,
    modeOfTransport: o.modeOfTransport,
    shipmentType: o.shipmentType,
    purposeOfPurchase: o.purposeOfPurchase,
    paymentTermsTemplate: o.paymentTermsTemplate?.code ?? null,
    schedule: o.paymentSchedule.map((s) => ({
      paymentTerm: s.paymentTermName,
      description: s.description,
      dueDate: s.dueDate,
      invoicePortion: f(s.invoicePortion),
      paymentAmount: f(s.paymentAmount),
    })),
    items: o.items.map((i) => ({
      idx: i.idx,
      itemCode: i.itemCode,
      itemName: i.itemName,
      description: i.description,
      hsn: i.gstHsnCode,
      uom: i.uom,
      qty: f(i.qty),
      rate: f(i.rate),
      rateShown: formatCurrency(i.rate.toString(), money),
      discountPercentage: f(i.discountPercentage),
      amount: f(i.amount),
      netAmount: f(i.netAmount),
      cgst: f(i.cgst),
      cgstAmt: f(i.cgstAmt),
      sgst: f(i.sgst),
      sgstAmt: f(i.sgstAmt),
      igst: f(i.igst),
      igstAmt: f(i.igstAmt),
      scheduleDate: i.scheduleDate,
    })),
    services: o.costOverheads.map((c) => {
      const typed = (c.legacy as { service_charges?: unknown } | null)?.service_charges;
      const charges = asFloat(c.serviceCharges);
      return {
        serviceItem: c.serviceItem?.code ?? null,
        serviceCharges: charges,
        chargesText: typeof typed === "string" ? typed : charges === null ? null : String(charges),
      };
    }),
    taxes: o.taxes.map((t) => ({ accountHead: t.accountHead.code, description: t.description, rate: f(t.rate), taxAmount: f(t.taxAmount), total: f(t.total) })),
    total: f(o.total),
    netTotal: f(o.netTotal),
    discountAmount: f(o.discountAmount),
    taxesAndChargesAdded: f(o.taxesAndChargesAdded),
    totalTaxesAndCharges: f(o.totalTaxesAndCharges),
    grandTotal: f(o.grandTotal),
    roundingAdjustment: f(o.roundingAdjustment),
    roundedTotal: f(o.roundedTotal),
    inWords: o.inWords,
    money,
  };
}
