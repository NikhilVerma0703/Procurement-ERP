import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintScreen } from "@/components/purchase/print/PrintScreen";
import { docNames, docTitle } from "@/lib/purchase/doc/list-data";
import { screenBySegment } from "@/lib/purchase/doc/screens";
import { DOC_FORMAT_NAMES } from "@/lib/purchase/print/doc-print";
import { PURCHASE_API_ROOT } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ doctype: string; id: string }> }): Promise<Metadata> {
  const { doctype, id } = await params;
  const s = screenBySegment(doctype);
  return { title: s ? `${(await docTitle(s, decodeURIComponent(id))) ?? s.doctype} · Print` : "Print" };
}

// A Stock record's print view, as the old form's printer icon opened it (components/purchase/print/
// PrintScreen): Frappe's Standard format, the only one these DocTypes had on the old site.
export default async function DocPrintPage({ params }: { params: Promise<{ doctype: string; id: string }> }) {
  const { doctype, id: raw } = await params;
  const s = screenBySegment(doctype);
  if (!s) notFound();
  await purchasePageGate(s.gate ?? "stock");
  const id = decodeURIComponent(raw);
  const name = (await docNames(s, [id])).get(id) ?? null;
  if (name === null) notFound();
  return (
    <PrintScreen
      pageBase={`${PURCHASE_API_ROOT}/doc-print/${doctype}/${encodeURIComponent(id)}`}
      formats={DOC_FORMAT_NAMES}
      initial="Standard"
      formHref={`${s.path}/${encodeURIComponent(id)}`}
      crumbs={[s.card === "Buying" ? "Buying" : "Stock", s.doctype, name]}
      title={name}
    />
  );
}
