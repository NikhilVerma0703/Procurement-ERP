/* eslint-disable @typescript-eslint/no-explicit-any */
// What the PO sheet layouts share, drawn to the measurements of the PDFs the
// old site produced (docs/reference/live-capture/pdfs, captured 16-11-2026,
// measured from their drawing commands 18-11-2026). wkhtmltopdf drew one CSS
// pixel as 0.75pt, so:
//   * the page is A4 with 15 mm margins: the content is 509.25pt wide;
//   * text is 6.75pt (CSS xx-small) on a 10.5pt line, or a 9pt line in the
//     closing part of the 2024–2025 layouts; a 1px border is a 0.75pt line;
//   * the logo is drawn 153.7 x 40.5pt and PURCHASE ORDER 13.5pt bold, in the
//     same place on every layout;
//   * the items table's columns follow the HTML table's widths (css-table.ts),
//     ten items to a page, the heading box and column heads on every page.
// The browser put a line's baseline 7.5pt below the line's top; pdfmake puts
// it 6.37pt below. Every text block is lowered by the difference and gives it
// back underneath, so blocks keep their height and the text lands where the
// old sheets had it. The old sheets were set in Open Sans; these use Roboto,
// the Main ERP's PDF font (pdfmake's own), so lines are a little shorter.
// Pure.
import { jinja, pyFixed, pyStr } from "../pyfmt";
import { lines, type PoSheet, type SheetItem, type TermsBlock } from "../sheet";
import { cssTableWidths, maxWidth, minWidth, spreadPercent, wrapLines, type CssColumn, type Measure } from "./css-table";

export type { Measure };
export type Margin = [number, number, number, number];

/** A4 with 15 mm margins, as the old Print Format set them (the right edge rounded to wkhtmltopdf's). */
export const PAGE_MARGINS: Margin = [42.75, 42.75, 43.28, 42.64];
/** The content width. */
export const W = 509.25;
/** A 1px border. */
export const LINE = 0.75;
/** CSS xx-small. */
export const SIZE = 6.75;
/** The line pitch of the heading box, the tables and "PDF PO" (14px). */
export const PITCH = 10.5;
/** The line pitch after the items table on the 2024–2025 layouts (12px). */
export const TIGHT = 9;
export const GREY = "#eeeeee";
/** The column heads' "%" and "AMT": the old print style's grey. */
export const SUB = "#74808b";
/** A table cell's padding (1px). */
const CELL = 0.75;

/** Roboto's height (ascent + descent) per point of size: pdfmake's line at lineHeight 1. */
const ROBOTO_LINE = 1.171875;
/** pdfmake's lineHeight for a line `pitch` points high. */
export const lh = (pitch: number, size = SIZE) => pitch / (ROBOTO_LINE * size);
/** How far below a line's top the old sheets put the baseline, by font size (measured). */
const CSS_BASELINE: Record<string, number> = { "6.75": 7.5, "7.5": 8.25, "9.75": 8.25 };
/** How far to lower text so its baseline lands where the browser drew it. */
export const raise = (size = SIZE) => (CSS_BASELINE[String(size)] ?? 1.1 * size) - (0.9274 * size + 0.11);

const black = () => "#000000";

/** Lowers a block of text (or a stack holding only text) to the browser's baselines, keeping its height. */
export function lower(node: any, size = SIZE): any {
  const m: Margin = node.margin ?? [0, 0, 0, 0];
  const r = raise(size);
  return { ...node, margin: [m[0], m[1] + r, m[2], m[3] - r] };
}

/** A block of text on a line pitch, placed where the browser placed it. */
export function para(text: any, o: { pitch?: number; size?: number; margin?: Margin; [key: string]: unknown } = {}): any {
  const { pitch = PITCH, size = SIZE, margin = [0, 0, 0, 0], ...rest } = o;
  return lower({ text, fontSize: size, lineHeight: lh(pitch, size), margin, ...rest }, size);
}

/** Empty vertical space (an empty text would still take a line). */
export const space = (height: number) => ({ stack: [], margin: [0, height, 0, 0] });

/**
 * A line followed by `n` empty lines (`…<br><br><br><br>`). pdfmake ends a line at a newline but
 * starts the next one only when text follows, so the last empty line needs a space.
 */
export const thenEmptyLines = (line: any, n: number) => [line, `${"\n".repeat(n)} `];

/** Bold text inside a line. */
export const b = (text: string) => ({ text, bold: true });

/** A CSS box: a one-cell table with the given borders (left, top, right, bottom) and padding. */
export function box(content: any, o: { border?: Margin; padding?: Margin; width?: number | string; margin?: Margin } = {}): any {
  const [bl, bt, br, bb] = o.border ?? [0, 0, 0, 0];
  const [pl, pt, pr, pb] = o.padding ?? [0, 0, 0, 0];
  return {
    table: { widths: [o.width ?? "*"], body: [[content]] },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? bt : bb),
      vLineWidth: (i: number) => (i === 0 ? bl : br),
      hLineColor: black,
      vLineColor: black,
      paddingLeft: () => pl,
      paddingRight: () => pr,
      paddingTop: () => pt,
      paddingBottom: () => pb,
    },
    ...(o.margin ? { margin: o.margin } : {}),
  };
}

/** `<li>` items: a disc, the text 7.25pt in. The items are plain text; the list is lowered as a whole. */
export const bullets = (items: any[], margin: Margin = [0, 0, 0, 0]) => lower({ ul: items, margin });

/**
 * The logo and PURCHASE ORDER. Every layout drew them at the same spot at the top of its heading
 * box, and the box always starts a page, so they are placed on the page directly. The row is
 * given its height by the heading box. The logo is the document's "logo" image (sheetDocument),
 * stored once however many pages show it.
 */
export function logoAndTitle(logo: string | null): any {
  return {
    stack: [
      ...(logo ? [{ image: "logo", width: 153.7, height: 40.5, absolutePosition: { x: 52.5, y: 47.3 } }] : []),
      { text: "PURCHASE ORDER", bold: true, fontSize: 13.5, lineHeight: 1, absolutePosition: { x: 232.5, y: 65.25 - (0.9274 * 13.5 + 0.11) } },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Values as the templates printed them

/** `{{ doc.address_display }}`: the address lines, or "None" when there is no address. */
export const addressOrNone = (display: string | null) => (display === null ? ["None"] : lines(display));

/**
 * `{{ doc.terms }}` as plain text nodes (lower or list them): "None" when the PO has no terms,
 * else its blocks, each paragraph with its 3px margins (2.25pt; between two paragraphs they
 * collapse into one).
 */
export function termsNodes(terms: TermsBlock[] | null): any[] {
  if (terms === null) return [{ text: "None" }];
  const out = terms.map((t, i) => ({
    text: t.text === "" ? " " : t.text,
    margin: [0, t.paragraph && (i === 0 || !terms[i - 1].paragraph) ? 2.25 : 0, 0, t.paragraph ? 2.25 : 0],
  }));
  return out.length ? out : [{ text: "" }];
}

/** The payment schedule as the templates listed it: each row's term, then its amount. */
export const scheduleItems = (s: PoSheet) => s.schedule.flatMap((r) => [jinja(r.paymentTerm), pyStr(r.paymentAmount)]);

// ---------------------------------------------------------------------------------------------
// The items table

/** The column heads (first row; the tax heads span their % and AMT columns). */
const HEADS = ["SNO", "PRODUCT CODE AND DESCRIPTION", "HSN CODE", "UOM", "QTY", "RATE", "DIS %", "TAXABLE VALUES", "CGST", "", "SGST", "", "IGST", "", "Total Amount"];
const SUB_HEADS = ["", "", "", "", "", "", "", "", "%", "AMT", "%", "AMT", "%", "AMT", ""];
/** The heads' `width: N%` (the tax heads' 4% is shared by their two columns). */
const PERCENTS: (number | undefined)[] = [0.3, 8, 3, 4.5, 2, 4, 0.5, 2.5, undefined, undefined, undefined, undefined, undefined, undefined, 3];
/** The columns "Import PO" right-aligned (`<td align="right">`): every figure but DIS %. */
const RIGHT_ON_IMPORT = new Set([4, 5, 7, 8, 9, 10, 11, 12, 13, 14]);
/** A cell's padding and one border, which CSS widths include. */
const CELL_EXTRA = 2 * CELL + LINE;

export interface ItemsOptions {
  /** What the product column prints: the item code ("PDF PO") or the item name (the later layouts). */
  product: "itemCode" | "itemName";
  /** "Import PO" right-aligned the figures. */
  figuresRight?: boolean;
}

/** An item row's printed texts, column by column (TAXABLE VALUES is the amount minus the discount %, as printed). */
export const itemTexts = (r: SheetItem, product: ItemsOptions["product"]): string[] => [
  String(r.idx),
  product === "itemCode" ? r.itemCode : r.itemName,
  jinja(r.hsn),
  r.uom,
  pyStr(r.qty),
  r.rateShown,
  pyStr(r.discountPercentage),
  pyStr(r.amount - r.discountPercentage),
  pyStr(r.cgst),
  pyStr(r.cgstAmt),
  pyStr(r.sgst),
  pyStr(r.sgstAmt),
  pyStr(r.igst),
  pyStr(r.igstAmt),
  pyFixed(r.amount + r.cgstAmt + r.sgstAmt + r.igstAmt, 2),
];

/** The items table's column widths for these rows, as the browser shared out the table (content widths). */
export function itemWidths(rows: string[][], measure: Measure): number[] {
  const cols: CssColumn[] = HEADS.map((head, i) => {
    const cells = rows.map((r) => r[i]);
    const spanHead = i >= 8 && i <= 13; // the tax heads count over both their columns, not one
    const min = Math.max(spanHead ? 0 : minWidth(head, measure, true), minWidth(SUB_HEADS[i], measure), ...cells.map((t) => minWidth(t, measure, i === 0)));
    const max = Math.max(spanHead ? 0 : maxWidth(head, measure, true), maxWidth(SUB_HEADS[i], measure), ...cells.map((t) => maxWidth(t, measure, i === 0)));
    return { min: min + CELL_EXTRA, max: max + CELL_EXTRA, percent: PERCENTS[i] };
  });
  for (const from of [8, 10, 12]) spreadPercent(cols, from, 2, 4);
  return cssTableWidths(cols, W - LINE).map((w) => w - CELL_EXTRA);
}

/** 1px borders and 1px cell padding, with the text lowered to the browser's baseline. */
function cellLayout(): any {
  const r = raise();
  return {
    hLineWidth: () => LINE,
    vLineWidth: () => LINE,
    hLineColor: black,
    vLineColor: black,
    paddingLeft: () => CELL,
    paddingRight: () => CELL,
    paddingTop: () => CELL + r,
    paddingBottom: () => CELL - r,
  };
}

/** A cell's text wrapped as the browser wrapped it, one unbreakable line per row of text. */
function cellText(text: string, width: number, measure: Measure, o: { bold?: boolean; align?: string; pitch?: number } = {}): any {
  const ls = wrapLines(text, width, measure, o.bold);
  return {
    stack: ls.map((l) => ({ text: l === "" ? " " : l, noWrap: true })),
    ...(o.bold ? { bold: true } : {}),
    ...(o.align ? { alignment: o.align } : {}),
    lineHeight: lh(o.pitch ?? PITCH),
  };
}

/** One page's items table: the two heading rows, then the rows. */
export function itemsTable(rows: SheetItem[], widths: number[], measure: Measure, o: ItemsOptions): any {
  const th = (i: number, extra: Record<string, unknown> = {}) => ({ ...cellText(HEADS[i], widths[i] + (extra.colSpan ? widths[i + 1] + CELL_EXTRA : 0), measure, { bold: true }), fillColor: GREY, ...extra });
  const head1 = HEADS.map((_, i) => {
    if (i === 9 || i === 11 || i === 13) return {};
    if (i === 8 || i === 10 || i === 12) return th(i, { colSpan: 2 });
    return th(i, { rowSpan: 2 });
  });
  const head2 = SUB_HEADS.map((t) => (t ? { text: t, color: SUB, noWrap: true } : {}));
  const body = rows.map((r) =>
    itemTexts(r, o.product).map((t, i) =>
      cellText(t, widths[i], measure, { bold: i === 0, align: o.figuresRight && RIGHT_ON_IMPORT.has(i) ? "right" : undefined }),
    ),
  );
  return { table: { headerRows: 2, dontBreakRows: true, widths, body: [head1, head2, ...body] }, layout: cellLayout() };
}

/** The rows in pages of ten, as the templates broke them (at least one page, for a PO without items). */
export function tenPerPage<T>(rows: T[]): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += 10) pages.push(rows.slice(i, i + 10));
  return pages.length ? pages : [[]];
}

/** Every page: the heading box, then that page's items; the heading box starts each page after the first. */
export function itemPages(s: PoSheet, heading: () => any, measure: Measure, o: ItemsOptions): any[] {
  const widths = itemWidths(s.items.map((r) => itemTexts(r, o.product)), measure);
  // The table started 3pt above the end of the box on every old sheet (its margin-top: -59px
  // against the two <br>s before it); its grey heading row covers the box's bottom line.
  return tenPerPage(s.items).flatMap((rows, i) => [
    { ...heading(), ...(i > 0 ? { pageBreak: "before" } : {}) },
    { ...itemsTable(rows, widths, measure, o), margin: [0, -3, 0, 0] },
  ]);
}

// ---------------------------------------------------------------------------------------------
// After the items

/**
 * A two-column table (the tax rows, the Cost Overheads) `width` points wide. With `percents`
 * (the half-width tables' `width: 4%` heads) the columns share the width equally beyond their
 * minimum; without, by their content (the TEMPLATE's full-width tables).
 */
export function pairTable(head: [string, string], rows: [string, string][], o: { width: number; pitch: number; measure: Measure; percents?: boolean; alignRight?: boolean }): any {
  const cols: CssColumn[] = [0, 1].map((i) => {
    const texts = rows.map((r) => r[i]);
    return {
      min: Math.max(minWidth(head[i], o.measure, true), ...texts.map((t) => minWidth(t, o.measure))) + CELL_EXTRA,
      max: Math.max(maxWidth(head[i], o.measure, true), ...texts.map((t) => maxWidth(t, o.measure))) + CELL_EXTRA,
      percent: o.percents ? 4 : undefined,
    };
  });
  const widths = cssTableWidths(cols, o.width - LINE).map((w) => w - CELL_EXTRA);
  const th = (i: number) => ({ ...cellText(head[i], widths[i], o.measure, { bold: true, pitch: o.pitch }), fillColor: GREY });
  // "Import PO" right-aligned the rows' cells (`<td align="right">`), not the heads.
  const td = (t: string, i: number) => cellText(t, widths[i], o.measure, { pitch: o.pitch, align: o.alignRight ? "right" : undefined });
  return {
    table: { widths, body: [[th(0), th(1)], ...rows.map((r) => [td(r[0], 0), td(r[1], 1)])] },
    layout: cellLayout(),
  };
}

/** The Cost Overheads rows that print: those with a charge, when the charges add up to more than nothing. */
export function serviceRows(s: PoSheet): [string, string][] | null {
  const rows = s.services.filter((r) => r.chargesText !== null);
  if (!rows.length || rows.reduce((t, r) => t + (Number(r.chargesText) || 0), 0) <= 0) return null;
  return rows.map((r) => [jinja(r.serviceItem), r.chargesText ?? ""]);
}

/** The tax rows that print: those with an amount, when the amounts add up to more than nothing. */
export function taxRows(s: PoSheet): [string, string][] | null {
  const rows = s.taxes.filter((t) => t.taxAmount !== 0);
  if (!rows.length || rows.reduce((t, r) => t + r.taxAmount, 0) <= 0) return null;
  return rows.map((t) => [t.accountHead, pyStr(t.taxAmount)]);
}

/** REMARKS (the status), DISCOUNT AMOUNT, Taxes and Charges Added, Total Amount (the Grand Total), IN WORDS. */
export const totalLines = (s: PoSheet): any[][] => [
  [b("REMARKS : "), s.status],
  [b("DISCOUNT AMOUNT : "), pyStr(s.discountAmount)],
  [b("Taxes and Charges Added : "), pyStr(s.taxesAndChargesAdded)],
  [b("Total Amount : "), pyStr(s.grandTotal)],
  [b("IN WORDS : "), jinja(s.inWords)],
];

/** The five notes every layout printed. */
export const NOTES = [
  "1. PLEASE REFER TO ANNEXURE FOR TERMS AND CONDITIONS OF THIS PURCHASE ORDER.",
  "2. PLEASE EXECUTE THIS ORDER IN ACCORDANCE WITH THE PRICES, TERMS, DELIVERY METHOD, AND SPECIFICATIONS LISTED ABOVE AND TERMS CONDITIONS MENTIONED HEREIN BELOW AS ANNEXURE.",
  "3. PLEASE NOTIFY US IMMEDIATELY IF YOU ARE UNABLE TO SHIP AS SPECIFIED.",
  "4. PLEASE ARRANGE TO SEND COPY OF MSDS/COA ALONG WITH EVERY CONSIGNMENT (IF APPLICABLE).",
  "5. PLEASE ENSURE TO SEND INVOICE ALONG WITH DISPATCH OF MATERIALS.",
];

/** The factory footer, typo ("lIMITED") and spacing as the layouts printed it until September 2025. */
export const FACTORY = [
  "PACIFIC ENGINEERED SURFACES PRIVATE lIMITED",
  "Factory : SY.NO73/2B .NALLANGANAKOTAPALLI, N.H.7,HOSUR krishnagiri , Tamil Nadu , 635109 , India.",
  "Email:pespl@thepacific.group;www.pacific.group;Tel: +91 8123514050,CIN : U51909TZ2020PCTC03915",
];

/**
 * The factory address, centred and kept together. The space above it is the old div's padding,
 * so it stays above the address when the address moves to a new page.
 */
export const factoryFooter = (texts: string[], top: number, pitch: number) => ({
  stack: texts.map((l, i) => para(l, { pitch, margin: [0, i === 0 ? top : 0, 0, 0] })),
  alignment: "center",
  unbreakable: true,
});

/** The pdfmake document: A4, the sheet's margins, Roboto at the sheets' size and pitch, the logo. */
export function sheetDocument(s: PoSheet, content: any[], logo: string | null): any {
  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    info: { title: s.number, subject: "Purchase Order" },
    content,
    defaultStyle: { font: "Roboto", fontSize: SIZE, lineHeight: lh(PITCH) },
    ...(logo ? { images: { logo } } : {}),
  };
}
