import type { Metadata } from "next";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ListWithSidebar, SidebarToggleButton } from "@/components/purchase/collab/ListLayout";
import { ListActions } from "@/components/purchase/list/ListActions";
import { OrderListSidebar } from "@/components/purchase/list/OrderListSidebar";
import { ListPaging } from "@/components/purchase/list/ListPaging";
import { ListToolbar } from "@/components/purchase/list/ListToolbar";
import { OrderTable } from "@/components/purchase/list/OrderTable";
import { RememberListView } from "@/components/purchase/list/RememberListView";
import { ListSelection } from "@/components/purchase/list/selection";
import { purchaseCan } from "@/lib/purchase/access";
import { savedFilters } from "@/lib/purchase/collab/tags";
import { LIST_FIELDS, listQueryToParams, parseListQuery } from "@/lib/purchase/orders/list";
import { listFilterSuggestions, listOrders } from "@/lib/purchase/orders/queries";
import { DEFAULT_PO_LAYOUT, PO_LAYOUTS } from "@/lib/purchase/pdf/layouts/index";
import { PURCHASE_API_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Purchase Order" };

// Buying → Purchase Order: the list, as on the old site (Step 5,
// docs/05-list-screen.md). Its state lives in the address bar
// (lib/purchase/orders/list.ts), so a filtered list can be bookmarked, shared
// and reopened; the rows always come from the saved records as they are now.
// Each row has the old list's checkbox and ♥; ticked rows get the Actions menu
// (owner decision 19-11-2026).
export const dynamic = "force-dynamic";

// The sidebar's Edit Filters: the PO's Select, Link and Data fields this list can filter by (the old dialog
// listed every such field of the PO; those this list does not filter on are not offered, as a value picked
// there could not be applied — owner, 26-11-2026).
const NOT_GROUPED = new Set(["name", "owner", "modified_by", "_liked_by", "_assign", "_user_tags"]);
const GROUP_FIELDS = LIST_FIELDS.filter((f) => !f.child && !NOT_GROUPED.has(f.key) && (f.type === "link" || f.type === "select" || f.type === "data")).map((f) => ({
  fieldname: f.key,
  label: f.label,
  fieldtype: f.type === "link" ? "Link" : f.type === "select" ? "Select" : "Data",
}));

export default async function PurchaseOrderListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const user = gate.user!;
  const query = parseListQuery(await searchParams);
  const [{ rows, total }, suggestions, saved] = await Promise.all([listOrders(query, user.email), listFilterSuggestions(), savedFilters("Purchase Order", user)]);
  const params = listQueryToParams(query);
  params.delete("limit");
  const exportHref = `${PURCHASE_API_PATHS.ordersExport}${params.size ? `?${params}` : ""}`;

  return (
    <ListSelection rows={rows.map((r) => ({ id: r.id, name: r.number, docStatus: r.docStatus, workflowState: r.workflowState }))}>
      <PageHeader
        crumbs={["Buying", "Purchase Order"]}
        title="Purchase Order"
        before={<SidebarToggleButton />}
        actions={
          <ListActions
            exportHref={exportHref}
            selectionExportAction={exportHref}
            layouts={Object.keys(PO_LAYOUTS)}
            defaultLayout={DEFAULT_PO_LAYOUT}
            canApprove={purchaseCan(user, "approve")}
            canDelete={purchaseCan(user, "save")}
            canManage={purchaseCan(user, "manage")}
            canCreateReceipt={purchaseCan(user, "stock")}
            viewer={user.email}
          />
        }
      />
      <RememberListView userId={user.id} search={listQueryToParams(query).toString()} />
      <ListWithSidebar
        sidebar={<OrderListSidebar query={query} viewer={user.email} saved={saved} canGlobal={purchaseCan(user, "manage")} groupFields={GROUP_FIELDS} />}
      >
        <section className="po-card">
          <ListToolbar query={query} suppliers={suggestions.suppliers} companies={suggestions.companies} />
          <OrderTable rows={rows} total={total} query={query} now={new Date().toISOString()} viewer={user.email} canLike={purchaseCan(user, "like")} />
          <ListPaging query={query} shown={rows.length} total={total} />
        </section>
      </ListWithSidebar>
    </ListSelection>
  );
}
