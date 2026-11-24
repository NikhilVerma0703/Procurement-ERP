import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocListPage } from "@/components/purchase/doc/DocPages";
import { screenBySegment } from "@/lib/purchase/doc/screens";

// The list of a Stock screen drawn from its definition (owner, 24-11-2026: "make all these
// remainings"): Product Bundle, Price List, Item Price, Shipping Rule, Pricing Rule, Item Alternative,
// Item Manufacturer, Customs Tariff Number, Material Request, Stock Entry, Delivery Note, Pick List,
// Delivery Trip (doc/screens.ts). The module's own pages (orders, receipts, gate-entries…) are static
// segments and come first; any other segment is not found.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ doctype: string }> }): Promise<Metadata> {
  const s = screenBySegment((await params).doctype);
  return { title: s?.doctype ?? "Not found" };
}

export default async function DocTypeListPage({ params, searchParams }: { params: Promise<{ doctype: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = screenBySegment((await params).doctype);
  if (!s) notFound();
  return <DocListPage screen={s} searchParams={await searchParams} />;
}
