"use client";

// The Gate Entry form (owner, 23-11-2026), drawn from its captured layout by doc/DocumentForm, with
// the add-on's behaviour (gate_entry.js, captured 21-11-2026):
//   * a new entry: Naming Series, Location Hosur, Invoice Date and Gate Entry Date today;
//   * Po No — the picker offers submitted POs, not Closed, under 99 % received — fills Supplier, Po Date
//     and the rows: each PO line still to receive, Po Qty = Bal Qty = what is left; rows cannot be added;
//     (the old script refilled them only on a new entry and emptied a saved draft's: here a draft's are
//     refilled too, so changing the PO never leaves the entry without rows);
//   * a row's Item Qty → Bal Qty = Po Qty − Item Qty;
//   * the buttons of each state, as the old form had them (captured 23-11-2026): a draft Save, then
//     Submit (⋯ Print, Delete); submitted: Cancel, Create › Purchase Receipt while it has no Inward No,
//     Print; cancelled: Amend (once), ⋯ Delete. Submit, Cancel and Delete ask first ("Permanently …?").
// The server saves only what may be typed and fetches the rest again (stock/gate-entry-save.ts).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Printer } from "lucide-react";
import { toast } from "sonner";
import { cancelGateEntryAction, deleteGateEntryAction, gateEntryPoAction, saveGateEntryAction, submitGateEntryAction } from "@/app/purchase/gate-entries/actions";
import { DocumentForm, type FormBinding, type LookupSpec } from "@/components/purchase/doc/DocumentForm";
import { IndicatorPill } from "@/components/purchase/doc/IndicatorPill";
import { ConfirmDialog } from "@/components/purchase/form/Grid";
import { usePopover } from "@/components/purchase/ui/usePopover";
import { cn } from "@/lib/purchase/cn";
import type { DoctypeLayout, LayoutField } from "@/lib/purchase/doc/layout";
import type { Doc } from "@/lib/purchase/doc/store";
import type { ChildLayouts } from "@/lib/purchase/doc/visible";
import { gateEntryNewPath, gateEntryPath, gateEntryPrintPath, masterPath, orderPath, PURCHASE_PATHS, receiptFromGateEntryPath, receiptPath } from "@/lib/purchase/routes";
import { balQty, type GateEntryDocStatus } from "@/lib/purchase/stock/gate-entry-meta";

const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")) || 0);
const rowsOf = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);

export interface GateEntryLinks {
  order: string | null;
  supplier: string | null;
  receipt: string | null;
  items: Record<string, string>;
}

export function GateEntryForm(props: {
  id: string | null;
  initial: Doc;
  modified: string | null;
  docStatus: GateEntryDocStatus;
  /** For a new amendment: the cancelled entry it amends. */
  amendFrom?: string | null;
  layout: DoctypeLayout;
  childLayouts: ChildLayouts;
  links: GateEntryLinks;
  prev?: string | null;
  next?: string | null;
  /** A cancelled entry already amended (Amend is offered once). */
  amended?: boolean;
}) {
  const { id, initial, layout, childLayouts, links, docStatus } = props;
  const router = useRouter();
  const [doc, setDoc] = useState<Doc>(initial);
  const docRef = useRef(doc);
  const [dirty, setDirty] = useState(!id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, startBusy] = useTransition();
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const modifiedRef = useRef(props.modified);
  const menu = usePopover<HTMLDivElement>();
  const create = usePopover<HTMLDivElement>();
  const isDraft = docStatus === "DRAFT";
  const number = str(doc.name) || null;

  const update = useCallback((fn: (d: Doc) => Doc) => {
    const next = fn(docRef.current);
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  }, []);

  const binding: FormBinding = {
    editable: (table, f, row) => {
      if (!isDraft) return false;
      if (f.readOnly || f.fieldtype === "Read Only") return false;
      if (table === null && f.fieldname === "naming_series") return Boolean(docRef.current.__islocal);
      if (table === null && (f.fieldname === "inward_no" || f.fieldname === "inward_date")) return false;
      void row;
      return true;
    },
    lookup: (table: string | null, f: LayoutField): LookupSpec | null => {
      if (f.fieldtype !== "Link") return null;
      if (table === null && f.fieldname === "po_no") return { type: "gateEntryOrder" };
      if (table === null && f.fieldname === "supplier") return { type: "supplier" };
      if (table === null && f.fieldname === "financial_year") return { type: "fiscalYear" };
      if (table === "items" && f.fieldname === "uom") return { type: "uom" };
      return null;
    },
    setField: (fieldname, value) => {
      update((d) => ({ ...d, [fieldname]: value }));
      setErrors(({ [fieldname]: _gone, ...rest }) => (void _gone, rest));
      if (fieldname === "po_no") void fromPo(str(value));
    },
    setCell: (table, index, fieldname, value) => {
      update((d) => ({
        ...d,
        [table]: rowsOf(d[table]).map((r, k) => {
          if (k !== index) return r;
          const row = { ...r, [fieldname]: value };
          // the add-on's item_qty trigger
          if (fieldname === "item_qty") row.bal_qty = balQty(num(row.po_qty), num(row.item_qty));
          return row;
        }),
      }));
    },
    // Rows come only from the PO (grid.cannot_add_rows); they may still be removed.
    deleteRows: (table, indexes) => update((d) => ({ ...d, [table]: rowsOf(d[table]).filter((_, i) => !indexes.includes(i)).map((r, i) => ({ ...r, idx: i + 1 })) })),
    errors,
  };

  async function fromPo(orderNumber: string) {
    if (!orderNumber) {
      update((d) => ({ ...d, items: [] }));
      return;
    }
    const r = await gateEntryPoAction(orderNumber);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (str(docRef.current.po_no) !== orderNumber) return; // a newer choice replaced this one
    update((d) => ({ ...d, supplier: r.value.supplier, po_date: r.value.po_date, items: r.value.items }));
  }

  type Result<T> = { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };
  function run<T>(fn: () => Promise<Result<T>>, done: (value: T) => void, ok: string) {
    startBusy(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      setErrors({});
      toast.success(ok);
      done(r.value);
    });
  }

  const save = () =>
    run(
      () => saveGateEntryAction({ id, doc: docRef.current, modified: modifiedRef.current, amendFrom: props.amendFrom ?? null }),
      (v) => {
        setDirty(false);
        modifiedRef.current = v.modified;
        if (!id) router.replace(gateEntryPath(v.id));
        else router.refresh();
      },
      "Saved",
    );
  const submit = () =>
    setConfirm({
      message: `Permanently Submit ${number}?`,
      run: () => run(() => submitGateEntryAction({ id: id!, modified: modifiedRef.current }), () => router.refresh(), "Submitted"),
    });
  const cancel = () =>
    setConfirm({
      message: `Permanently Cancel ${number}?`,
      run: () => run(() => cancelGateEntryAction({ id: id!, modified: modifiedRef.current }), () => router.refresh(), "Cancelled"),
    });
  const remove = () =>
    setConfirm({
      message: `Permanently delete ${number}?`,
      run: () => run(() => deleteGateEntryAction({ id: id! }), () => router.push(PURCHASE_PATHS.gateEntries), "Deleted"),
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && isDraft) {
        e.preventDefault();
        if (!busy) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    if (!dirty || !isDraft) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, isDraft]);

  const pill = dirty && isDraft ? { label: "Not Saved", colour: "orange" as const }
    : docStatus === "SUBMITTED" ? { label: "Submitted", colour: "blue" as const }
    : docStatus === "CANCELLED" ? { label: "Cancelled", colour: "red" as const }
    : { label: "Draft", colour: "red" as const };
  const canReceipt = docStatus === "SUBMITTED" && !str(doc.inward_no) && Boolean(id);
  const title = number ?? (props.amendFrom ? `New Gate Entry (amending ${str(initial.amended_from)})` : "New Gate Entry");

  return (
    <>
      <div className="mb-4">
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-gray-500">
          <span>Stock</span>
          <span aria-hidden>›</span>
          <a href={PURCHASE_PATHS.gateEntries} className="hover:text-gray-800">Gate Entry</a>
          <span aria-hidden>›</span>
          <span className="text-gray-700">{number ?? "New"}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">{title}</h1>
            <IndicatorPill label={pill.label} colour={pill.colour} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {canReceipt && (
              <div ref={create.ref} className="relative">
                <button type="button" className="po-btn-secondary" aria-expanded={create.open} onClick={() => create.setOpen(!create.open)}>
                  Create <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {create.open && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg" role="menu">
                    <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50" onClick={() => router.push(receiptFromGateEntryPath(id!))}>
                      Purchase Receipt
                    </button>
                  </div>
                )}
              </div>
            )}
            {id && props.prev && (
              <a href={gateEntryPath(props.prev)} className="po-btn-secondary px-2" title="Previous Document" aria-label="Previous Document"><ChevronLeft className="h-4 w-4" /></a>
            )}
            {id && props.next && (
              <a href={gateEntryPath(props.next)} className="po-btn-secondary px-2" title="Next Document" aria-label="Next Document"><ChevronRight className="h-4 w-4" /></a>
            )}
            {id && !isDraft && (
              <a href={gateEntryPrintPath(id)} className="po-btn-secondary px-2" title="Print" aria-label="Print"><Printer className="h-4 w-4" /></a>
            )}
            {id && (
              <div ref={menu.ref} className="relative">
                <button type="button" className="po-btn-secondary px-2" aria-label="Menu" aria-expanded={menu.open} onClick={() => menu.setOpen(!menu.open)}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menu.open && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg" role="menu">
                    {canReceipt && <MenuItem onClick={() => router.push(receiptFromGateEntryPath(id))}>Create &gt; Purchase Receipt</MenuItem>}
                    <MenuItem onClick={() => router.push(gateEntryPrintPath(id))}>Print</MenuItem>
                    <MenuItem onClick={() => router.refresh()}>Reload</MenuItem>
                    {docStatus !== "SUBMITTED" && <MenuItem onClick={remove}>Delete</MenuItem>}
                    <MenuItem onClick={() => router.push(`${PURCHASE_PATHS.gateEntries}/new`)}>New Gate Entry</MenuItem>
                  </div>
                )}
              </div>
            )}
            {isDraft && (dirty || !id) && (
              <button type="button" className="po-btn-primary" disabled={busy} onClick={save} title="Save (Ctrl+S)">{busy ? "Saving…" : "Save"}</button>
            )}
            {isDraft && !dirty && id && (
              <button type="button" className="po-btn-primary" disabled={busy} onClick={submit}>Submit</button>
            )}
            {docStatus === "SUBMITTED" && (
              <button type="button" className="po-btn-secondary" disabled={busy} onClick={cancel}>Cancel</button>
            )}
            {docStatus === "CANCELLED" && !props.amended && id && (
              <button type="button" className="po-btn-primary" disabled={busy} onClick={() => router.push(gateEntryNewPath({ amend: id }))}>Amend</button>
            )}
          </div>
        </div>
      </div>
      <section className="po-card">
        <DocumentForm
          layout={layout}
          childLayouts={childLayouts}
          doc={doc}
          binding={binding}
          options={{
            currency: "INR",
            href: (table, f, value) => {
              if (table === null && f.fieldname === "po_no") return links.order ? orderPath(links.order) : null;
              if (table === null && f.fieldname === "supplier") return links.supplier ? masterPath("suppliers", links.supplier) : null;
              if (table === null && f.fieldname === "inward_no") return links.receipt ? receiptPath(links.receipt) : null;
              if (table === "items" && f.fieldname === "item_code") return links.items[value] ? masterPath("items", links.items[value]) : null;
              if (table === "items" && f.fieldname === "po_no") return links.order ? orderPath(links.order) : null;
              return null;
            },
          }}
        />
      </section>
      {confirm && <ConfirmDialog message={confirm.message} busy={busy} onNo={() => setConfirm(null)} onYes={() => { const c = confirm; setConfirm(null); c.run(); }} />}
    </>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" className={cn("block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50")} onClick={onClick}>
      {children}
    </button>
  );
}
