import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocNewPage } from "@/components/purchase/doc/DocPages";
import { screenBySegment } from "@/lib/purchase/doc/screens";

// A new record of a master of Stock › Items and Pricing (doc/screens.ts), with the values the page
// was opened with (Frappe's route options).

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ doctype: string }> }): Promise<Metadata> {
  const s = screenBySegment((await params).doctype);
  return { title: s ? `New ${s.doctype}` : "Not found" };
}

export default async function DocTypeNewPage({ params, searchParams }: { params: Promise<{ doctype: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = screenBySegment((await params).doctype);
  if (!s) notFound();
  return <DocNewPage screen={s} searchParams={await searchParams} />;
}
