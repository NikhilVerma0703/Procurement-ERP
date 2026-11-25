// The ⋯ menu's Export of a Stock screen's list (owner, 24-11-2026): every record the list's filters
// keep, in its order, with the ID, the title, the status and all its "in list view" columns, as a
// CSV file Excel opens (the old site's Export gave the list as a spreadsheet). GET
// /api/purchase/doc-export/<screen>?<the list's address>.
import { NextResponse, type NextRequest } from "next/server";
import { currencyOfField, listDocs } from "@/lib/purchase/doc/list-data";
import { docIndicator, isValueField, parseDocListQuery } from "@/lib/purchase/doc/list-view";
import { DOC_SCREENS, GATE_ENTRY_SCREEN, layoutOf, MASTER_SCREENS } from "@/lib/purchase/doc/screens";
import { displayValue } from "@/lib/purchase/doc/values";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

function cell(v: string): string {
  let t = v;
  // A value Excel would run as a formula is kept as text.
  if (/^[=+@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Every list drawn as the old list view: the Stock screens, Gate Entry and the Buying masters. */
const SCREENS = [...DOC_SCREENS, GATE_ENTRY_SCREEN, ...MASTER_SCREENS];

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const s = SCREENS.find((x) => x.key === key);
  // Gated as its list is (a Buying master: anyone signed in; the rest: Stock).
  const g = await purchaseGate(s?.gate ?? "stock");
  if (!g.ok) return NextResponse.json({ error: purchaseRefusal(g) }, { status: g.status });
  if (!s) return NextResponse.json({ error: "Unknown list" }, { status: 404 });
  const l = layoutOf(s);
  const q = parseDocListQuery(l, req.nextUrl.searchParams, { sort: s.sort.field, order: s.sort.order });
  const { rows } = await listDocs(s, { ...q, limit: MAX_ROWS, exact: true });
  const title = l.titleField ? l.fields.find((f) => f.fieldname === l.titleField) : undefined;
  const fields = l.fields.filter((f) => isValueField(f) && f.inListView && f.fieldname !== l.titleField);
  const head = ["ID", ...(title ? [title.label ?? title.fieldname] : []), "Status", ...fields.map((f) => f.label ?? f.fieldname)];
  const body = rows.map(({ doc }) => [
    String(doc.name ?? ""),
    ...(title ? [String(doc[title.fieldname] ?? "")] : []),
    docIndicator(l, doc)?.label ?? "",
    ...fields.map((f) => displayValue(f, doc[f.fieldname], currencyOfField(f, doc, "INR"))),
  ]);
  const csv = "﻿" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${s.doctype.replace(/[^\w -]/g, "")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
