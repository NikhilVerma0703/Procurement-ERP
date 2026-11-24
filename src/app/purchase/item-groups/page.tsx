import type { Metadata } from "next";
import { DocListPage } from "@/components/purchase/doc/DocPages";
import { ItemGroupTree } from "@/components/purchase/doc/ItemGroupTree";
import { purchaseCan } from "@/lib/purchase/access";
import { screenOf } from "@/lib/purchase/doc/screens";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";

// Stock › Items and Pricing › Item Group (owner, 24-11-2026). A tree DocType: its menu link opened
// the Item Group Tree on the old site (frappe.utils.generate_route), and the tree's ⋯ › View List
// the list view (?view=list here, with its "Tree" view to come back).

export const metadata: Metadata = { title: "Item Group" };
export const dynamic = "force-dynamic";

export default async function ItemGroupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const screen = screenOf("Item Group")!;
  if (sp.view === "list") {
    const { view: _v, ...rest } = sp;
    void _v;
    return (
      <DocListPage
        screen={screen}
        searchParams={rest}
        views={[
          { label: "List View", href: `${PURCHASE_PATHS.itemGroups}?view=list`, active: true },
          { label: "Tree", href: PURCHASE_PATHS.itemGroups, active: false },
        ]}
      />
    );
  }
  const gate = await purchasePageGate("stock");
  const groups = await db.purchaseItemGroup.findMany({ select: { id: true, code: true, parentCode: true, isGroup: true } });
  return (
    <ItemGroupTree
      nodes={groups.map((g) => ({ id: g.id, name: g.code, parent: g.parentCode || null, isGroup: g.isGroup }))}
      basePath={PURCHASE_PATHS.itemGroups}
      listHref={`${PURCHASE_PATHS.itemGroups}?view=list`}
      canWrite={purchaseCan(gate.user, "stock")}
    />
  );
}
