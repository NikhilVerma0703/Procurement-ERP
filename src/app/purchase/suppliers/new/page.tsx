import type { Metadata } from "next";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { supplierPrefill } from "@/lib/purchase/masters/supplier/spec";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { saveSupplierAction } from "../actions";

export const metadata: Metadata = { title: "New Supplier" };
export const dynamic = "force-dynamic";

// A new supplier in the full form: the quick entry's "Edit Full Form", with what was typed there.
export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Supplier" title="New Supplier" message="You do not have permission to create a Supplier." back={PURCHASE_PATHS.suppliers} />;
  }
  const initial = supplierPrefill(await searchParams);
  return <MasterScreen master="suppliers" isNew initial={initial} title="New Supplier" editable save={saveSupplierAction.bind(null, null, null)} />;
}
