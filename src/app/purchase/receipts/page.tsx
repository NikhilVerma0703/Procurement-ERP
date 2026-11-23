import type { Metadata } from "next";
import Link from "next/link";
import { IndicatorPill } from "@/components/purchase/doc/IndicatorPill";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReceiptListFilters } from "@/components/purchase/stock/ReceiptListFilters";
import { formatCount, formatCurrency, formatDate, timeAgoMini } from "@/lib/purchase/format";
import { receiptNewPath, receiptPath } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { receiptIndicator } from "@/lib/purchase/stock/receipt-status";
import { listReceipts, parseReceiptListQuery, RECEIPT_PAGE_SIZES, RECEIPT_STATUSES, receiptListParams } from "@/lib/purchase/stock/receipts";

// Stock › Stock Transactions › Purchase Receipt (Phase II, owner 21-11-2026): the old list — Title,
// Status, Date, Grand Total, Gate Entry, ID and when it was last changed; filters ID, Title,
// Company, Status; 20 / 100 / 500 / 2500 a page; newest posting date first. The receipts are the old
// site's 5,593 (and on), read-only for now: entering and submitting receipts here comes next
// (docs/12 §7).

export const metadata: Metadata = { title: "Purchase Receipt" };
export const dynamic = "force-dynamic";

export default async function PurchaseReceiptListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const q = parseReceiptListQuery(await searchParams);
  const { rows, total } = await listReceipts(db, q);
  const now = new Date();
  const pages = Math.max(1, Math.ceil(total / q.pageSize));
  const href = (over: Parameters<typeof receiptListParams>[1]) => {
    const p = receiptListParams(q, over).toString();
    return p ? `?${p}` : "?";
  };
  return (
    <>
      <PageHeader
        crumbs={["Stock", "Stock Transactions"]}
        title="Purchase Receipt"
        actions={<Link href={receiptNewPath()} className="po-btn-primary">Add Purchase Receipt</Link>}
      />
      <section className="po-card">
        <ReceiptListFilters
          values={{ name: q.id, title: q.title, company: q.company, status: q.status, page_length: q.pageSize !== 20 ? String(q.pageSize) : null }}
          statuses={RECEIPT_STATUSES}
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="text-left text-xs text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Grand Total</th>
                <th className="px-3 py-2 font-medium">Gate Entry</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 text-right font-medium text-gray-400">
                  {formatCount(rows.length)} of {formatCount(total)}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ind = receiptIndicator(r);
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="max-w-[16rem] truncate px-3 py-2 font-medium text-gray-900">
                      <Link href={receiptPath(r.id)} className="hover:underline">{r.title || r.number}</Link>
                    </td>
                    <td className="px-3 py-2"><IndicatorPill label={ind.label} colour={ind.colour} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatDate(r.postingDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                      {formatCurrency(r.grandTotal, { symbol: r.currency === "INR" ? "₹" : r.currency })}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{r.gateEntryCode ?? ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">{r.number}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-gray-400" title={r.updatedAt.toISOString()}>{timeAgoMini(r.updatedAt, now)}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-500">No Purchase Receipt found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-3 py-2 text-xs text-gray-600">
          <div className="flex overflow-hidden rounded-md border border-gray-200">
            {RECEIPT_PAGE_SIZES.map((n) => (
              <Link key={n} href={href({ pageSize: n, page: 1 })} className={`px-2.5 py-1 ${n === q.pageSize ? "bg-gray-800 text-white" : "hover:bg-gray-100"}`}>
                {n}
              </Link>
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              {q.page > 1 && <Link className="po-btn-secondary" href={href({ page: q.page - 1 })}>Previous</Link>}
              <span>Page {q.page} of {formatCount(pages)}</span>
              {q.page < pages && <Link className="po-btn-secondary" href={href({ page: q.page + 1 })}>Next</Link>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
