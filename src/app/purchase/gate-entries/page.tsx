import type { Metadata } from "next";
import { DocListPage } from "@/components/purchase/doc/DocPages";
import { GATE_ENTRY_SCREEN } from "@/lib/purchase/doc/screens";

// The Gate Entry List (owner, 23-11-2026: "From the search box we search Gate Entry List — this is
// Thiru R's part"), drawn as the old list view (owner, 24-11-2026: "in original website it is
// looking different … some extra columns and icons"): ☐ ♥ ID, Status, Po No, Inward No, Supplier,
// Inward Date — the old list showed 4 columns in a window up to 1366 px, 6 below 1920 px and all of
// them from 1920 px (doc/list-view.ts) —, the empty "assigned to" (-), when each changed and its
// comments; the ID filter, Filter, the sort (Created On, newest first: Thiru R's setting); "20 of
// 1,000+" (a click: the exact count); 20 / 100 / 500 / 2500 and Load More; "+ Add Gate Entry".
// Every gate entry of the old site is here.

export const metadata: Metadata = { title: "Gate Entry" };
export const dynamic = "force-dynamic";

export default async function GateEntryListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DocListPage screen={GATE_ENTRY_SCREEN} searchParams={await searchParams} />;
}
