// A PO's sheet as a PDF: GET /api/purchase/orders/<id>/pdf?format=PDF%20PO[&download=1]
//
// The Main ERP's document route (api/sales/pi/[id]/pdf): the module gate, then
// the PDF inline for the browser's viewer, or as a file with download=1. The
// layout defaults to the old site's default ("PDF PO"). A cancelled PO is
// refused with the old site's message.
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_PO_LAYOUT, isPoLayout } from "@/lib/purchase/pdf/layouts/index";
import { refusalPage as refusal } from "@/lib/purchase/pdf/refusal";
import { renderOrderPdf } from "@/lib/purchase/pdf/render";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await purchaseGate("view");
  if (!gate.ok) return refusal(gate.status, gate.status === 401 ? "Not Signed In" : "Not Permitted", purchaseRefusal(gate));
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") ?? DEFAULT_PO_LAYOUT;
  if (!isPoLayout(format)) return refusal(400, "Not Found", `Print Format ${format} not found`);
  const r = await renderOrderPdf(id, format);
  if (!r.ok) return refusal(r.status, r.title, r.error);
  return new NextResponse(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${sp.get("download") === "1" ? "attachment" : "inline"}; filename="${r.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
