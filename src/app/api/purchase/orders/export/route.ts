// GET  /api/purchase/orders/export?<the list's address-bar state> → the filtered list as .xlsx.
// POST /api/purchase/orders/export?<the list's state>, form field `ids` (a JSON list of PO ids) → only
//      those POs, in the list's order: the selected rows' Actions → Export (Frappe exported "name in"
//      the selection). A form post, because a selection can be thousands of ids.
// purchaseGate("view") first: middleware is the coarse door, this is the route's own check.
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { buildOrdersWorkbook } from "@/lib/purchase/orders/export";
import { parseListQuery } from "@/lib/purchase/orders/list";
import { parseSelectedIds } from "@/lib/purchase/orders/selection";

export const dynamic = "force-dynamic";
// As the Main ERP's export routes. The whole list (3,217 POs, 8,765 lines) took about 4 s and 0.85 MB.
export const maxDuration = 60;

async function workbook(request: Request, ids?: string[]) {
  try {
    const { buffer, filename } = await buildOrdersWorkbook(parseListQuery(new URL(request.url).searchParams), ids);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("purchase order export failed", err);
    return new Response("The export could not be created.", { status: 500 });
  }
}

export async function GET(request: Request) {
  const gate = await purchaseGate("view");
  if (!gate.ok) return new Response(purchaseRefusal(gate), { status: gate.status });
  return workbook(request);
}

export async function POST(request: Request) {
  const gate = await purchaseGate("view");
  if (!gate.ok) return new Response(purchaseRefusal(gate), { status: gate.status });
  const form = await request.formData().catch(() => null);
  const ids = parseSelectedIds(form?.get("ids"));
  if (!ids.length) return new Response("Select at least one Purchase Order.", { status: 400 });
  return workbook(request, ids);
}
