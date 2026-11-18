import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { OrderForm } from "@/components/purchase/form/OrderForm";
import { amendmentDoc, blankOrderDoc, duplicateOrderDoc, formMasters, type OrderDoc } from "@/lib/purchase/orders/form-load";
import { canDo } from "@/lib/purchase/orders/workflow";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "New Purchase Order" };
export const dynamic = "force-dynamic";

// A new PO: blank with the old form's defaults, a copy of a PO (?duplicate=)
// or the amendment of a cancelled one (?amend=). Only a role that may save
// drafts opens it.
export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ duplicate?: string; amend?: string }> }) {
  const gate = await purchasePageGate();
  const sp = await searchParams;
  if (!canDo(gate.user, null, "save")) return <Refused message="You do not have permission to create a Purchase Order." />;

  let doc: OrderDoc | null;
  if (sp.amend) {
    const r = await amendmentDoc(sp.amend);
    if ("error" in r) return <Refused message={r.error} />;
    doc = r.doc;
  } else if (sp.duplicate) {
    doc = await duplicateOrderDoc(sp.duplicate);
    if (!doc) notFound();
  } else {
    doc = await blankOrderDoc();
  }
  const masters = await formMasters();
  return <OrderForm key={sp.amend ?? sp.duplicate ?? "new"} doc={doc} masters={masters} allowed={["save"]} userEmail={gate.user!.email} />;
}

function Refused({ message }: { message: string }) {
  return (
    <>
      <PageHeader crumbs={["Buying", "Purchase Order"]} title="New Purchase Order" />
      <section className="po-card p-8 text-center text-sm text-gray-600">
        <p className="font-medium text-gray-800">{message}</p>
        <Link href={PURCHASE_PATHS.orders} className="mt-3 inline-block font-medium text-brand-700 hover:underline">
          Back to the list
        </Link>
      </section>
    </>
  );
}
