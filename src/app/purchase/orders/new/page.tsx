import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "New Purchase Order" };

// Placeholder until the PO form (build plan Step 6).
export default async function NewPurchaseOrderPage() {
  await purchasePageGate();
  return (
    <>
      <PageHeader crumbs={["Buying", "Purchase Order"]} title="New Purchase Order" />
      <section className="po-card p-8 text-center text-sm text-gray-600">
        <p className="font-medium text-gray-800">The Purchase Order form is built in Step 6.</p>
        <Link href={PURCHASE_PATHS.orders} className="mt-3 inline-block font-medium text-brand-700 hover:underline">
          Back to the list
        </Link>
      </section>
    </>
  );
}
