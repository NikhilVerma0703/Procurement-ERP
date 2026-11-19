import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemVariantActions } from "@/components/purchase/masters/ItemVariantActions";
import { MasterFooter } from "@/components/purchase/masters/MasterFooter";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { formatCount } from "@/lib/purchase/format";
import { loadItem } from "@/lib/purchase/masters/item/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { deleteItemAction, saveItemAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const i = await db.purchaseItem.findUnique({ where: { id }, select: { itemName: true } });
  return { title: i?.itemName ?? "Item" };
}

// One item: the full form (Details, Dashboard, Inventory, Variants, Accounting, Purchasing, Tax);
// a template also has View → Show Variants and Create → Single / Multiple Variants (item.js).
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate();
  const { id } = await params;
  const doc = await loadItem(id);
  if (!doc) notFound();
  const editable = purchaseCan(gate.user, "masters");
  const isTemplate = doc.values.has_variants === true;
  const template = doc.variantOf ? await db.purchaseItem.findUnique({ where: { code: doc.variantOf }, select: { id: true } }) : null;
  return (
    <MasterScreen
      key={doc.updatedAt}
      recordId={doc.id}
      master="items"
      isNew={false}
      initial={doc.values}
      title={doc.title}
      indicator={doc.indicator}
      editable={editable}
      save={saveItemAction.bind(null, doc.id, doc.updatedAt)}
      remove={deleteItemAction.bind(null, doc.id)}
      intro={
        isTemplate ? (
          "This Item is a Template and cannot be used in transactions. Item attributes will be copied over into the variants unless 'No Copy' is set"
        ) : doc.variantOf ? (
          <>
            This Item is a Variant of{" "}
            {template ? (
              <Link href={masterPath("items", template.id)} className="font-semibold underline">
                {doc.variantOf}
              </Link>
            ) : (
              <b>{doc.variantOf}</b>
            )}{" "}
            (Template).
          </>
        ) : undefined
      }
      actions={isTemplate ? <ItemVariantActions templateId={doc.id} templateCode={doc.code} choices={doc.attributeChoices} canCreate={editable} /> : undefined}
      slots={{
        dashboard: (
          // The connections this module has: the Purchase Orders with the item on a line, and a template's variants.
          <div className="flex flex-wrap gap-3 text-[13px]">
            <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-gray-800">
              Purchase Order
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{formatCount(doc.orders)}</span>
            </span>
            {isTemplate && (
              <Link href={`${PURCHASE_PATHS.items}?variant_of=${encodeURIComponent(doc.code)}`} className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-gray-800 hover:bg-gray-50">
                Item (variants)
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{formatCount(doc.variants)}</span>
              </Link>
            )}
          </div>
        ),
      }}
      footer={<MasterFooter created={doc.created} edited={doc.edited} viewer={gate.user!.email} />}
    />
  );
}
