"use client";

// The Purchase Order form (Buying → Purchase Order → a PO), as the old
// ERPNext form worked:
//   * header: breadcrumb, the supplier as title, the state pill ("Not Saved"
//     while there are unsaved changes), and the buttons the PO's state and the
//     user's role allow (workflow.ts): Save while there are changes;
//     Actions ▾ (Approve, Reject) on a saved draft; Status ▾ (Hold / Resume,
//     Close / Re-open) and Cancel once submitted, Update after changing a field
//     allowed after submit; Amend on a cancelled PO; Tools ▾ (Update Rate as per
//     Last Purchase) on a draft; ‹ › (Previous / Next Document, in the list's
//     order); ⋯ (Print, Email, Jump to field, Links, Duplicate, Copy to
//     Clipboard, Reload, Delete, New Purchase Order), as Frappe ordered them;
//   * tabs: Details, Address & Contact, Drop Ship, Terms, More Info,
//     Connections;
//   * Save validates with the server's own schema first, drops the empty rows
//     (Frappe's remove_empty_rows), and shows refused fields in red; the
//     server re-validates and recomputes everything (CLAUDE.md).
// Ctrl+S saves and Ctrl+J opens Jump to field, as in Frappe; leaving with
// unsaved changes asks first.
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, MoreHorizontal, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  adjacentOrderAction, approveOrderAction, cancelOrderAction, closeOrderAction, deleteOrderAction, holdOrderAction,
  lastPurchaseRatesAction, rejectOrderAction, reopenOrderAction, resumeOrderAction, saveOrderAction,
  updateOrderItemsAction, updateSubmittedOrderAction,
} from "@/app/purchase/orders/actions";
import { cn } from "@/lib/purchase/cn";
import { timeAgoMini } from "@/lib/purchase/format";
import type { FormMasters, OrderDoc } from "@/lib/purchase/orders/form-load";
import { fieldErrorsOf, orderFormSchema, type ActionResult } from "@/lib/purchase/orders/form-schema";
import type { PoAction } from "@/lib/purchase/orders/workflow";
import { orderNewPath, orderPath, orderPrintPath, PURCHASE_PATHS, receiptNewPath } from "@/lib/purchase/routes";
import { useCompose } from "../activity/compose";
import { listViewKey } from "../list/RememberListView";
import { usePopover } from "../ui/usePopover";
import { FormContext, useFormState, type FormCtx } from "./context";
import { DetailsTab } from "./DetailsTab";
import { ConfirmDialog } from "./Grid";
import { AddressTab, ConnectionsTab, DropShipTab, MoreInfoTab, TermsTab } from "./OtherTabs";
import { JumpToField } from "./JumpToField";
import { dropEmptyRows } from "./rows";
import { useTriggers } from "./triggers";
import { UpdateItemsDialog } from "./UpdateItemsDialog";

type Tab = "details" | "address" | "dropship" | "terms" | "more" | "connections";

const TAB_OF: [RegExp, Tab][] = [
  [/^(supplierAddress|contactPerson|shippingAddress|billingAddress|placeOfSupply)/, "address"],
  [/^(customer|customerContactPerson)/, "dropship"],
  [/^(paymentSchedule|paymentTermsTemplate|termsTemplate|terms)/, "terms"],
  [/^(letterHead|selectPrintHeading|language|groupSameItems)/, "more"],
];
const tabOf = (key: string): Tab => TAB_OF.find(([re]) => re.test(key))?.[1] ?? "details";

const PILL = {
  orange: "bg-[#fff5e6] text-[#b45309]",
  green: "bg-[#e4f5e9] text-[#16794c]",
  red: "bg-[#fff0f0] text-[#cc2929]",
  gray: "bg-gray-100 text-gray-700",
} as const;

export function OrderForm({
  doc,
  masters,
  allowed: allowedList,
  userEmail,
  sidebar,
  footer,
  canEmail = false,
  userId,
}: {
  doc: OrderDoc;
  masters: FormMasters;
  allowed: PoAction[];
  userEmail: string;
  /** The signed-in user's id: ‹ › follow the list as this user last left it. */
  userId?: string;
  /** A saved PO's sidebar (attachments, who created and edited it). */
  sidebar?: ReactNode;
  /** A saved PO's comment box and timeline, below the tabs. */
  footer?: ReactNode;
  /** May this user email the PO (New Email)? */
  canEmail?: boolean;
}) {
  const allowed = useMemo(() => new Set(allowedList), [allowedList]);
  const f = useFormState(doc, masters, allowed);
  const t = useTriggers(f);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { message: string; yes: string; run: () => Promise<void> }>(null);
  const [holding, setHolding] = useState(false);
  const [updatingItems, setUpdatingItems] = useState(false);
  const [jumping, setJumping] = useState(false);
  const formRoot = useRef<HTMLDivElement>(null);
  const isNew = !doc.id;

  const req = useCallback(() => ({ id: doc.id!, expectedUpdatedAt: doc.updatedAt ?? undefined }), [doc.id, doc.updatedAt]);

  const showErrors = useCallback((r: { error: string; fieldErrors?: Record<string, string> }) => {
    const fe = r.fieldErrors ?? {};
    f.setErrors(fe);
    const first = Object.keys(fe)[0];
    if (first) setTab(tabOf(first));
    toast.error(r.error === "Some fields need attention." && first ? fe[first] : r.error);
  }, [f]);

  const save = useCallback(async () => {
    if (busy) return;
    const empty = { items: [] as number[] };
    f.values.items.forEach((r, i) => {
      if (!(r.itemCode || r.scheduleDate || Number(r.rate) || r.uom)) empty.items.push(i);
    });
    const values = dropEmptyRows(f.values);
    if (empty.items.length) f.removeRows("items", empty.items);
    const parsed = orderFormSchema.safeParse(values);
    if (!parsed.success) return showErrors({ error: "Some fields need attention.", fieldErrors: fieldErrorsOf(parsed.error) });
    setBusy("save");
    try {
      const r = await saveOrderAction({ id: doc.id ?? undefined, expectedUpdatedAt: doc.updatedAt ?? undefined, amendedFromId: isNew ? doc.amendedFrom?.id : undefined, values });
      if (!r.ok) return showErrors(r);
      f.markClean();
      toast.success("Saved");
      if (isNew) router.replace(orderPath(r.value.id));
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }, [busy, f, doc.id, doc.updatedAt, doc.amendedFrom, isNew, router, showErrors]);

  const update = useCallback(async () => {
    if (busy || !doc.id) return;
    setBusy("update");
    try {
      const v = f.values;
      const r = await updateSubmittedOrderAction(req(), {
        scheduleDate: v.scheduleDate ?? null,
        letterHead: v.letterHead ?? null,
        selectPrintHeading: v.selectPrintHeading ?? null,
        groupSameItems: Boolean(v.groupSameItems),
        items: v.items.map((row, i) => ({ id: row.id!, scheduleDate: row.scheduleDate, expectedDeliveryDate: row.expectedDeliveryDate ?? null, pageBreak: f.rowInfo[i]?.pageBreak ?? false })),
      });
      if (!r.ok) return showErrors(r);
      f.markClean();
      toast.success("Updated");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [busy, doc.id, f, req, router, showErrors]);

  /** Runs a workflow action and reloads the PO. */
  const act = useCallback(async (name: string, run: () => Promise<ActionResult>, done: string, after?: () => void) => {
    setBusy(name);
    try {
      const r = await run();
      if (!r.ok) return showErrors(r);
      toast.success(done);
      if (after) after();
      else router.refresh();
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }, [router, showErrors]);

  // New Email, from the ⋯ menu or Ctrl+E: a saved PO that is not cancelled, for a user who may email.
  const compose = useCompose();
  const openEmail = canEmail && compose && !isNew && doc.docStatus !== "Cancelled" ? () => compose.open() : null;

  /** ‹ ›: the next or previous PO in the list as this user last left it (ERPNext's get_next). */
  const navigate = useCallback(async (prev: boolean) => {
    if (!doc.id) return;
    let search = "";
    try {
      search = (userId && window.localStorage.getItem(listViewKey(userId))) || "";
    } catch {
      /* no saved list view: the list's own default order */
    }
    const r = await adjacentOrderAction(doc.id, prev, search);
    if (!r.ok) return void toast(r.error);
    router.push(orderPath(r.value.id));
  }, [doc.id, userId, router]);

  /** ⋯ › Copy to Clipboard: the PO as data (Frappe copied the document as JSON). */
  const copyToClipboard = useCallback(async () => {
    const data = { doctype: "Purchase Order", name: doc.number, docstatus: doc.docStatus, workflow_state: doc.workflowState, status: doc.status, ...f.values };
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 1));
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("The browser did not allow copying to the clipboard.");
    }
  }, [doc.number, doc.docStatus, doc.workflowState, doc.status, f.values]);

  /** Tools › Update Rate as per Last Purchase: each row's rates from the item's last purchase (lib/purchase/orders/last-purchase.ts). */
  const updateRates = useCallback(async () => {
    setBusy("rates");
    try {
      const rows = f.values.items.map((row) => ({ itemCode: row.itemCode || null, conversionFactor: Number(row.conversionFactor) || 1 }));
      const r = await lastPurchaseRatesAction(rows, doc.number ?? null, Number(f.values.conversionRate) || 1);
      if (!r.ok) return void toast.error(r.error);
      r.value.forEach((rates, i) => {
        if (rates) f.setRow("items", i, { priceListRate: rates.priceListRate, discountPercentage: rates.discountPercentage, discountAmount: 0, rate: rates.rate });
      });
    } finally {
      setBusy(null);
    }
  }, [f, doc.number]);

  /** ⋯ › Links: the documents linked with this PO, on its Connections tab. */
  const showLinks = useCallback(() => {
    setTab("connections");
    window.setTimeout(() => formRoot.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }, []);

  // Ctrl+S saves (or updates), Ctrl+E opens New Email, Ctrl+J Jump to field, as in Frappe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (f.editable && (isNew || f.dirty)) void save();
        else if (f.updatable && f.dirty) void update();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e" && openEmail) {
        e.preventDefault();
        openEmail();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setJumping(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [f.editable, f.updatable, f.dirty, isNew, save, update, openEmail]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!f.dirty && !(isNew && f.editable)) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!f.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [f.dirty, isNew, f.editable]);

  const title = isNew ? (doc.amendedFrom ? f.displays.supplierName ?? "New Purchase Order" : "New Purchase Order") : f.displays.supplierName ?? doc.number ?? "";
  const pill = isNew || f.dirty
    ? { label: "Not Saved", colour: "orange" as const }
    : doc.docStatus === "Cancelled"
      ? { label: "Cancelled", colour: "red" as const }
      : { label: doc.workflowState, colour: doc.workflowState === "Approved" ? ("green" as const) : doc.workflowState === "Rejected" ? ("red" as const) : ("gray" as const) };
  const showDropShip = doc.docStatus === "Draft" || Boolean(f.values.customer);
  const tabs: [Tab, string][] = [
    ["details", "Details"],
    ["address", "Address & Contact"],
    ...(showDropShip ? ([["dropship", "Drop Ship"]] as [Tab, string][]) : []),
    ["terms", "Terms"],
    ["more", "More Info"],
    ...(isNew ? [] : ([["connections", "Connections"]] as [Tab, string][])),
  ];

  return (
    <FormContext.Provider value={f}>
      <div className="mb-4">
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-gray-500">
          <span>Buying</span>
          <span aria-hidden>›</span>
          <a href={PURCHASE_PATHS.orders} className="hover:text-gray-800">Purchase Order</a>
          <span aria-hidden>›</span>
          <span className="text-gray-700">{doc.number ?? (doc.amendedFrom ? `New Purchase Order (amending ${doc.amendedFrom.number})` : "New Purchase Order")}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">{title}</h1>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", PILL[pill.colour])}>
              <span aria-hidden>•</span>
              {pill.label}
            </span>
          </div>
          <Buttons
            f={f}
            isNew={isNew}
            busy={busy}
            onSave={save}
            onUpdate={update}
            onApprove={() => act("approve", () => approveOrderAction(req()), "Approved")}
            onReject={() => act("reject", () => rejectOrderAction(req()), "Rejected")}
            onCancel={() => setConfirm({ message: `Permanently Cancel ${doc.number}?`, yes: "Yes", run: () => act("cancel", () => cancelOrderAction(req()), "Cancelled") })}
            onClose={() => act("close", () => closeOrderAction(req()), "Closed")}
            onHold={() => setHolding(true)}
            onResume={() => act("resume", () => resumeOrderAction(req()), "Resumed")}
            onReopen={() => act("reopen", () => reopenOrderAction(req()), "Re-opened")}
            onAmend={() => router.push(orderNewPath({ amend: doc.id! }))}
            onDuplicate={() => router.push(orderNewPath({ duplicate: doc.id! }))}
            onDelete={() => setConfirm({ message: `Permanently delete ${doc.number}?`, yes: "Yes", run: () => act("delete", () => deleteOrderAction(req()), "Deleted", () => router.push(PURCHASE_PATHS.orders)) })}
            onReload={() => router.refresh()}
            onNew={() => router.push(PURCHASE_PATHS.orderNew)}
            onEmail={openEmail ?? undefined}
            onUpdateItems={() => setUpdatingItems(true)}
            onPrev={() => void navigate(true)}
            onNext={() => void navigate(false)}
            onPrint={() => doc.id && router.push(orderPrintPath(doc.id))}
            onJump={() => setJumping(true)}
            onLinks={showLinks}
            onCopy={() => void copyToClipboard()}
            onUpdateRates={() => void updateRates()}
            onMakeReceipt={() => doc.id && router.push(receiptNewPath(doc.id))}
          />
        </div>
      </div>

      {/* The old form's layout: the sidebar on the left, the tabs and, below them, the comments and
          timeline. On a narrow screen they stack: tabs, sidebar, comments. */}
      <div className={cn(sidebar && "grid gap-x-6 lg:grid-cols-[13rem_minmax(0,1fr)]")}>
      <div ref={formRoot} className={cn("po-card", sidebar && "min-w-0 lg:col-start-2 lg:row-start-1")}>
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-3 sm:px-4" role="tablist">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={cn("whitespace-nowrap border-b-2 px-2.5 py-3 text-[13px]", tab === key ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800")}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div hidden={tab !== "details"} data-po-tab="details"><DetailsTab t={t} /></div>
        <div hidden={tab !== "address"} data-po-tab="address"><AddressTab t={t} /></div>
        {showDropShip && <div hidden={tab !== "dropship"} data-po-tab="dropship"><DropShipTab t={t} /></div>}
        <div hidden={tab !== "terms"} data-po-tab="terms"><TermsTab t={t} /></div>
        <div hidden={tab !== "more"} data-po-tab="more"><MoreInfoTab /></div>
        {!isNew && <div hidden={tab !== "connections"} data-po-tab="connections"><ConnectionsTab /></div>}
      </div>
      {sidebar && <aside className="mt-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0" aria-label="Sidebar">{sidebar}</aside>}
      {footer && <div className="min-w-0 lg:col-start-2 lg:row-start-2">{footer}</div>}
      </div>

      {!isNew && !footer && (
        <p className="mt-4 px-1 text-xs text-gray-500">
          {doc.updatedBy && doc.updatedAt && (
            <span>
              {doc.updatedBy === userEmail ? "You" : doc.updatedBy} edited this · {timeAgoMini(doc.updatedAt)}
            </span>
          )}
          {doc.createdBy && doc.createdAt && (
            <span>
              {" "}• {doc.createdBy === userEmail ? "You" : doc.createdBy} created this · {timeAgoMini(doc.createdAt)}
            </span>
          )}
        </p>
      )}

      {confirm && <ConfirmDialog message={confirm.message} yesLabel={confirm.yes} busy={Boolean(busy)} onNo={() => setConfirm(null)} onYes={() => void confirm.run()} />}
      {jumping && <JumpToField root={formRoot.current} onTab={(key) => setTab(key as Tab)} onClose={() => setJumping(false)} />}
      {updatingItems && (
        <UpdateItemsDialog
          busy={busy === "updateItems"}
          onClose={() => setUpdatingItems(false)}
          onUpdate={(rows) => act("updateItems", () => updateOrderItemsAction(req(), rows), "Items updated", () => {
            setUpdatingItems(false);
            router.refresh();
          })}
        />
      )}
      {holding && (
        <HoldDialog
          busy={busy === "hold"}
          onClose={() => setHolding(false)}
          onHold={(reason) => act("hold", () => holdOrderAction(req(), reason), "On Hold", () => {
            setHolding(false);
            router.refresh();
          })}
        />
      )}
    </FormContext.Provider>
  );
}

function Buttons(p: {
  f: FormCtx;
  isNew: boolean;
  busy: string | null;
  onSave: () => void;
  onUpdate: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onClose: () => void;
  onHold: () => void;
  onResume: () => void;
  onReopen: () => void;
  onAmend: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReload: () => void;
  onNew: () => void;
  /** Opens New Email (absent when the user may not email). */
  onEmail?: () => void;
  onUpdateItems: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPrint: () => void;
  onJump: () => void;
  onLinks: () => void;
  onCopy: () => void;
  onUpdateRates: () => void;
  onMakeReceipt: () => void;
}) {
  const { f, isNew, busy } = p;
  const a = f.allowed;
  const doc = f.doc;
  const spin = (name: string) => busy === name && <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  const actions = !isNew && !f.dirty && doc.docStatus === "Draft" ? [a.has("approve") && { label: "Approve", run: p.onApprove }, a.has("reject") && { label: "Reject", run: p.onReject }].filter(Boolean) as { label: string; run: () => void }[] : [];
  const status = doc.docStatus === "Submitted"
    ? ([
        a.has("hold") && { label: "Hold", run: p.onHold },
        a.has("resume") && { label: "Resume", run: p.onResume },
        a.has("close") && { label: "Close", run: p.onClose },
        a.has("reopen") && { label: "Re-open", run: p.onReopen },
      ].filter(Boolean) as { label: string; run: () => void }[])
    : [];
  // Frappe's ⋯ menu, in its order (form/toolbar.js). Customize, Repeat and Send SMS are not offered.
  const more = [
    !isNew && { label: "Print", run: p.onPrint },
    // Email (Ctrl+E) for a saved PO that is not cancelled.
    !isNew && p.onEmail && doc.docStatus !== "Cancelled" && { label: "Email", run: p.onEmail },
    { label: "Jump to field", run: p.onJump },
    !isNew && { label: "Links", run: p.onLinks },
    !isNew && a.has("duplicate") && { label: "Duplicate", run: p.onDuplicate },
    !isNew && { label: "Copy to Clipboard", run: p.onCopy },
    !isNew && { label: "Reload", run: p.onReload },
    !isNew && a.has("delete") && { label: "Delete", run: p.onDelete, danger: true },
    f.allowed.has("save") || isNew ? { label: "New Purchase Order", run: p.onNew } : null,
  ].filter(Boolean) as { label: string; run: () => void; danger?: boolean }[];
  // purchase_order.js: Tools on a draft (Link to Material Request belongs to Material Requests, not in this module).
  const tools = doc.docStatus === "Draft" && f.editable ? [{ label: "Update Rate as per Last Purchase", run: p.onUpdateRates }] : [];
  // purchase_order.js: Create › Purchase Receipt on a submitted PO still to be received (the Create group is the primary button).
  const create = doc.docStatus === "Submitted" && a.has("makeReceipt") && !f.dirty ? [{ label: "Purchase Receipt", run: p.onMakeReceipt }] : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {doc.docStatus === "Submitted" && a.has("updateItems") && !f.dirty && (
        <button type="button" className="po-btn-secondary" disabled={Boolean(busy)} onClick={p.onUpdateItems}>
          Update Items
        </button>
      )}
      {tools.length > 0 && <Menu label="Tools" items={tools} disabled={Boolean(busy)} busy={busy === "rates"} />}
      {status.length > 0 && !f.dirty && <Menu label="Status" items={status} disabled={Boolean(busy)} />}
      {create.length > 0 && <Menu label="Create" items={create} disabled={Boolean(busy)} />}
      {!isNew && doc.id && (
        <>
          <button type="button" className="po-btn-secondary px-2" aria-label="Previous Document" title="Previous Document" onClick={p.onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="po-btn-secondary px-2" aria-label="Next Document" title="Next Document" onClick={p.onNext}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <Link href={orderPrintPath(doc.id)} className="po-btn-secondary px-2.5" aria-label="Print" title="Print">
            <Printer className="h-4 w-4" />
          </Link>
        </>
      )}
      {more.length > 0 && <Menu icon items={more} disabled={Boolean(busy)} />}
      {doc.docStatus === "Submitted" && a.has("cancel") && !f.dirty && (
        <button type="button" className="po-btn-secondary" disabled={Boolean(busy)} onClick={p.onCancel}>
          {spin("cancel")} Cancel
        </button>
      )}
      {(isNew || (doc.docStatus === "Draft" && f.dirty)) && f.editable && (
        <button type="button" className="po-btn-primary" disabled={Boolean(busy)} onClick={p.onSave}>
          {spin("save")} Save
        </button>
      )}
      {doc.docStatus === "Submitted" && f.dirty && f.updatable && (
        <button type="button" className="po-btn-primary" disabled={Boolean(busy)} onClick={p.onUpdate}>
          {spin("update")} Update
        </button>
      )}
      {actions.length > 0 && <Menu label="Actions" primary items={actions} disabled={Boolean(busy)} busy={busy === "approve" || busy === "reject"} />}
      {doc.docStatus === "Cancelled" && a.has("amend") && !doc.amendment && (
        <button type="button" className="po-btn-primary" disabled={Boolean(busy)} onClick={p.onAmend}>
          Amend
        </button>
      )}
    </div>
  );
}

function Menu({ label, icon, items, primary, disabled, busy }: { label?: string; icon?: boolean; items: { label: string; run: () => void; danger?: boolean }[]; primary?: boolean; disabled?: boolean; busy?: boolean }) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cn(primary ? "po-btn-primary" : "po-btn-secondary", icon && "px-2.5")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={icon ? "More actions" : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {icon ? <MoreHorizontal className="h-4 w-4" /> : <>{label} <ChevronDown className="h-3.5 w-3.5" /></>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={cn("block w-full px-3 py-1.5 text-left text-[13px] hover:bg-gray-50", it.danger ? "text-red-600" : "text-gray-800")}
              onClick={() => {
                setOpen(false);
                it.run();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The original's "Reason for Hold" dialog (a required text, kept as a comment on the PO). */
function HoldDialog({ onHold, onClose, busy }: { onHold: (reason: string) => void; onClose: () => void; busy: boolean }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" role="dialog" aria-modal="true" aria-label="Reason for Hold" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-3 text-[15px] font-semibold text-gray-900">Reason for Hold</div>
        <div className="px-5 py-4">
          <label className="mb-1 block text-xs text-gray-600">
            Reason For Hold<span className="ml-0.5 text-red-500">*</span>
          </label>
          <textarea className={cn("block w-full rounded-md border bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] outline-none focus:bg-white", error ? "border-red-400" : "border-transparent")} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          {error && <p className="mt-1 text-[11px] text-red-600">Reason for Hold is required</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" className="po-btn-secondary" onClick={onClose} disabled={busy}>Close</button>
          <button
            type="button"
            className="po-btn-primary"
            disabled={busy}
            onClick={() => {
              if (!reason.trim()) return setError(true);
              onHold(reason.trim());
            }}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Submit
          </button>
        </div>
      </div>
    </div>
  );
}
