import type { Metadata } from "next";
import Link from "next/link";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { newItemValues } from "@/lib/purchase/masters/item/spec";
import { variantDraft } from "@/lib/purchase/masters/item/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { saveItemAction } from "../actions";

export const metadata: Metadata = { title: "New Item" };
export const dynamic = "force-dynamic";

// A new item: blank with the doctype's defaults, or a template's new variant (Create → Single
// Variant: ?template=<id>&attr:<Attribute>=<value>…), opened unsaved as create_variant returned it.
export default async function NewItemPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Item" title="New Item" message="You do not have permission to create an Item." back={PURCHASE_PATHS.items} />;
  }
  const sp = await searchParams;
  const template = typeof sp.template === "string" ? sp.template : null;
  if (!template) return <MasterScreen master="items" isNew initial={newItemValues()} title="New Item" editable save={saveItemAction.bind(null, null, null)} />;

  const args: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (k.startsWith("attr:") && typeof v === "string" && v) args[k.slice(5)] = v.slice(0, 140);
  const draft = await variantDraft(template, args);
  if ("error" in draft) return <MasterRefused doctype="Item" title="New Item" message={draft.error} back={PURCHASE_PATHS.items} />;
  if ("exists" in draft) {
    return <MasterRefused doctype="Item" title="New Item" message={`Item Variant ${draft.exists} already exists with same attributes`} back={masterPath("items", draft.id)} />;
  }
  return (
    <MasterScreen
      master="items"
      isNew
      initial={draft.values}
      title="New Item"
      editable
      save={saveItemAction.bind(null, null, null)}
      intro={
        <>
          This Item is a Variant of{" "}
          <Link href={masterPath("items", template)} className="font-semibold underline">
            {String(draft.values.variant_of)}
          </Link>{" "}
          (Template).
        </>
      }
    />
  );
}
