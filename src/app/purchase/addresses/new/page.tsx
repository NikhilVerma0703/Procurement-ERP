import type { Metadata } from "next";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { newAddressValues } from "@/lib/purchase/masters/address/spec";
import { partyPrefill } from "@/lib/purchase/masters/prefill";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { saveAddressAction } from "../actions";

export const metadata: Metadata = { title: "New Address" };
export const dynamic = "force-dynamic";

// A new address; from a supplier's New Address it is linked to the supplier and returns there.
export default async function NewAddressPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Address" title="New Address" message="You do not have permission to create an Address." back={PURCHASE_PATHS.addresses} />;
  }
  const { link, returnTo } = partyPrefill(await searchParams);
  return <MasterScreen master="addresses" isNew initial={newAddressValues(link)} title="New Address" editable save={saveAddressAction.bind(null, null, null)} returnTo={returnTo} />;
}
