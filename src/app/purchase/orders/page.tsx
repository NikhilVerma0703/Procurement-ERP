import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ListActions } from "@/components/purchase/list/ListActions";
import { ListPaging } from "@/components/purchase/list/ListPaging";
import { ListToolbar } from "@/components/purchase/list/ListToolbar";
import { OrderTable } from "@/components/purchase/list/OrderTable";
import { RememberListView } from "@/components/purchase/list/RememberListView";
import { listQueryToParams, parseListQuery } from "@/lib/purchase/orders/list";
import { listFilterSuggestions, listOrders } from "@/lib/purchase/orders/queries";
import { PURCHASE_API_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Purchase Order" };

// Buying → Purchase Order: the list, as on the old site (Step 5,
// docs/05-list-screen.md). Its state lives in the address bar
// (lib/purchase/orders/list.ts), so a filtered list can be bookmarked, shared
// and reopened; the rows always come from the saved records as they are now.
export const dynamic = "force-dynamic";

export default async function PurchaseOrderListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseListQuery(await searchParams);
  const [{ rows, total }, suggestions] = await Promise.all([listOrders(query), listFilterSuggestions()]);
  const params = listQueryToParams(query);
  params.delete("limit");
  const exportHref = `${PURCHASE_API_PATHS.ordersExport}${params.size ? `?${params}` : ""}`;

  return (
    <>
      <PageHeader crumbs={["Buying", "Purchase Order"]} title="Purchase Order" actions={<ListActions exportHref={exportHref} />} />
      <RememberListView userId={gate.user!.id} search={listQueryToParams(query).toString()} />
      <section className="po-card">
        <ListToolbar query={query} suppliers={suggestions.suppliers} companies={suggestions.companies} />
        <OrderTable rows={rows} total={total} query={query} now={new Date()} />
        <ListPaging query={query} shown={rows.length} total={total} />
      </section>
    </>
  );
}
