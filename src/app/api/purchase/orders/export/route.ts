// GET /api/purchase/orders/export?<the list's address-bar state> → the filtered list as .xlsx.
// purchaseGate("view") first: middleware is the coarse door, this is the route's own check.
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { buildOrdersWorkbook } from "@/lib/purchase/orders/export";
import { parseListQuery } from "@/lib/purchase/orders/list";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await purchaseGate("view");
  if (!gate.ok) return new Response(purchaseRefusal(gate), { status: gate.status });
  try {
    const { buffer, filename } = await buildOrdersWorkbook(parseListQuery(new URL(request.url).searchParams));
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
