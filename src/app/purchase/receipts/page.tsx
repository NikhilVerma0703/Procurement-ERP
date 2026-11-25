import type { Metadata } from "next";
import { DocListPage } from "@/components/purchase/doc/DocPages";
import { RECEIPT_SCREEN } from "@/lib/purchase/doc/screens";

// Stock › Stock Transactions › Purchase Receipt: the old list view (owner, 25-11-2026: "all these built
// sections should look like original website"), as Thiru R had it — Title, Status, Date, Grand Total,
// Gate Entry, ID (the DocType's List View Settings), his sort (Date, newest first), the filters ID,
// Title, Company, Status, "20 of 1,000+" and Load More (doc/screens.ts RECEIPT_SCREEN).

export const metadata: Metadata = { title: "Purchase Receipt" };
export const dynamic = "force-dynamic";

export default async function PurchaseReceiptListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DocListPage screen={RECEIPT_SCREEN} searchParams={await searchParams} />;
}
