// GET /api/purchase/doc-print/<list segment>/<id>?format=Standard: a Stock record printed in Frappe's
// Standard format, as a page (lib/purchase/print/doc-print.ts) — what the print view shows in its frame
// and prints. Its values are printed unescaped, as Frappe printed them, so the page may run no script and
// load nothing from elsewhere (its images are inline).
import { type NextRequest } from "next/server";
import { screenBySegment } from "@/lib/purchase/doc/screens";
import { refusalPage } from "@/lib/purchase/pdf/refusal";
import { docPrint } from "@/lib/purchase/print/doc-print";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ doctype: string; id: string }> }) {
  const { doctype, id } = await params;
  const s = screenBySegment(doctype);
  if (!s) return refusalPage(404, "Not Found", "Page not found");
  const g = await purchaseGate(s.gate ?? "stock");
  if (!g.ok) return refusalPage(g.status, "Not Permitted", purchaseRefusal(g));
  const q = req.nextUrl.searchParams;
  const p = await docPrint(s, decodeURIComponent(id), {
    localImages: q.get("check") !== "1",
    letterhead: q.get("letterhead") ?? "Logo",
    compactItemPrint: q.get("compact_item_print") === "1",
    printUomAfterQuantity: q.get("print_uom_after_quantity") === "1",
    printTaxesWithZeroAmount: q.get("print_taxes_with_zero_amount") === "1",
  });
  if (!p.ok) return refusalPage(p.status, p.title, p.error);
  return new Response(p.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
