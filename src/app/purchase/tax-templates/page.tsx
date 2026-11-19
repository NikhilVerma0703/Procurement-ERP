import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { purchaseCan } from "@/lib/purchase/access";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { companyNames, listTaxTemplates, TAX_TEMPLATE_LIST } from "@/lib/purchase/masters/templates/server";
import { masterNewPath } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Purchase Taxes and Charges Template" };
export const dynamic = "force-dynamic";

// The list as Frappe showed it (Title, Enabled / Disabled, Default, Company), Company its filter.
export default async function TaxTemplateListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, TAX_TEMPLATE_LIST);
  const [page, companies] = await Promise.all([listTaxTemplates(query), companyNames()]);
  return (
    <MasterList
      title="Purchase Taxes and Charges Template"
      titleLabel="Title"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={TAX_TEMPLATE_LIST}
      filters={[{ key: "company", label: "Company", options: companies }]}
      columns={[
        { key: "is_default", label: "Default" },
        { key: "company", label: "Company", wide: true },
      ]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
      ]}
      newHref={purchaseCan(gate.user, "masters") ? masterNewPath("taxTemplates") : undefined}
      now={new Date().toISOString()}
    />
  );
}
