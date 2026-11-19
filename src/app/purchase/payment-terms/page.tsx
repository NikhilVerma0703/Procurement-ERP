import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { purchaseCan } from "@/lib/purchase/access";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { listPaymentTerms, PAYMENT_TERM_LIST } from "@/lib/purchase/masters/templates/server";
import { masterNewPath } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Payment Term" };
export const dynamic = "force-dynamic";

export default async function PaymentTermListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, PAYMENT_TERM_LIST);
  const page = await listPaymentTerms(query);
  return (
    <MasterList
      title="Payment Term"
      titleLabel="ID"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={PAYMENT_TERM_LIST}
      filters={[]}
      columns={[]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
      ]}
      newHref={purchaseCan(gate.user, "masters") ? masterNewPath("paymentTerms") : undefined}
      now={new Date().toISOString()}
    />
  );
}
