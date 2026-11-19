import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { masterListPage } from "@/lib/purchase/masters/list-likes";
import { purchaseCan } from "@/lib/purchase/access";
import { ITEM_LIST, itemGroupNames, listItems } from "@/lib/purchase/masters/item/server";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { masterNewPath } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Item" };
export const dynamic = "force-dynamic";

// Item: the list as the old site showed it (Item Name, the Disabled / Expired / Template / Variant
// indicator, Item Group), with Item Group, Has Variants and Variant Of as its standard filters.
export default async function ItemListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, ITEM_LIST);
  const [page, groups] = await Promise.all([masterListPage("items", query, gate.user!.email, listItems), itemGroupNames()]);
  return (
    <MasterList
      kind="items"
      viewer={gate.user!.email}
      canLike={purchaseCan(gate.user, "like")}
      canDelete={purchaseCan(gate.user, "masters")}
      title="Item"
      titleLabel="Item Name"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={ITEM_LIST}
      filters={[
        { key: "item_group", label: "Item Group", options: groups },
        { key: "has_variants", label: "Has Variants", options: ["Yes", "No"] },
        { key: "variant_of", label: "Variant Of" },
        { key: "disabled", label: "Disabled", options: ["Yes", "No"] },
      ]}
      columns={[{ key: "item_group", label: "Item Group" }]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
        { key: "item_name", label: "Item Name" },
      ]}
      newHref={purchaseCan(gate.user, "masters") ? masterNewPath("items") : undefined}
      now={new Date().toISOString()}
    />
  );
}
