// A Stock record printed as the old print view printed it (owner, 26-11-2026: "The Print icon and printing
// options are also completely missing"). The old site had no print format of its own for Material Request,
// Stock Entry or the masters of Stock (read 26-11-2026: Print Format by doc_type), so each printed in
// Frappe's Standard format alone, drawn from the record's layout (standard-print.ts). Gate Entry had one
// format of its own as well; Purchase Receipts and POs print through their own modules. Server only.
import "server-only";
import { loadDoc } from "../doc/list-data";
import { layoutOf, type DocScreen } from "../doc/screens";
import { printPage, type PrintViewOptions } from "./receipt-print";
import { LETTER_HEAD_LOGO, renderStandardPrint } from "./standard-print";
import { printSystem, recordOf } from "./standard-print-data";

export const DOC_FORMAT_NAMES: readonly string[] = ["Standard"];

export type DocPrint =
  | { ok: true; name: string; format: string; html: string }
  | { ok: false; status: number; title: string; error: string };

export async function docPrint(s: DocScreen, id: string, opts: PrintViewOptions = {}): Promise<DocPrint> {
  const loaded = await loadDoc(s, id);
  if (!loaded) return { ok: false, status: 404, title: "Not Found", error: `${s.doctype} not found` };
  // Print Settings on the old site: drafts printed (with "Draft" over them), cancelled documents did not.
  if (Number(loaded.doc.docstatus) === 2) return { ok: false, status: 403, title: "Not Permitted", error: "Not allowed to print cancelled documents" };
  const tables = layoutOf(s).fields.filter((f) => f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect").map((f) => f.fieldname);
  const record = recordOf(s.doctype, { ...loaded.doc, name: loaded.name }, tables);
  const body = renderStandardPrint(record, await printSystem(), {
    letterHead: opts.letterhead === "" ? null : LETTER_HEAD_LOGO,
    compactItemPrint: opts.compactItemPrint,
    printUomAfterQuantity: opts.printUomAfterQuantity,
    printTaxesWithZeroAmount: opts.printTaxesWithZeroAmount,
  });
  const html = await printPage(`${s.doctype} ${loaded.name} - Standard`, "", body, opts);
  return { ok: true, name: loaded.name, format: "Standard", html };
}
