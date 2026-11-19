import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { masterListPage } from "@/lib/purchase/masters/list-likes";
import { purchaseCan } from "@/lib/purchase/access";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { listPaymentTermsTemplates, PAYMENT_TERMS_TEMPLATE_LIST } from "@/lib/purchase/masters/templates/server";
import { masterNewPath } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Payment Terms Template" };
export const dynamic = "force-dynamic";

export default async function PaymentTermsTemplateListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, PAYMENT_TERMS_TEMPLATE_LIST);
  const page = await masterListPage("paymentTermsTemplates", query, gate.user!.email, listPaymentTermsTemplates);
  return (
    <MasterList
      kind="paymentTermsTemplates"
      viewer={gate.user!.email}
      canLike={purchaseCan(gate.user, "like")}
      canDelete={purchaseCan(gate.user, "masters")}
      title="Payment Terms Template"
      titleLabel="ID"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={PAYMENT_TERMS_TEMPLATE_LIST}
      filters={[]}
      columns={[]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
      ]}
      newHref={purchaseCan(gate.user, "masters") ? masterNewPath("paymentTermsTemplates") : undefined}
      now={new Date().toISOString()}
    />
  );
}
