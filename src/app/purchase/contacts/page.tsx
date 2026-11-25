import type { Metadata } from "next";
import { DocListPage } from "@/components/purchase/doc/DocPages";
import { masterScreen } from "@/lib/purchase/doc/screens";

export const metadata: Metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

// Contact: the old list view (owner, 25-11-2026: "should look exactly same as website"), as every
// Stock screen's list: its title, status and "in list view" columns, standard filters and sort
// (doc/screens.ts MASTER_SCREENS). A record opens in its own form (docs/09).
export default async function ContactListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DocListPage screen={masterScreen("contacts")} searchParams={await searchParams} />;
}
