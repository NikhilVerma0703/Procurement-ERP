import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MasterFooter } from "@/components/purchase/masters/MasterFooter";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { PartyCards } from "@/components/purchase/masters/PartyCards";
import { purchaseCan } from "@/lib/purchase/access";
import { formatCount } from "@/lib/purchase/format";
import { loadSupplier } from "@/lib/purchase/masters/supplier/server";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { deleteSupplierAction, saveSupplierAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await db.purchaseSupplier.findUnique({ where: { id }, select: { supplierName: true } });
  return { title: s?.supplierName ?? "Supplier" };
}

// One supplier: the full form (Details, Dashboard, Tax, Address & Contact, Settings).
export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate();
  const { id } = await params;
  const doc = await loadSupplier(id);
  if (!doc) notFound();
  const editable = purchaseCan(gate.user, "masters");
  const self = masterPath("suppliers", doc.id);
  return (
    <MasterScreen
      key={doc.updatedAt}
      recordId={doc.id}
      master="suppliers"
      isNew={false}
      initial={doc.values}
      title={doc.title}
      indicator={doc.indicator}
      editable={editable}
      save={saveSupplierAction.bind(null, doc.id, doc.updatedAt)}
      remove={deleteSupplierAction.bind(null, doc.id)}
      slots={{
        dashboard: (
          // The connections this module has: the supplier's Purchase Orders.
          <div className="text-[13px]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Orders</p>
            <Link href={`${PURCHASE_PATHS.orders}?supplier=${encodeURIComponent(doc.code)}`} className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-gray-800 hover:bg-gray-50">
              Purchase Order
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{formatCount(doc.orders)}</span>
            </Link>
          </div>
        ),
        addresses: <PartyCards addresses={doc.addresses} contacts={doc.contacts} link={{ doctype: "Supplier", name: doc.code }} back={self} canAdd={editable} />,
      }}
      footer={<MasterFooter created={doc.created} edited={doc.edited} viewer={gate.user!.email} />}
    />
  );
}
