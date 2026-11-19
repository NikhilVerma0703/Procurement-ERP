// The selected rows' Actions → Print: POST /api/purchase/orders/print with form fields `ids` (a JSON
// list of PO ids, in the list's order) and `format` (the Print Format) → one PDF, every PO's sheet one
// after another, saved as "Purchase-Order.pdf" (Frappe's download_multi_pdf, which joined each
// document's own PDF the same way). The module gate first; a cancelled PO refuses the whole print,
// with the old site's message, as the list refused it before printing. Each sheet is the same PDF the
// PO's own print view makes (lib/purchase/pdf/render.ts); pdf-lib joins them (the Main ERP's library).
// On Vercel the answer must stay under about 4.5 MB: at most MAX_PRINT_SHEETS sheets a file
// (lib/purchase/orders/selection.ts), and a file that still comes out larger is refused.
import { PDFDocument } from "pdf-lib";
import { DEFAULT_PO_LAYOUT, isPoLayout } from "@/lib/purchase/pdf/layouts/index";
import { refusalPage } from "@/lib/purchase/pdf/refusal";
import { renderOrderPdf } from "@/lib/purchase/pdf/render";
import { MAX_PRINT_BYTES, MAX_PRINT_SHEETS, parseSelectedIds, TOO_MANY_TO_PRINT } from "@/lib/purchase/orders/selection";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// As the Main ERP's export routes: up to 40 sheets at about 65 ms each, with room to spare.
export const maxDuration = 60;

export async function POST(request: Request) {
  const gate = await purchaseGate("view");
  if (!gate.ok) return refusalPage(gate.status, gate.status === 401 ? "Not Signed In" : "Not Permitted", purchaseRefusal(gate));
  const form = await request.formData().catch(() => null);
  const ids = parseSelectedIds(form?.get("ids"));
  const format = String(form?.get("format") || DEFAULT_PO_LAYOUT);
  if (!isPoLayout(format)) return refusalPage(400, "Not Found", `Print Format ${format} not found`);
  if (!ids.length) return refusalPage(400, "Message", "Select atleast 1 record for printing");
  if (ids.length > MAX_PRINT_SHEETS) return refusalPage(400, "Message", TOO_MANY_TO_PRINT);

  const merged = await PDFDocument.create();
  for (const id of ids) {
    const r = await renderOrderPdf(id, format);
    if (!r.ok) return refusalPage(r.status, r.title, r.error);
    const sheet = await PDFDocument.load(r.pdf);
    for (const page of await merged.copyPages(sheet, sheet.getPageIndices())) merged.addPage(page);
  }
  const bytes = await merged.save();
  if (bytes.length > MAX_PRINT_BYTES) {
    return refusalPage(413, "Message", `These ${ids.length} sheets make a file too large to send at once (${(bytes.length / 1e6).toFixed(1)} MB). Print fewer at a time.`);
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Purchase-Order.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
