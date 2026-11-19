/* eslint-disable @typescript-eslint/no-explicit-any */
// "PDF PO" — the old site's default PO sheet (docs/reference/erpnext-setup/
// print_formats/PDF PO.html, last edited 04-04-2024), redrawn to the PDFs the
// old site produced (docs/reference/live-capture/pdfs/PDF PO/). Top to bottom:
//   * the heading box: the logo and PURCHASE ORDER; the supplier's address
//     (bold, in its own box) beside a grid of PO NO / PO DATE and CURRENCY /
//     DELIVERY DATE, "SHIPPING METHOD : BY ROAD" (fixed text) and DELIVERY
//     TERM (the Terms template's name, then the terms); the shipping address
//     beside PAYMENT TERMS (template, then each schedule row's term and
//     amount, as list items);
//   * the items, ten to a page, the heading box and column heads repeated:
//     SNO, PRODUCT CODE AND DESCRIPTION (the item code), HSN CODE, UOM, QTY,
//     RATE, DIS %, TAXABLE VALUES, CGST / SGST / IGST % and AMT, Total Amount;
//   * Cost Overheads and the tax rows, half width, when they have amounts;
//   * REMARKS (the status), DISCOUNT AMOUNT, Taxes and Charges Added, Total
//     Amount (the Grand Total), IN WORDS; the five notes; "Delivery Terms :
//     DAP"; the signature lines; the factory address.
// Everything sits on 10.5pt lines. Values print as the template printed them
// (pyfmt.ts): raw floats ("6.0"), ISO dates, "None" for an empty field, the
// rate with its currency symbol. The template's quirks are kept: TAXABLE
// VALUES is the amount minus the discount PERCENTAGE, the shipping method
// always says BY ROAD and the delivery terms always DAP. The browser cut the
// right end of "FOR PACIFIC … LIMITED" off at the page margin; it prints in
// full here. Pure.
import { jinja } from "../pyfmt";
import type { PoSheet } from "../sheet";
import {
  addressOrNone, b, box, bullets, FACTORY, factoryFooter, itemPages, LINE, logoAndTitle, lower, NOTES, pairTable, para, PITCH,
  scheduleItems, serviceRows, sheetDocument, taxRows, termsNodes, thenEmptyLines, totalLines, W, type Measure,
} from "./parts";

const black = () => "#000000";
/** From the box's inner edge to the right half (297.75pt on the page), and the right half's width. */
const LEFT = 254.25;
const RIGHT = 253.5;

function heading(s: PoSheet, logo: string | null): any {
  const supplier = box(
    { stack: [para(b(`To : ${jinja(s.supplierAddress)}`)), ...addressOrNone(s.addressDisplay).map((l) => para(b(l)))] },
    { border: [0, 0, LINE, LINE], padding: [3.75, 0, 0, 0] },
  );
  // `{{doc.tc_name}} {{doc.terms}}`: the terms follow the template's name on its line (as "None"
  // when the PO has none, or as loose text); their paragraphs start new lines.
  const terms = s.terms ?? [];
  const inline = s.terms === null ? " None" : terms[0] && !terms[0].paragraph ? ` ${terms[0].text}` : "";
  const blocks = terms[0] && !terms[0].paragraph ? terms.slice(1) : terms;
  const order = {
    width: RIGHT,
    stack: [
      {
        // The grid: two 50% columns of the old 262.5pt table, cut off by the page margin.
        table: {
          widths: [129, "*"],
          body: [
            [para(b(`PO NO : ${s.number}`)), para(b(`PO DATE: ${jinja(s.transactionDate)}`))],
            [para(b(`CURRENCY : ${s.currency}`)), para(b(`DELIVERY DATE: ${jinja(s.scheduleDate)}`))],
          ],
        },
        layout: {
          hLineWidth: (i: number) => (i === 0 ? 0 : LINE),
          vLineWidth: (i: number) => (i < 2 ? LINE : 0),
          hLineColor: black,
          vLineColor: black,
          paddingLeft: () => 0.75,
          paddingRight: () => 0.75,
          paddingTop: () => 0.75,
          paddingBottom: () => 0.75,
        },
      },
      para(b("SHIPPING METHOD : BY ROAD")),
      box(
        { stack: [para(b("DELIVERY TERM :")), para(`${jinja(s.tcName)}${inline}`), ...(blocks.length ? [lower({ stack: termsNodes(blocks) })] : [])] },
        { border: [0, LINE, 0, 0], padding: [1.5, 1.5, 1.5, 1.5] },
      ),
    ],
  };
  const shipping = box(
    { stack: [para(b(`To : ${jinja(s.shippingAddress)}`)), ...addressOrNone(s.shippingAddressDisplay).map((l) => para(l))] },
    { border: [0, 0, LINE, 0], padding: [3, 0, 0, 0] },
  );
  const payment = box(
    {
      stack: [
        para(b("PAYMENT TERMS:")),
        para(jinja(s.paymentTermsTemplate)),
        ...(s.schedule.length ? [bullets(scheduleItems(s))] : []),
      ],
    },
    // Its right border stops 0.75pt short of the box's, as on the old sheets.
    { border: [0, LINE, LINE, 0], padding: [1.5, 0, 0, 0], width: RIGHT - 0.75 - 1.5 - LINE },
  );
  return {
    table: {
      widths: ["*"],
      // The logo row is 57pt: the first rule fell 57.75pt below the box's top.
      heights: (row: number) => (row === 0 ? 57 : "auto"),
      body: [
        [logoAndTitle(logo)],
        [{ columns: [{ width: LEFT, stack: [supplier] }, order], columnGap: 0 }],
        [{ columns: [{ width: LEFT, stack: [shipping] }, { width: RIGHT, stack: [payment] }], columnGap: 0 }],
      ],
    },
    layout: {
      hLineWidth: (i: number) => (i === 2 ? 0 : LINE),
      vLineWidth: () => LINE,
      hLineColor: black,
      vLineColor: black,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      // The shipping row started 0.75pt above the end of the order details (2px of padding, then
      // the row's margin-top: -18px against the floats).
      paddingTop: (i: number) => (i === 2 ? -0.75 : 0),
      paddingBottom: () => 0,
    },
  };
}

function closing(s: PoSheet, measure: Measure): any[] {
  const out: any[] = [];
  // "49%" of the row it sat in, which was wider than the page's content: 260.25pt on the old sheets.
  const half = { width: 260.25, pitch: PITCH, measure, percents: true };
  const services = serviceRows(s);
  if (services) out.push(pairTable(["SERVICE ITEMS", "SERVICE CHARGES"], services, half));
  const taxes = taxRows(s);
  if (taxes) out.push(pairTable(["ACCOUNT HEAD", "Amount"], taxes, half));
  out.push({ stack: [...totalLines(s), ...NOTES].map((l) => para(l)), margin: [0, 1.5, 0, 0] });
  out.push(para(["Delivery Terms : ", b("DAP")]));
  // "FOR …" sits 10px up beside "Delivery Terms", right-aligned; the signature line four lines down.
  out.push(para(thenEmptyLines(b("FOR PACIFIC ENGINEERED SURFACE PRIVATE LIMITED"), 3), { alignment: "right", margin: [0, -7.5, 0, 0] }));
  out.push(para(b("AUTHORISED SIGNATORY"), { alignment: "right", margin: [0, 0, 40.3, 0] }));
  out.push(factoryFooter(FACTORY, 1.5, PITCH));
  return out;
}

/**
 * The pdfmake document of a PO in "PDF PO". `logo`: the logo as a data URL, or null when the file
 * is missing; `measure`: the font's text widths, for the tables' columns.
 */
export function pdfPoDocument(s: PoSheet, assets: { logo: string | null; measure: Measure }): any {
  return sheetDocument(
    s,
    [...itemPages(s, () => heading(s, assets.logo), assets.measure, { product: "itemCode" }), ...closing(s, assets.measure)],
    assets.logo,
  );
}

