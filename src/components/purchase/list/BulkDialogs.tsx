"use client";

// The dialogs of a list's selection Actions, as Frappe showed them:
//   * Message: what a bulk Delete refused, one line per record (its server messages);
//   * Workflow Status: after Approve / Reject on the selection, "Failed Transactions" and "Successful
//     Transactions", each record a link, a refusal's reason under it (print_workflow_log), the dot green
//     when all went, red when none did, orange when some did;
//   * Print Documents: the Print Format to print the selection in (bulk_operations.print).
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/purchase/cn";
import type { BulkOutcome } from "@/lib/purchase/bulk-delete";
import { orderPath } from "@/lib/purchase/routes";

function Modal({ title, indicator, onClose, children, footer }: { title: string; indicator?: "green" | "red" | "orange"; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
            {indicator && <span className={cn("h-2 w-2 rounded-full", { green: "bg-green-500", red: "bg-red-500", orange: "bg-orange-400" }[indicator])} aria-hidden />}
            {title}
          </span>
          <button type="button" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-sm text-gray-700">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function MessageDialog({ title = "Message", lines, onClose }: { title?: string; lines: string[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <p key={i} className={cn(i > 0 && "border-t border-gray-100 pt-2")}>
            {l}
          </p>
        ))}
      </div>
    </Modal>
  );
}

export function WorkflowStatusDialog({ outcome, nameOf, onClose }: { outcome: BulkOutcome; nameOf: (id: string) => string; onClose: () => void }) {
  const { done, failed } = outcome;
  const indicator = failed.length && done.length ? "orange" : failed.length ? "red" : "green";
  const name = (r: { id: string; name: string }) => r.name || nameOf(r.id);
  return (
    <Modal title="Workflow Status" indicator={indicator} onClose={onClose}>
      {failed.length > 0 && (
        <section className="mb-4">
          <h4 className="mb-2 font-semibold text-gray-900">Failed Transactions</h4>
          {failed.map((f) => (
            <details key={f.id} className="py-0.5">
              <summary className="cursor-pointer">
                {f.name ? (
                  <Link href={orderPath(f.id)} className="text-gray-900 underline-offset-2 hover:underline">
                    {f.name}
                  </Link>
                ) : (
                  name(f)
                )}
              </summary>
              <div className="px-1 py-0.5 text-xs text-gray-500">{f.error}</div>
            </details>
          ))}
        </section>
      )}
      {done.length > 0 && (
        <section>
          <h4 className="mb-2 font-semibold text-gray-900">Successful Transactions</h4>
          {done.map((d) => (
            <div key={d.id} className="py-0.5">
              <Link href={orderPath(d.id)} className="text-gray-900 underline-offset-2 hover:underline">
                {name(d)}
              </Link>
            </div>
          ))}
        </section>
      )}
    </Modal>
  );
}

/**
 * Print Documents: the Print Format, defaulting to the doctype's own ("PDF PO"). Frappe's dialog also
 * asked for a Letter Head and a Page Size; the PO layouts draw their own logo on their own A4 pages,
 * as the PO's print view prints them (docs/07-po-sheet.md §1), so neither is asked here.
 */
export function PrintDocumentsDialog({ layouts, initial, onPrint, onClose }: { layouts: readonly string[]; initial: string; onPrint: (format: string) => void; onClose: () => void }) {
  const [format, setFormat] = useState(initial);
  return (
    <Modal
      title="Print Documents"
      onClose={onClose}
      footer={
        <button type="button" className="po-btn-primary" onClick={() => onPrint(format)}>
          Print
        </button>
      }
    >
      <label className="block">
        <span className="mb-1 block text-xs text-gray-600">Print Format</span>
        <select className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[13px] text-gray-900" value={format} onChange={(e) => setFormat(e.target.value)}>
          {layouts.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}

/** Sends a form the way a page would, for downloads too large for an address (a selection's ids). */
export function postForm(action: string, fields: Record<string, string>, target?: string) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = action;
  if (target) form.target = target;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
