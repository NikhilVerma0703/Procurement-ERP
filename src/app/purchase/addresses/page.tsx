import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { masterListPage } from "@/lib/purchase/masters/list-likes";
import { purchaseCan } from "@/lib/purchase/access";
import { ADDRESS_TYPES } from "@/lib/purchase/masters/address/spec";
import { ADDRESS_LIST, addressCountries, listAddresses } from "@/lib/purchase/masters/address/server";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { masterNewPath } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Address" };
export const dynamic = "force-dynamic";

// Address: the list as Frappe showed it (the name, Enabled / Disabled, Address Type, City/Town),
// with Address Type and Country as its standard filters.
export default async function AddressListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, ADDRESS_LIST);
  const [page, countries] = await Promise.all([masterListPage("addresses", query, gate.user!.email, listAddresses), addressCountries()]);
  return (
    <MasterList
      kind="addresses"
      viewer={gate.user!.email}
      canLike={purchaseCan(gate.user, "like")}
      canDelete={purchaseCan(gate.user, "masters")}
      title="Address"
      titleLabel="ID"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={ADDRESS_LIST}
      filters={[
        { key: "address_type", label: "Address Type", options: ADDRESS_TYPES },
        { key: "country", label: "Country", options: countries },
      ]}
      columns={[
        { key: "address_type", label: "Address Type" },
        { key: "city", label: "City/Town", wide: true },
      ]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
      ]}
      newHref={purchaseCan(gate.user, "masters") ? masterNewPath("addresses") : undefined}
      now={new Date().toISOString()}
    />
  );
}
