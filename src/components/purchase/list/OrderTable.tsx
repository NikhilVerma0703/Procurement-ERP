"use client";

import Link from "next/link";
import { Heart, MessageSquare } from "lucide-react";
import { cn } from "@/lib/purchase/cn";
import { formatCount, formatCurrency, formatDate, formatDateTime, timeAgoMini } from "@/lib/purchase/format";
import { isLikedByMeFilter, likedByMeFilter } from "@/lib/purchase/like-rules";
import { listHref, type ListQuery } from "@/lib/purchase/orders/list";
import type { OrderListRow } from "@/lib/purchase/orders/queries";
import { orderPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { LikeButton } from "../likes/LikeButton";
import { CHECKBOX, useListSelection } from "./selection";
import { StatusPill } from "./StatusPill";

// The rows of the Purchase Order list, with the old site's columns in its
// order: Supplier Name, Status (workflow state), Date, Grand Total, % Billed,
// % Received, ID, then when it last changed and its comment count. The count
// "20 of 3,199" heads the right-hand side as it did there.
//
// Before the supplier name each row has the old list's checkbox and ♥ (owner
// decision 19-11-2026). The heading's checkbox ticks every row shown and its ♥
// shows only what you liked (Frappe's "Liked By like %<you>%" filter). While
// rows are ticked the heading reads "N items selected", as ERPNext 14 wrote it
// ("1 items selected" too), and the page's Actions menu acts on them.

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

export function OrderTable({ rows, total, query, now, viewer, canLike }: {
  rows: OrderListRow[];
  total: number;
  query: ListQuery;
  /** The server's clock (ISO), so "time ago" reads the same on both sides. */
  now: string;
  /** The signed-in user's e-mail: their hearts are filled, and the ♥ heading filters by it. */
  viewer: string;
  canLike: boolean;
}) {
  const { chosen, isSelected, allSelected, toggle, setAll } = useListSelection();
  const at = new Date(now);
  const filtered = query.filters.length > 0 || Object.keys(query.quick).length > 0;
  /** The list filtered by a workflow state, replacing any earlier one. */
  const byState = (state: string) =>
    listHref(PURCHASE_PATHS.orders, {
      ...query,
      filters: [...query.filters.filter((f) => f.field !== "workflow_state"), { field: "workflow_state", op: "=", value: state }],
      limit: query.pageLength,
    });
  const likedByMe = query.filters.some((f) => isLikedByMeFilter(f, viewer));
  /** The ♥ heading: add or take away "Liked By like %<you>%". */
  const likedHref = listHref(PURCHASE_PATHS.orders, {
    ...query,
    filters: likedByMe ? query.filters.filter((f) => !isLikedByMeFilter(f, viewer)) : [...query.filters, likedByMeFilter(viewer)],
    limit: query.pageLength,
  });
  const count = (
    <>
      {formatCount(rows.length)} of {formatCount(total)}
    </>
  );

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
          {chosen.length > 0 ? (
            <tr>
              <th className={cn(TH, "overflow-visible whitespace-nowrap")}>
                <label className="inline-flex items-center gap-2.5 font-medium text-gray-700">
                  <input type="checkbox" className={CHECKBOX} checked={allSelected} onChange={(e) => setAll(e.target.checked)} title="Select All" />
                  {chosen.length} items selected
                </label>
              </th>
              <th className={TH} />
              <th className={TH} />
              <th className={TH} />
              <th className={`${TH} hidden md:table-cell`} />
              <th className={`${TH} hidden md:table-cell`} />
              <th className={TH} />
              <th className={`${TH} text-right`}>{count}</th>
            </tr>
          ) : (
            <tr>
              <th className={TH}>
                <span className="inline-flex items-center gap-2.5">
                  <input type="checkbox" className={CHECKBOX} checked={false} disabled={rows.length === 0} onChange={(e) => setAll(e.target.checked)} title="Select All" aria-label="Select All" />
                  <Link href={likedHref} className="hidden rounded p-0.5 hover:bg-gray-100 sm:inline-flex" title="Likes" aria-label="Likes" aria-pressed={likedByMe}>
                    <Heart className={cn("h-3.5 w-3.5", likedByMe ? "fill-[#e24c4c] text-[#e24c4c]" : "text-gray-400")} aria-hidden />
                  </Link>
                  Supplier Name
                </span>
              </th>
              <th className={TH}>Status</th>
              <th className={TH}>Date</th>
              <th className={`${TH} text-right`}>Grand Total</th>
              <th className={`${TH} hidden md:table-cell`}>% Billed</th>
              <th className={`${TH} hidden md:table-cell`}>% Received</th>
              <th className={TH}>ID</th>
              <th className={`${TH} text-right`}>{count}</th>
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="relative hover:bg-gray-50">
              <td className={`${TD} truncate font-semibold text-gray-900`}>
                {/* The checkbox and ♥ sit above the row's link; the rest of the row opens the PO. */}
                <span className="relative z-10 mr-2 inline-flex items-center gap-2 align-middle">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={isSelected(r.id)}
                    onChange={(e) => toggle(r.id, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                    aria-label={`Select ${r.number}`}
                  />
                  <LikeButton kind="orders" id={r.id} likes={r.likes} canLike={canLike} className="hidden sm:inline-flex" />
                </span>
                <Link href={orderPath(r.id)} className="align-middle after:absolute after:inset-0" title={r.supplierName}>
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
                <span title={formatDateTime(r.updatedAt)}>{timeAgoMini(r.updatedAt, at)}</span>
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
