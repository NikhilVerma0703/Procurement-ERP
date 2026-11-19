// The PO sheet layouts the replica prints, by the old site's Print Format
// name. "PDF PO" was the old site's default for POs and is listed first, the
// rest by name as the old print view listed them. Built: every layout the old
// site has reference PDFs for (captured 16-11-2026). Which of the eleven the
// team still prints is the owner's open question (plan §8.4); the other six
// ("Drop Shipping Format", "Future Lab PO", "Purchase Order", "Purchase Order
// Print", "tecnosint", "Test Future Lab PO") join this list if they are wanted.
// Pure.
import type { PoSheet } from "../sheet";
import type { Measure } from "./css-table";
import { importPoDocument, poPrintFormatDocument, purchaseOrder2025Document, purchaseOrderTemplateDocument } from "./lined";
import { pdfPoDocument } from "./pdf-po";

export interface SheetAssets {
  /** The logo as a data URL, or null when the file store has none. */
  logo: string | null;
  /** The sheet font's width of a text at the sheets' 6.75pt (bold or not), for sizing table columns. */
  measure: Measure;
}

export const PO_LAYOUTS = {
  "PDF PO": pdfPoDocument,
  "Import PO": importPoDocument,
  "PO print format": poPrintFormatDocument,
  "Purchase Order 2025": purchaseOrder2025Document,
  "PURCHASE ORDER TEMPLATE": purchaseOrderTemplateDocument,
} as const satisfies Record<string, (s: PoSheet, a: SheetAssets) => unknown>;

export type PoLayout = keyof typeof PO_LAYOUTS;

/** The old site's default Print Format for POs. */
export const DEFAULT_PO_LAYOUT: PoLayout = "PDF PO";

export const isPoLayout = (name: string | null | undefined): name is PoLayout =>
  Boolean(name) && Object.prototype.hasOwnProperty.call(PO_LAYOUTS, name as string);
