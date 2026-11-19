/* eslint-disable @typescript-eslint/no-explicit-any */
// The four layouts with the lined heading box (lined-heading.ts), redrawn to
// the PDFs the old site produced (docs/reference/live-capture/pdfs/):
//
//   "Import PO" (last edited 29-05-2024): SHIPPING METHOD is the PO's mode of
//     transport; figures right-aligned; no "Delivery Terms : DAP"; the
//     signature block; the factory address; and "This is an electronically
//     generated report, hence does not require a signature".
//   "PO print format" (04-09-2025): MODE OF TRANSPORT, SHIPMENT TYPE and
//     PURPOSE; REQUESTED BY / PREPARED BY / APPROVED BY spaced down the page
//     (the factory address usually lands on a second page, as it did).
//   "Purchase Order 2025" (04-09-2025): Mode of Transport and Shipment Type;
//     the signature block.
//   "PURCHASE ORDER TEMPLATE" (05-09-2025): MODE OF TRANSPORT and PURPOSE, then
//     SHIPMENT TYPE; full-width tax rows; the totals, the notes (headed TERMS &
//     CONDITIONS) and REMARKS in a box; a three-box signature row; the factory
//     address with "LIMITED" spelled right.
//
// All print the item NAME where "PDF PO" printed the item code, dates as
// dd-mm-yyyy, and the same values otherwise (pyfmt.ts). After the items table
// they sit on 9pt lines, as the old sheets did. Pure.
import { jinja, pyStr } from "../pyfmt";
import type { PoSheet } from "../sheet";
import { linedHeading, paddedBarred, ruled, type LinedHeadingOptions } from "./lined-heading";
import {
  b, box, FACTORY, factoryFooter, itemPages, LINE, NOTES, pairTable, para, serviceRows, sheetDocument, space, taxRows,
  thenEmptyLines, TIGHT, totalLines, W, type ItemsOptions, type Measure,
} from "./parts";

type Assets = { logo: string | null; measure: Measure };

/** The items pages, then the closing part. */
function lined(s: PoSheet, assets: Assets, heading: LinedHeadingOptions, items: ItemsOptions, closing: any[]): any {
  return sheetDocument(s, [...itemPages(s, () => linedHeading(s, assets.logo, heading), assets.measure, items), ...closing], assets.logo);
}

/** Cost Overheads, then the tax rows, half width (stacked: their flex row did not lay out side by side). */
function halfTables(s: PoSheet, measure: Measure, o: { alignRight?: boolean } = {}): any[] {
  // "49%": 249pt on the old sheets.
  const half = { width: 249, pitch: TIGHT, measure, percents: true, alignRight: o.alignRight };
  const out: any[] = [];
  const services = serviceRows(s);
  if (services) out.push(pairTable(["SERVICE ITEMS", "SERVICE CHARGES"], services, half));
  const taxes = taxRows(s);
  if (taxes) out.push(pairTable(["ACCOUNT HEAD", "Amount"], taxes, half));
  return out;
}

/** REMARKS … IN WORDS and the five notes, 2px below the tables. */
const totalsAndNotes = (s: PoSheet) => ({ stack: [...totalLines(s), ...NOTES].map((l) => para(l, { pitch: TIGHT })), margin: [0, 1.5, 0, 0] });

/** "FOR PACIFIC …" (10px, at the left), four lines down "AUTHORISED SIGNATORY" centred. */
const signatureBlock = (): any[] => [
  para(thenEmptyLines(b("FOR PACIFIC ENGINEERED SURFACE PRIVATE LIMITED"), 3), { size: 7.5 }),
  para(b("AUTHORISED SIGNATORY"), { size: 7.5, alignment: "center", margin: [0, 2.25, 0, 2.25] }),
];

const factory = (texts: string[], top: number) => factoryFooter(texts, top, TIGHT);

export function importPoDocument(s: PoSheet, assets: Assets): any {
  return lined(
    s,
    assets,
    { transport: [ruled([para(b(`SHIPPING METHOD :${jinja(s.modeOfTransport)}`))])] },
    { product: "itemName", figuresRight: true },
    [
      ...halfTables(s, assets.measure, { alignRight: true }),
      totalsAndNotes(s),
      ...signatureBlock(),
      factory(FACTORY, 1.5),
      para("This is an electronically generated report, hence does not require a signature", { size: 9.75, alignment: "center", margin: [0, 2.25, 0, 0] }),
    ],
  );
}

export function poPrintFormatDocument(s: PoSheet, assets: Assets): any {
  // Three signature boxes, each four empty lines and then its title, 10px and centred.
  const sign = (label: string) => para([b(" "), "\n\n\n\n", b(label)], { size: 7.5, alignment: "center" });
  return lined(
    s,
    assets,
    {
      transport: [
        ruled([para(b(`MODE OF TRANSPORT: ${jinja(s.modeOfTransport)}`))]),
        para(b(`SHIPMENT TYPE: ${jinja(s.shipmentType)}`)),
        para(b(`PURPOSE: ${jinja(s.purposeOfPurchase)}`)),
      ],
    },
    { product: "itemName" },
    [
      ...halfTables(s, assets.measure),
      totalsAndNotes(s),
      space(37.5),
      sign("REQUESTED BY"),
      sign("PREPARED BY"),
      sign("APPROVED BY"),
      // A <br>, then 50px, then the address (which seldom fits on the page any more).
      para(" "),
      space(37.5),
      factory(FACTORY, 1.5),
    ],
  );
}

export function purchaseOrder2025Document(s: PoSheet, assets: Assets): any {
  return lined(
    s,
    assets,
    {
      transport: [
        ruled([para(b(`Mode of Transport: ${jinja(s.modeOfTransport)}`))]),
        para(b(`Shipment Type: ${jinja(s.shipmentType)}`)),
      ],
    },
    { product: "itemName" },
    [...halfTables(s, assets.measure), totalsAndNotes(s), ...signatureBlock(), factory(FACTORY, 1.5)],
  );
}

/** The TEMPLATE's notes say "TERMS & CONDITIONS MENTIONED". */
const TEMPLATE_NOTES = NOTES.map((n) => n.replace("AND TERMS CONDITIONS", "AND TERMS & CONDITIONS"));
/** The TEMPLATE's footer: "LIMITED" spelled right, the punctuation tidied. */
const TEMPLATE_FACTORY = [
  "PACIFIC ENGINEERED SURFACES PRIVATE LIMITED",
  "Factory: SY.NO73/2B, NALLANGANAKOTAPALLI, N.H.7, HOSUR Krishnagiri, Tamil Nadu, 635109, India.",
  "Email: pespl@thepacific.group; www.pacific.group; Tel: +91 8123514050; CIN: U51909TZ2020PCTC03915",
];

export function purchaseOrderTemplateDocument(s: PoSheet, assets: Assets): any {
  const { measure } = assets;
  const full = { width: W, pitch: TIGHT, measure };
  const tables: any[] = [];
  const services = serviceRows(s);
  if (services) tables.push(pairTable(["SERVICE ITEMS", "SERVICE CHARGES"], services, full));
  const taxes = taxRows(s);
  if (taxes) tables.push(pairTable(["ACCOUNT HEAD", "AMOUNT"], taxes, full));
  const tight = (text: any, margin?: [number, number, number, number]) => para(text, { pitch: TIGHT, margin });
  // The totals were two 48%-wide halves of a flex row (with 20px kept clear on the right), stacked.
  const halfWidth = (W - 2 * LINE - 2 * 4.5 - 15) * 0.48;
  const halfCol = (rows: any[]) => ({ columns: [{ width: halfWidth, stack: rows }, { width: "*", text: "" }] });
  const summary = box(
    {
      stack: [
        halfCol([tight([b("DISCOUNT AMOUNT: "), pyStr(s.discountAmount)]), tight([b("TAXES & CHARGES: "), pyStr(s.taxesAndChargesAdded)])]),
        halfCol([tight([b("TOTAL AMOUNT: "), pyStr(s.grandTotal)]), tight([b("IN WORDS: "), jinja(s.inWords)])]),
        { stack: [tight(b("TERMS & CONDITIONS:")), ...TEMPLATE_NOTES.map((n) => tight(n))], margin: [0, 7.5, 0, 0] },
        tight([b("REMARKS: "), s.status], [0, 6, 0, 0]),
      ],
    },
    { border: [LINE, LINE, LINE, LINE], padding: [4.5, 4.5, 4.5, 4.5], margin: [0, 7.5, 0, 0] },
  );
  // REQUESTED BY / PREPARED BY / APPROVED BY: three 80px boxes sized by their titles; the inner
  // borders were 0.25px and printed as hairlines.
  const titles = ["REQUESTED BY", "PREPARED BY", "APPROVED BY"];
  const widthsByTitle = titles.map((t) => measure(t, true));
  const total = widthsByTitle.reduce((a, x) => a + x, 0);
  const inner = W - 2 * LINE - 2 * 0.25 - 6 * 0.75; // less the borders and the cells' 1px padding
  const signatures = {
    table: {
      widths: widthsByTitle.map((x) => (inner * x) / total),
      heights: [60],
      body: [titles.map((t) => para(b(t), { size: 7.5, alignment: "center" }))],
    },
    layout: {
      hLineWidth: () => LINE,
      vLineWidth: (i: number) => (i === 0 || i === 3 ? LINE : 0.25),
      hLineColor: () => "#000000",
      vLineColor: () => "#000000",
      paddingLeft: () => 0.75,
      paddingRight: () => 0.75,
      paddingTop: () => 0.75,
      paddingBottom: () => 0.75,
    },
  };
  return lined(
    s,
    assets,
    {
      transport: [
        box({ stack: [paddedBarred(`MODE OF TRANSPORT: ${jinja(s.modeOfTransport)}`), para(b(`PURPOSE: ${jinja(s.purposeOfPurchase)}`), { margin: [1.5, 1.5, 1.5, 1.5] })] }, { border: [0, 0, 0, LINE] }),
        box(para(b(`SHIPMENT TYPE: ${jinja(s.shipmentType)}`)), { border: [0, 0, 0, LINE], margin: [0, 1.5, 0, 0] }),
      ],
      template: true,
    },
    { product: "itemName" },
    [
      ...tables,
      summary,
      signatures,
      para(thenEmptyLines(b("FOR PACIFIC ENGINEERED SURFACE PRIVATE LIMITED"), 3), { size: 7.5, alignment: "center", margin: [0, 15, 0, 0] }),
      para(b("AUTHORISED SIGNATORY"), { size: 7.5, alignment: "center", margin: [0, 2.25, 0, 2.25] }),
      factory(TEMPLATE_FACTORY, 3),
    ],
  );
}

