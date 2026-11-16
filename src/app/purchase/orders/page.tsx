import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";

export const metadata: Metadata = { title: "Purchase Order" };

// Scaffold (build plan Step 1). The list itself — columns, quick filters,
// filter builder, sort, paging, export, exactly as the original's
// Buying → Purchase Order list — is Step 5; the records arrive with the
// migration in Step 3.
export default function PurchaseOrderListPage() {
  return (
    <>
      <PageHeader crumbs={["Buying", "Purchase Order"]} title="Purchase Order" />
      <section className="po-card p-8 text-center text-sm text-gray-600">
        <p className="font-medium text-gray-800">No purchase orders yet.</p>
        <p className="mt-1">
          The 3,199 historical purchase orders are imported in Step 3; the list screen is built in Step 5.
        </p>
      </section>
    </>
  );
}
