"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, Loader2, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { bulkDeleteOrdersAction, bulkWorkflowAction } from "@/app/purchase/orders/actions";
import { cn } from "@/lib/purchase/cn";
import type { BulkOutcome } from "@/lib/purchase/bulk-delete";
import { MAX_PRINT_SHEETS, TOO_MANY_TO_PRINT } from "@/lib/purchase/orders/selection";
import { PURCHASE_API_PATHS, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { ConfirmDialog } from "../form/Grid";
import { usePopover } from "../ui/usePopover";
import { deleteInBatches, inBatches } from "./batches";
import { MessageDialog, postForm, PrintDocumentsDialog, WorkflowStatusDialog } from "./BulkDialogs";
import { useListSelection } from "./selection";

// The list's header buttons, as on the old site: Refresh, the ⋯ menu (Export
// of the filtered list), and "+ Add Purchase Order".
//
// While rows are ticked, "+ Add Purchase Order" gives way to Frappe's Actions
// menu for them (owner decision 19-11-2026): the workflow's Approve and Reject
// first when every ticked PO can take them and you may approve (they sit above
// a divider, as Frappe put workflow actions), then Export, Print and Delete.
// Frappe's Assign To, Apply Assignment Rule and Add Tags are not offered:
// assignments and tags are not built (unused on the old site, docs/05 §4).

type Dialog =
  | { kind: "print" }
  | { kind: "delete" }
  | { kind: "message"; lines: string[] }
  | { kind: "workflow"; outcome: BulkOutcome };

export function ListActions({ exportHref, selectionExportAction, layouts, defaultLayout, canApprove, canDelete }: {
  /** The filtered list as Excel (the ⋯ menu). */
  exportHref: string;
  /** Where the selection's Export posts its ids (the list's sort kept). */
  selectionExportAction: string;
  /** The Print Formats, the default first. */
  layouts: readonly string[];
  defaultLayout: string;
  canApprove: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const menu = usePopover<HTMLDivElement>();
  const actions = usePopover<HTMLDivElement>();
  const { chosen, rows, clear } = useListSelection();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** "40 of 120" while a large selection goes through in turns. */
  const [progress, setProgress] = useState<string | null>(null);
  const onProgress = (done: number, total: number) => setProgress(total > done ? `${done} of ${total}` : null);

  const ids = chosen.map((r) => r.id);
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id;
  // get_common_transition_actions: offered only when every ticked PO has the transition.
  const workflow = canApprove && chosen.length > 0 && chosen.every((r) => r.docStatus === "Draft" && r.workflowState === "Created");

  const runWorkflow = async (decision: "approve" | "reject") => {
    setBusy(decision);
    try {
      // In turns of BULK_BATCH, so each request stays inside the server's time limit (batches.ts).
      const r = await inBatches(ids, (batch) => bulkWorkflowAction(batch, decision), onProgress);
      if (!r.ok) return setDialog({ kind: "message", lines: [r.error] });
      setDialog({ kind: "workflow", outcome: r.value });
      clear();
      router.refresh();
    } catch {
      toast.error("The server could not be reached. What was done before that stays done; refresh to see it.");
      router.refresh();
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const runDelete = async () => {
    setBusy("delete");
    try {
      const r = await deleteInBatches(chosen.map((c) => ({ id: c.id, name: c.name })), (batch) => bulkDeleteOrdersAction(batch), onProgress);
      if (!r.ok) return setDialog({ kind: "message", lines: [r.error] });
      const { done, failed } = r.value;
      setDialog(failed.length ? { kind: "message", lines: failed.map((f) => f.error) } : null);
      if (done.length) {
        clear();
        router.refresh();
      }
    } catch {
      setDialog(null);
      toast.error("The server could not be reached. What was done before that stays done; refresh to see it.");
      router.refresh();
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const print = () => {
    // bulk_operations.print: with "Allow Print for Cancelled" off, a cancelled PO stops the whole print.
    if (chosen.some((r) => r.docStatus === "Cancelled")) return setDialog({ kind: "message", lines: ["You selected Draft or Cancelled documents"] });
    // One file must stay under Vercel's answer size (orders/selection.ts).
    if (chosen.length > MAX_PRINT_SHEETS) return setDialog({ kind: "message", lines: [TOO_MANY_TO_PRINT] });
    setDialog({ kind: "print" });
  };

  const items: ({ label: string; run: () => void } | "divider")[] = [
    ...(workflow ? [{ label: "Approve", run: () => void runWorkflow("approve") }, { label: "Reject", run: () => void runWorkflow("reject") }, "divider" as const] : []),
    { label: "Export", run: () => postForm(selectionExportAction, { ids: JSON.stringify(ids) }) },
    { label: "Print", run: print },
    ...(canDelete ? [{ label: "Delete", run: () => setDialog({ kind: "delete" }) }] : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        className="po-btn-secondary px-2"
        title="Refresh"
        aria-label="Refresh"
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
      </button>
      <div ref={menu.ref} className="relative">
        <button type="button" onClick={() => menu.setOpen(!menu.open)} className="po-btn-secondary px-2" aria-label="Menu" aria-expanded={menu.open}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menu.open && (
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg" role="menu">
            <a href={exportHref} role="menuitem" onClick={() => menu.setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4" aria-hidden />
              Export (Excel)
            </a>
          </div>
        )}
      </div>
      {chosen.length > 0 ? (
        <div ref={actions.ref} className="relative">
          <button type="button" className="po-btn-primary" aria-haspopup="menu" aria-expanded={actions.open} disabled={busy !== null} onClick={() => actions.setOpen(!actions.open)}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {progress ?? "Actions"} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          {actions.open && (
            <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {items.map((it, i) =>
                it === "divider" ? (
                  <div key={`d${i}`} className="my-1 border-t border-gray-100" role="separator" />
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      actions.setOpen(false);
                      it.run();
                    }}
                  >
                    {it.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ) : (
        <Link href={PURCHASE_PATHS.orderNew} className="po-btn-primary">
          <Plus className="h-4 w-4" aria-hidden />
          Add Purchase Order
        </Link>
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          message={ids.length > 1 ? `Delete ${ids.length} items permanently?` : `Delete ${ids.length} item permanently?`}
          busy={busy === "delete"}
          onNo={() => setDialog(null)}
          onYes={() => void runDelete()}
        />
      )}
      {dialog?.kind === "print" && (
        <PrintDocumentsDialog
          layouts={layouts}
          initial={defaultLayout}
          onClose={() => setDialog(null)}
          onPrint={(format) => {
            postForm(PURCHASE_API_PATHS.ordersPrint, { ids: JSON.stringify(ids), format }, "_blank");
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "message" && <MessageDialog lines={dialog.lines} onClose={() => setDialog(null)} />}
      {dialog?.kind === "workflow" && <WorkflowStatusDialog outcome={dialog.outcome} nameOf={nameOf} onClose={() => setDialog(null)} />}
    </>
  );
}
