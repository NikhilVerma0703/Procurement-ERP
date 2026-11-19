import type { Metadata } from "next";
import { MasterRefused } from "@/components/purchase/masters/MasterRefused";
import { MasterScreen } from "@/components/purchase/masters/MasterScreen";
import { purchaseCan } from "@/lib/purchase/access";
import { newContactValues } from "@/lib/purchase/masters/contact/spec";
import { partyPrefill } from "@/lib/purchase/masters/prefill";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { saveContactAction } from "../actions";

export const metadata: Metadata = { title: "New Contact" };
export const dynamic = "force-dynamic";

// A new contact; from a supplier's New Contact it is linked to the supplier and returns there.
export default async function NewContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  if (!purchaseCan(gate.user, "masters")) {
    return <MasterRefused doctype="Contact" title="New Contact" message="You do not have permission to create a Contact." back={PURCHASE_PATHS.contacts} />;
  }
  const { link, returnTo } = partyPrefill(await searchParams);
  return <MasterScreen master="contacts" isNew initial={newContactValues(link)} title="New Contact" editable save={saveContactAction.bind(null, null, null)} returnTo={returnTo} />;
}
