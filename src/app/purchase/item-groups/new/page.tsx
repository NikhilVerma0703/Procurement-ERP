import type { Metadata } from "next";
import { DocNewPage } from "@/components/purchase/doc/DocPages";
import { screenOf } from "@/lib/purchase/doc/screens";

// A new Item Group in its full form (the tree's New asks only for the name and Group Node).

export const metadata: Metadata = { title: "New Item Group" };
export const dynamic = "force-dynamic";

export default async function ItemGroupNewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DocNewPage screen={screenOf("Item Group")!} searchParams={await searchParams} />;
}
