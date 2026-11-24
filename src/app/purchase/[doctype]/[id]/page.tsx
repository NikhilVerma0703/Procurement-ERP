import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocRecordPage } from "@/components/purchase/doc/DocPages";
import { docTitle } from "@/lib/purchase/doc/list-data";
import { screenBySegment } from "@/lib/purchase/doc/screens";

// One record of a Stock screen drawn from its definition (doc/screens.ts): the old form, editable for
// the masters of Items and Pricing, read-only for the transactions; its timeline below.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ doctype: string; id: string }> }): Promise<Metadata> {
  const { doctype, id } = await params;
  const s = screenBySegment(doctype);
  return { title: s ? (await docTitle(s, decodeURIComponent(id))) ?? s.doctype : "Not found" };
}

export default async function DocTypeRecordPage({ params }: { params: Promise<{ doctype: string; id: string }> }) {
  const { doctype, id } = await params;
  const s = screenBySegment(doctype);
  if (!s) notFound();
  return <DocRecordPage screen={s} id={decodeURIComponent(id)} />;
}
