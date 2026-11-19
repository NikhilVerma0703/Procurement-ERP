import type { Metadata } from "next";
import { MasterList } from "@/components/purchase/masters/MasterList";
import { purchaseCan } from "@/lib/purchase/access";
import { CONTACT_STATUSES } from "@/lib/purchase/masters/contact/spec";
import { CONTACT_LIST, listContacts } from "@/lib/purchase/masters/contact/server";
import { parseMasterQuery } from "@/lib/purchase/masters/list-query";
import { masterNewPath } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

// Contact: the list as Frappe showed it (the name, its Status, Email Address, Phone), with Status
// as its standard filter.
export default async function ContactListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await purchasePageGate();
  const query = parseMasterQuery(await searchParams, CONTACT_LIST);
  const page = await listContacts(query);
  return (
    <MasterList
      title="Contact"
      titleLabel="ID"
      rows={page.rows}
      total={page.total}
      query={query}
      shape={CONTACT_LIST}
      filters={[{ key: "status", label: "Status", options: CONTACT_STATUSES }]}
      columns={[
        { key: "email_id", label: "Email Address" },
        { key: "phone", label: "Phone", wide: true },
      ]}
      sorts={[
        { key: "modified", label: "Last Updated On" },
        { key: "creation", label: "Created On" },
        { key: "name", label: "ID" },
      ]}
      newHref={purchaseCan(gate.user, "masters") ? masterNewPath("contacts") : undefined}
      now={new Date().toISOString()}
    />
  );
}
