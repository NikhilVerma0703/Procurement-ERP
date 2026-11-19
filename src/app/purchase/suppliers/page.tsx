import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { masterListPage } from "@/lib/purchase/masters/list-likes";
import { purchaseCan } from "@/lib/purchase/access";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { listSuppliers, SUPPLIER_LIST, supplierGroupNames } from "@/lib/purchase/masters/supplier/server";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Supplier" };
export const dynamic = "force-dynamic";

// Buying → Supplier: the list as the old site showed it (Supplier Name, its On Hold / Enabled
// indicator, Supplier Group), with Supplier Group as its standard filter; "Add Supplier" opens
// the quick entry the old list opened (lib/purchase/masters/supplier/spec.ts).
export default async function SupplierListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, SUPPLIER_LIST);
  const [page, groups] = await Promise.all([masterListPage("suppliers", query, gate.user!.email, listSuppliers), supplierGroupNames()]);
  const canAdd = purchaseCan(gate.user, "masters");
  return (
    <MasterList
      kind="suppliers"
      viewer={gate.user!.email}
      canLike={purchaseCan(gate.user, "like")}
      canDelete={purchaseCan(gate.user, "masters")}
      title="Supplier"
      titleLabel="Supplier Name"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={SUPPLIER_LIST}
      filters={[{ key: "supplier_group", label: "Supplier Group", options: groups }]}
      columns={[{ key: "supplier_group", label: "Supplier Group" }]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
        { key: "supplier_name", label: "Supplier Name" },
      ]}
      quickEntry={canAdd ? "suppliers" : undefined}
      now={new Date().toISOString()}
    />
  );
}
