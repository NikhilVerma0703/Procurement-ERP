import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { formatCount, formatCurrency, formatDate, formatDateTime, timeAgoMini } from "@/lib/purchase/format";
import { listHref, type ListQuery } from "@/lib/purchase/orders/list";
import type { OrderListRow } from "@/lib/purchase/orders/queries";
import { orderPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { StatusPill } from "./StatusPill";

// The rows of the Purchase Order list, with the old site's columns in its
// order: Supplier Name, Status (workflow state), Date, Grand Total, % Billed,
// % Received, ID, then when it last changed and its comment count. The count
// "20 of 3,199" heads the right-hand side as it did there.

/** ERPNext draws Percent fields in a list as a green bar. */
function PercentBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-200" title={`${formatCount(Math.round(value))}%`}>
      <div className="h-1.5 rounded-full bg-[#98d85b]" style={{ width: `${Math.round(v)}%` }} />
    </div>
  );
}

const TH = "px-3 py-2.5 text-left text-xs font-medium text-gray-500";
const TD = "px-3 py-2.5";

export function OrderTable({ rows, total, query, now }: { rows: OrderListRow[]; total: number; query: ListQuery; now: Date }) {
  const filtered = query.filters.length > 0 || Object.keys(query.quick).length > 0;
  /** The list filtered by a workflow state, replacing any earlier one. */
  const byState = (state: string) =>
    listHref(PURCHASE_PATHS.orders, {
      ...query,
      filters: [...query.filters.filter((f) => f.field !== "workflow_state"), { field: "workflow_state", op: "=", value: state }],
      limit: query.pageLength,
    });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[14%]" />
          <col className="hidden w-[9%] md:table-column" />
          <col className="hidden w-[9%] md:table-column" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="border-b border-gray-200">
          <tr>
            <th className={TH}>Supplier Name</th>
            <th className={TH}>Status</th>
            <th className={TH}>Date</th>
            <th className={`${TH} text-right`}>Grand Total</th>
            <th className={`${TH} hidden md:table-cell`}>% Billed</th>
            <th className={`${TH} hidden md:table-cell`}>% Received</th>
            <th className={TH}>ID</th>
            <th className={`${TH} text-right`}>
              {formatCount(rows.length)} of {formatCount(total)}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="relative hover:bg-gray-50">
              <td className={`${TD} truncate font-semibold text-gray-900`}>
                {/* The whole row opens the PO; the status pill sits above this link. */}
                <Link href={orderPath(r.id)} className="after:absolute after:inset-0" title={r.supplierName}>
                  {r.supplierName}
                </Link>
              </td>
              <td className={TD}>
                <StatusPill label={r.workflowState} docStatus={r.docStatus} href={byState(r.workflowState)} />
              </td>
              <td className={`${TD} whitespace-nowrap text-gray-700`}>{formatDate(r.transactionDate)}</td>
              <td className={`${TD} truncate text-right text-gray-900`} title={formatCurrency(r.grandTotal, r.currency)}>
                {formatCurrency(r.grandTotal, r.currency)}
              </td>
              <td className={`${TD} hidden md:table-cell`}>
                <PercentBar value={r.perBilled} />
              </td>
              <td className={`${TD} hidden md:table-cell`}>
                <PercentBar value={r.perReceived} />
              </td>
              <td className={`${TD} truncate text-gray-600`} title={r.number}>
                {r.number}
              </td>
              <td className={`${TD} whitespace-nowrap text-right text-xs text-gray-500`}>
                <span title={formatDateTime(r.updatedAt)}>{timeAgoMini(r.updatedAt, now)}</span>
                <span className="ml-3 inline-flex items-center gap-1" title="Comments">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  {r.comments > 99 ? "99+" : r.comments}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="px-6 py-16 text-center text-sm text-gray-500">
          {filtered ? (
            <>
              No Purchase Order found with matching filters.{" "}
              <Link href={PURCHASE_PATHS.orders} className="font-medium text-brand-700 hover:underline">
                Clear filters
              </Link>
            </>
          ) : (
            "No Purchase Order found."
          )}
        </div>
      )}
    </div>
  );
}
