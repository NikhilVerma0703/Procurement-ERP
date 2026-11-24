import type { Metadata } from "next";
import { DocRecordPage } from "@/components/purchase/doc/DocPages";
import { docTitle } from "@/lib/purchase/doc/list-data";
import { screenOf } from "@/lib/purchase/doc/screens";

// One Item Group, in its form (doc/screens.ts): the root is read only, as on the old site.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: (await docTitle(screenOf("Item Group")!, decodeURIComponent((await params).id))) ?? "Item Group" };
}

export default async function ItemGroupRecordPage({ params }: { params: Promise<{ id: string }> }) {
  return <DocRecordPage screen={screenOf("Item Group")!} id={decodeURIComponent((await params).id)} />;
}
