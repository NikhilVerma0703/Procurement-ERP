// The search box's "Search for <text>" (the old site's global search):
// GET /api/purchase/search?q=<text>[&doctype=<DocType>&start=<n>&limit=<n>]
// Answers { results: [{ doctype, name, content, href }] } for the DocTypes this login may open
// (lib/purchase/search/global.ts).
import { NextResponse, type NextRequest } from "next/server";
import { globalSearch } from "@/lib/purchase/search/global";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await purchaseGate("view");
  if (!g.ok) return NextResponse.json({ error: purchaseRefusal(g) }, { status: g.status });
  const sp = req.nextUrl.searchParams;
  const results = await globalSearch(g.user, sp.get("q") ?? "", {
    doctype: sp.get("doctype"),
    start: Number(sp.get("start")) || 0,
    limit: Number(sp.get("limit")) || undefined,
  });
  return NextResponse.json({ results });
}
