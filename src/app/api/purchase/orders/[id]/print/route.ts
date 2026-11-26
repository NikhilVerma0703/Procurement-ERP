// GET /api/purchase/orders/<id>/print?format=<Print Format>: the PO printed in one of the old site's print
// formats, as a page (lib/purchase/print/po-print.ts) — what the print view shows in its frame and prints.
// The values printed are the PO's own, unescaped as Frappe printed them, so the page may run no script and
// load nothing from elsewhere (its images are inline).
import { type NextRequest } from "next/server";
import { refusalPage } from "@/lib/purchase/pdf/refusal";
import { orderPrint } from "@/lib/purchase/print/po-print";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await purchaseGate("view");
  if (!g.ok) return refusalPage(g.status, "Not Permitted", purchaseRefusal(g));
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const p = await orderPrint(id, q.get("format"), {
    // ?check=1: the printed text itself, images not inlined (to compare it with the old site's).
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
