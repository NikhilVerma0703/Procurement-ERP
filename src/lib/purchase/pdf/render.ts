/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
// Turns a stored PO into its PDF sheet, server-side with pdfmake — the Main
// ERP's commercial-document pattern (lib/sales/pdf/common.ts: one printer,
// Roboto from pdfmake's own fonts, buildPdf). Server only.
//
// As on the old site (Print Settings): drafts print, cancelled POs do not
// ("Not allowed to print cancelled documents"). The sheet prints the stored
// figures; nothing is recomputed. The layouts carry their own logo: the
// add-on's copy of the image the "Logo" letter head points at
// (/files/pacific_logo.png, 1151 x 308); the captured PDFs show no separate
// letter head above it.
import "server-only";
import { orderRecord } from "../orders/load";
import { readStoredFile } from "../server/files";
import { PO_LAYOUTS, type PoLayout } from "./layouts/index";
import { pdfFileName, poSheet } from "./sheet";

const PdfPrinter = require("pdfmake");
const vfs = require("pdfmake/build/vfs_fonts");
// pdfmake's own font engine (via its pdfkit), to measure text the way it will be drawn.
const fontkit = require("@foliojs-fork/fontkit");

const ROBOTO = {
  normal: Buffer.from(vfs["Roboto-Regular.ttf"], "base64"),
  bold: Buffer.from(vfs["Roboto-Medium.ttf"], "base64"),
  italics: Buffer.from(vfs["Roboto-Italic.ttf"], "base64"),
  bolditalics: Buffer.from(vfs["Roboto-MediumItalic.ttf"], "base64"),
};
const printer = new PdfPrinter({ Roboto: ROBOTO });

const metrics = { normal: fontkit.create(ROBOTO.normal), bold: fontkit.create(ROBOTO.bold) };
/** A text's width in points at `size`, in the sheets' font. */
export function measureText(text: string, size: number, bold = false): number {
  const font = bold ? metrics.bold : metrics.normal;
  return (font.layout(text).advanceWidth / font.unitsPerEm) * size;
}

export function buildPdf(docDef: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = printer.createPdfKitDocument(docDef);
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/** The sheets' body text size (CSS xx-small, as the old wkhtmltopdf sheets printed it). */
const SHEET_FONT_SIZE = 6.75;

/** The logo the PO sheets print. */
export const SHEET_LOGO_URL = "/files/pacific_logo.png";

export { pdfFileName };

export type PdfResult = { ok: true; pdf: Buffer; filename: string } | { ok: false; status: number; title: string; error: string };

export async function renderOrderPdf(id: string, layout: PoLayout): Promise<PdfResult> {
  const o = await orderRecord(id);
  if (!o) return { ok: false, status: 404, title: "Not Found", error: "Purchase Order not found" };
  if (o.docStatus === "CANCELLED") return { ok: false, status: 403, title: "Not Permitted", error: "Not allowed to print cancelled documents" };
  const logo = await readStoredFile(SHEET_LOGO_URL);
  const doc = PO_LAYOUTS[layout](poSheet(o), {
    logo: logo ? `data:image/png;base64,${logo.toString("base64")}` : null,
    measure: (text, bold) => measureText(text, SHEET_FONT_SIZE, bold),
  });
  return { ok: true, pdf: await buildPdf(doc), filename: pdfFileName(o.number) };
}
