import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { StatusPill } from "@/components/purchase/list/StatusPill";
import { formatCurrency, formatDate } from "@/lib/purchase/format";
import { PO_STATUS_KEYS, labelOf } from "@/lib/purchase/orders/labels";
import { DOCSTATUS_LABEL, WORKFLOW_LABEL } from "@/lib/purchase/orders/queries";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const metadata: Metadata = { title: "Purchase Order" };
export const dynamic = "force-dynamic";

// A PO opened from the list. Until the form is built (Step 6) it shows a
// read-only summary of the saved record: enough to open any PO and check it
// against the old site.
export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await purchasePageGate();
  const { id } = await params;
  const o = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      currencyRef: { select: { symbol: true, fractionUnits: true } },
      items: { orderBy: { idx: "asc" }, select: { id: true, idx: true, itemCode: true, itemName: true, qty: true, uom: true, rate: true, amount: true, scheduleDate: true } },
    },
  });
  if (!o) notFound();
  const money = (v: { toString(): string }) => formatCurrency(v.toString(), o.currencyRef);
  const facts: [string, string][] = [
    ["ID", o.number],
    ["Supplier", o.supplierName],
    ["Date", formatDate(o.transactionDate)],
    ["Required By", formatDate(o.scheduleDate)],
    ["Status", labelOf(PO_STATUS_KEYS, o.status)],
    ["Currency", o.currency],
    ["Net Total", money(o.netTotal)],
    ["Total Taxes and Charges", money(o.totalTaxesAndCharges)],
    ["Grand Total", money(o.grandTotal)],
    ["Rounded Total", money(o.roundedTotal)],
    ["In Words", o.inWords ?? ""],
  ];

  return (
    <>
      <PageHeader
        crumbs={["Buying", "Purchase Order", o.number]}
        title={o.supplierName}
        badge={<StatusPill label={WORKFLOW_LABEL[o.workflowState]} docStatus={DOCSTATUS_LABEL[o.docStatus]} />}
      />
      <section className="po-card mb-4 p-5">
        <p className="mb-4 text-xs text-gray-500">Read-only summary. The full Purchase Order form is built in Step 6.</p>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="text-sm text-gray-900">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="po-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">No.</th>
              <th className="px-3 py-2 font-medium">Item Code</th>
              <th className="px-3 py-2 font-medium">Required By</th>
              <th className="px-3 py-2 text-right font-medium">Quantity</th>
              <th className="px-3 py-2 font-medium">UOM</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 text-right font-medium">Final Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {o.items.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2 text-gray-500">{i.idx}</td>
                <td className="px-3 py-2 text-gray-900" title={i.itemName}>
                  {i.itemCode}
                </td>
                <td className="px-3 py-2">{formatDate(i.scheduleDate)}</td>
                <td className="px-3 py-2 text-right">{Number(i.qty.toString())}</td>
                <td className="px-3 py-2">{i.uom}</td>
                <td className="px-3 py-2 text-right">{money(i.rate)}</td>
                <td className="px-3 py-2 text-right">{money(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Link href={PURCHASE_PATHS.orders} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
        Back to the list
      </Link>
    </>
  );
}
