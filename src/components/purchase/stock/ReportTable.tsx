"use client";

// A stock report's table (Phase II, owner 21-11-2026): the old query report's grid — a row number,
// the report's columns in its order with its labels, Float and Currency right-aligned in the site's
// formats, In Qty in green and Out Qty in red (the reports' formatter), and the Total row where the
// report had one. Long reports are shown 500 rows at a time.

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCount, formatCurrency, formatFloat } from "@/lib/purchase/format";

export interface ReportColumn {
  key: string;
  label: string;
  kind: "text" | "float" | "currency" | "datetime";
  width?: number;
  /** "in" shows positive values green, "out" non-zero values red (the reports' formatters). */
  tone?: "in" | "out";
  /** The value names a record with a page here: the row's item (row.itemHref) or voucher (row.voucherHref). */
  link?: "item" | "voucher";
  /** A tree report's first column: indented by the row's depth (row.indent). */
  tree?: boolean;
}

/** The page a linked value opens (worked out on the server, by record ID); null where there is none yet. */
function hrefOf(c: ReportColumn, row: Record<string, unknown>): string | null {
  if (!c.link || row.opening) return null;
  const href = c.link === "item" ? row.itemHref : row.voucherHref;
  return typeof href === "string" ? href : null;
}

const PAGE = 500;

function show(c: ReportColumn, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "float") return formatFloat(v as number);
  if (c.kind === "currency") return formatCurrency(v as number, { symbol: "₹" });
  if (c.kind === "datetime") {
    const s = String(v);
    return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)} ${s.slice(11, 19)}`.trim();
  }
  return String(v);
}

export function ReportTable({ columns, rows, total, empty = "Nothing to show" }: {
  columns: readonly ReportColumn[];
  rows: readonly Record<string, unknown>[];
  total?: Record<string, unknown> | null;
  empty?: string;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = useMemo(() => rows.slice(page * PAGE, page * PAGE + PAGE), [rows, page]);
  if (!rows.length) return <p className="p-6 text-sm text-gray-500">{empty}</p>;
  const right = (c: ReportColumn) => c.kind === "float" || c.kind === "currency";
  const tone = (c: ReportColumn, v: unknown) =>
    c.tone === "in" && Number(v) > 0 ? "text-green-700" : c.tone === "out" && Number(v) !== 0 && v !== null && v !== "" ? "text-red-600" : "";
  return (
    <div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="po-report-table w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium text-gray-600">
            <tr>
              <th className="border-b border-gray-200 px-2 py-2 text-right">#</th>
              {columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap border-b border-gray-200 px-2 py-2 ${right(c) ? "text-right" : ""}`} style={c.width ? { minWidth: c.width } : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={page * PAGE + i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1.5 text-right text-xs text-gray-400">{page * PAGE + i + 1}</td>
                {columns.map((c) => {
                  const text = show(c, r[c.key]);
                  const href = hrefOf(c, r);
                  return (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-2 py-1.5 ${right(c) ? "text-right tabular-nums" : ""} ${tone(c, r[c.key])} ${c.tree && r.isGroup ? "font-semibold" : ""}`}
                      style={c.tree ? { paddingLeft: 8 + 20 * (Number(r.indent) || 0) } : undefined}
                    >
                      {href && text ? <Link href={href} className="hover:underline">{text}</Link> : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot className="sticky bottom-0 bg-gray-50 font-semibold">
              <tr>
                <td className="px-2 py-2" />
                {columns.map((c, i) => (
                  <td key={c.key} className={`whitespace-nowrap px-2 py-2 ${right(c) ? "text-right tabular-nums" : ""}`}>
                    {i === 0 ? "Total" : show(c, total[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-xs text-gray-600">
        <span>
          {formatCount(page * PAGE + 1)}–{formatCount(Math.min(rows.length, page * PAGE + PAGE))} of {formatCount(rows.length)}
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <button type="button" className="po-btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {pages}</span>
            <button type="button" className="po-btn-secondary" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        )}
      </div>
    </div>
  );
}
