/* eslint-disable @typescript-eslint/no-explicit-any */
// The heading box of the 2024–2025 layouts ("Import PO", "PO print format",
// "Purchase Order 2025", "PURCHASE ORDER TEMPLATE"): the order details as
// lines with a rule under each pair, instead of "PDF PO"'s grid.
//
// Their templates laid these out with flexbox, which wkhtmltopdf's WebKit did
// not know, so on the printed sheets everything stacked: PO NO above PO DATE
// (with the short upright line the half-width box left beside PO NO),
// CURRENCY above DELIVERY DATE, and PAYMENT TERMS under the shipping address
// instead of beside it. That stacked sheet is what suppliers received, and it
// is what is drawn here, except that the browser cut the TEMPLATE's PAYMENT
// TERMS off at the left edge; it prints in full here. Pure.
import { dmy, jinja } from "../pyfmt";
import type { PoSheet } from "../sheet";
import { addressOrNone, b, box, bullets, LINE, logoAndTitle, para, scheduleItems, termsNodes } from "./parts";

const black = () => "#000000";
/** The box's inner edge to the right column (297.75pt on the page), and the right column's width. */
const LEFT = 254.25;
const RIGHT = 252;

/** A half-width line with the upright rule after it (the 50%-wide `.left-info` box's border). */
function barred(text: string): any {
  return {
    table: { widths: [124.5, "*"], body: [[para(b(text)), { text: "" }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 1 ? LINE : 0),
      vLineColor: black,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

/** One `.abc` block: 2px in, a rule under it. */
export const ruled = (rows: any[]) => box({ stack: rows }, { border: [0, 0, 0, LINE], padding: [1.5, 0, 0, 0] });

/** "MODE OF TRANSPORT" in a half-width padded box with its upright rule (the TEMPLATE's flex child). */
export function paddedBarred(text: string): any {
  return {
    table: { widths: [126 - 3 - LINE, "*"], body: [[para(b(text)), { text: "" }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 1 ? LINE : 0),
      vLineColor: black,
      paddingLeft: (i: number) => (i === 0 ? 1.5 : 0),
      paddingRight: (i: number) => (i === 0 ? 1.5 : 0),
      paddingTop: () => 1.5,
      paddingBottom: () => 1.5,
    },
  };
}

export interface LinedHeadingOptions {
  /** What each layout printed between DELIVERY DATE and DELIVERY TERM. */
  transport: any[];
  /**
   * The TEMPLATE's box: an unclosed `<div>` put the shipping row inside the order-details box
   * (no rule between, a double line at the bottom), the delivery term keeps 20px under it, and
   * the shipping address sits 18px in.
   */
  template?: boolean;
}

export function linedHeading(s: PoSheet, logo: string | null, o: LinedHeadingOptions): any {
  const supplier = {
    width: LEFT,
    stack: [{ stack: [para(b(`To : ${jinja(s.supplierAddress)}`)), ...addressOrNone(s.addressDisplay).map((l) => para(b(l)))], margin: [3.75, 0, 0, 0] }],
  };
  const order = {
    width: RIGHT,
    stack: [
      ruled([barred(`PO NO : ${s.number}`), para(b(`PO DATE: ${dmy(s.transactionDate)}`))]),
      ruled([barred(`CURRENCY : ${s.currency}`), para(b(`DELIVERY DATE: ${dmy(s.scheduleDate)}`))]),
      ...o.transport,
      {
        stack: [para(b("DELIVERY TERM :")), bullets([jinja(s.tcName), { stack: termsNodes(s.terms) }])],
        margin: [1.5, 1.5, 1.5, 1.5 + (o.template ? 15 : 0)],
      },
    ],
  };
  const shipping = {
    stack: [
      para(b(`To : ${jinja(s.shippingAddress)}`)),
      ...addressOrNone(s.shippingAddressDisplay).map((l) => para(l)),
      para([b("PAYMENT TERMS:"), ` ${jinja(s.paymentTermsTemplate)}`]),
      ...(s.schedule.length ? [bullets(scheduleItems(s))] : []),
    ],
    margin: [o.template ? 4.5 : 3, 0, 0, 0],
  };
  return {
    table: {
      widths: ["*"],
      // The logo row is 55.5pt: the box's first rule fell 56.25pt below its top on every sheet.
      heights: (row: number) => (row === 0 ? 55.5 : "auto"),
      body: [[logoAndTitle(logo)], [{ columns: [supplier, order], columnGap: 0 }], [shipping]],
    },
    layout: {
      hLineWidth: (i: number) => (o.template ? [LINE, LINE, 0, 2 * LINE][i] : LINE),
      vLineWidth: () => LINE,
      hLineColor: black,
      vLineColor: black,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      // The shipping row started 2.25pt above the rule (the row's margin-top: -18px against the
      // floats); on the TEMPLATE, 13.5pt into the delivery term's 20px margin.
      paddingTop: (i: number) => (i === 2 ? (o.template ? -13.5 : -2.25) : 0),
      paddingBottom: () => 0,
    },
  };
}
