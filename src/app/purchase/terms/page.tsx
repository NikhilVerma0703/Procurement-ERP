import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { purchaseCan } from "@/lib/purchase/access";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { listTerms, TERMS_LIST } from "@/lib/purchase/masters/templates/server";
import { masterNewPath } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Terms and Conditions" };
export const dynamic = "force-dynamic";

// The list as Frappe showed it (Title, Enabled / Disabled, Selling, Buying).
export default async function TermsListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, TERMS_LIST);
  const page = await listTerms(query);
  return (
    <MasterList
      title="Terms and Conditions"
      titleLabel="Title"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={TERMS_LIST}
      filters={[]}
      columns={[
        { key: "selling", label: "Selling" },
        { key: "buying", label: "Buying" },
      ]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
      ]}
      newHref={purchaseCan(gate.user, "masters") ? masterNewPath("terms") : undefined}
      now={new Date().toISOString()}
    />
  );
}
