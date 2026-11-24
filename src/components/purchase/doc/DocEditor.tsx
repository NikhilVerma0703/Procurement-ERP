"use client";

// A master of Stock › Items and Pricing in its form (owner, 24-11-2026): the old form drawn from its
// captured layout by DocumentForm, with the DocType's form script (lib/purchase/doc/master-form.ts):
// what each link searches, what choosing one fetches, the mandatory and option toggles, the custom
// buttons ("Item Group Tree", "Items", "Add / Edit Prices"). Save (Ctrl+S) sends the whole document;
// the server keeps only what may be typed and works out the rest again (doc/doc-save.ts). ⋯ holds
// Reload, Delete and New, as the old form's menu did.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { deleteDocAction, fetchLinkedAction, saveDocAction } from "@/app/purchase/doc-actions";
import { ConfirmDialog } from "@/components/purchase/form/Grid";
import { usePopover } from "@/components/purchase/ui/usePopover";
import type { DoctypeLayout, LayoutField } from "@/lib/purchase/doc/layout";
import { docIndicator } from "@/lib/purchase/doc/list-view";
import { afterChange, effectiveLayout, fetchesFor, formRules, lookupFor, mayType, newChildRow } from "@/lib/purchase/doc/master-form";
import type { DocScreenKey } from "@/lib/purchase/doc/screens";
import type { ChildLayouts } from "@/lib/purchase/doc/visible";
import { DocumentForm, type FormBinding } from "./DocumentForm";
import { IndicatorPill } from "./IndicatorPill";

type Doc = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const rowsOf = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);

export function DocEditor(props: {
  screenKey: DocScreenKey;
  doctype: string;
  card: string;
  listPath: string;
  id: string | null;
  initial: Doc;
  /** The stored record's "modified" (the server refuses a save over a newer one). */
  modified: string | null;
  layout: DoctypeLayout;
  childLayouts: ChildLayouts;
  prev: string | null;
  next: string | null;
  buttons: { label: string; href: string }[];
  /** "<DocType>\u0000<name>" → the page of a linked record. */
  hrefs: Record<string, string>;
  canWrite: boolean;
}) {
  const { id, doctype, layout, childLayouts } = props;
  const router = useRouter();
  const [doc, setDoc] = useState<Doc>(props.initial);
  const docRef = useRef(doc);
  const [dirty, setDirty] = useState(!id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, startBusy] = useTransition();
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const modifiedRef = useRef(props.modified);
  const menu = usePopover<HTMLDivElement>();
  const isNew = !id;
  const rules = formRules(doctype, doc, isNew);
  const readOnly = !props.canWrite || rules.readOnly;
  const shownLayout = useMemo(() => effectiveLayout(layout, doc, isNew), [layout, doc, isNew]);
  const name = str(doc.name) || null;

  const update = useCallback((fn: (d: Doc) => Doc) => {
    const next = fn(docRef.current);
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  }, []);

  /** Choosing a link fills its fetch_from / add_fetch fields from the linked record. */
  async function fetchFor(target: { table: string | null; index: number }, l: DoctypeLayout, linkField: LayoutField, value: string) {
    const wanted = fetchesFor(l.doctype, l, linkField.fieldname);
    if (!wanted.length || !linkField.options) return;
    const clear = Object.fromEntries(wanted.map((w) => [w.target, ""]));
    const apply = (values: Doc) =>
      update((d) => {
        if (target.table === null) return str(d[linkField.fieldname]) === value ? { ...d, ...values } : d;
        return {
          ...d,
          [target.table]: rowsOf(d[target.table]).map((r, k) => (k === target.index && str(r[linkField.fieldname]) === value ? { ...r, ...values } : r)),
        };
      });
    if (!value) return apply(clear);
    const r = await fetchLinkedAction(linkField.options, value, wanted.map((w) => w.source));
    if (!r.ok) return toast.error(r.error);
    if (!r.value) return;
    const got = r.value;
    apply(Object.fromEntries(wanted.map((w) => [w.target, got[w.source] ?? ""])));
  }

  const binding: FormBinding = {
    editable: (table, f, row) => {
      if (readOnly) return false;
      if (table === null && rules.locked.has(f.fieldname)) return false;
      return mayType(f, row ?? docRef.current, table === null ? undefined : docRef.current);
    },
    lookup: (table, f, row) => {
      const l = lookupFor(doctype, table, f, docRef.current, row);
      return l ? { type: l.type, params: l.params ?? undefined } : null;
    },
    setField: (fieldname, value) => {
      update((d) => afterChange(doctype, { ...d, [fieldname]: value }, fieldname));
      setErrors(({ [fieldname]: _gone, ...rest }) => (void _gone, rest));
      const f = layout.fields.find((x) => x.fieldname === fieldname);
      if (f?.fieldtype === "Link") void fetchFor({ table: null, index: -1 }, layout, f, str(value));
    },
    setCell: (table, index, fieldname, value) => {
      update((d) => ({ ...d, [table]: rowsOf(d[table]).map((r, k) => (k === index ? { ...r, [fieldname]: value } : r)) }));
      const tf = layout.fields.find((x) => x.fieldname === table);
      const child = tf ? childLayouts[tf.options ?? ""] : undefined;
      const f = child?.fields.find((x) => x.fieldname === fieldname);
      if (child && f?.fieldtype === "Link") void fetchFor({ table, index }, child, f, str(value));
    },
    addRow: (table) => {
      const tf = layout.fields.find((x) => x.fieldname === table);
      const child = tf ? childLayouts[tf.options ?? ""] : undefined;
      if (!child) return;
      update((d) => ({ ...d, [table]: [...rowsOf(d[table]), newChildRow(child, rowsOf(d[table]).length + 1)] }));
    },
    deleteRows: (table, indexes) => update((d) => ({ ...d, [table]: rowsOf(d[table]).filter((_, i) => !indexes.includes(i)).map((r, i) => ({ ...r, idx: i + 1 })) })),
    errors,
  };

  const save = () =>
    startBusy(async () => {
      const r = await saveDocAction(props.screenKey, { id, doc: docRef.current, modified: modifiedRef.current });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      setErrors({});
      setDirty(false);
      modifiedRef.current = r.value.modified;
      toast.success("Saved");
      if (!id) router.replace(`${props.listPath}/${encodeURIComponent(r.value.id)}`);
      else router.refresh();
    });

  const remove = () =>
    setConfirm({
      message: `Permanently delete ${name}?`,
      run: () =>
        startBusy(async () => {
          const r = await deleteDocAction(props.screenKey, id!);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Deleted");
          router.push(props.listPath);
        }),
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !readOnly) {
        e.preventDefault();
        if (!busy) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    if (!dirty || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  const saved = docIndicator(layout, doc);
  const pill = dirty && !readOnly ? { label: "Not Saved", colour: "orange" as const } : saved;
  // The form's title: its title field (an Item Price's item name), else its name (frm.get_title).
  const title = (layout.titleField && !isNew && str(doc[layout.titleField])) || (name ?? `New ${doctype}`);

  return (
    <>
      <div className="mb-4">
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-gray-500">
          <span>Stock</span>
          <span aria-hidden>›</span>
          <Link href={props.listPath} className="hover:text-gray-800">{doctype}</Link>
          <span aria-hidden>›</span>
          <span className="text-gray-700">{name ?? "New"}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">{title}</h1>
            {pill && <IndicatorPill label={pill.label} colour={pill.colour} />}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {props.buttons.map((b) => (
              <Link key={b.label} href={b.href} className="po-btn-secondary">{b.label}</Link>
            ))}
            {id && props.prev && (
              <Link href={`${props.listPath}/${encodeURIComponent(props.prev)}`} className="po-btn-secondary px-2" title="Previous Document" aria-label="Previous Document"><ChevronLeft className="h-4 w-4" /></Link>
            )}
            {id && props.next && (
              <Link href={`${props.listPath}/${encodeURIComponent(props.next)}`} className="po-btn-secondary px-2" title="Next Document" aria-label="Next Document"><ChevronRight className="h-4 w-4" /></Link>
            )}
            {id && (
              <div ref={menu.ref} className="relative">
                <button type="button" className="po-btn-secondary px-2" aria-label="Menu" aria-expanded={menu.open} onClick={() => menu.setOpen(!menu.open)}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menu.open && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg" role="menu">
                    <MenuItem onClick={() => { menu.setOpen(false); router.refresh(); }}>Reload</MenuItem>
                    {props.canWrite && !rules.readOnly && <MenuItem onClick={() => { menu.setOpen(false); remove(); }}>Delete</MenuItem>}
                    {props.canWrite && <MenuItem onClick={() => { menu.setOpen(false); router.push(`${props.listPath}/new`); }}>New {doctype}</MenuItem>}
                  </div>
                )}
              </div>
            )}
            {!readOnly && (dirty || !id) && (
              <button type="button" className="po-btn-primary" disabled={busy} onClick={save} title="Save (Ctrl+S)">{busy ? "Saving…" : "Save"}</button>
            )}
          </div>
        </div>
      </div>
      {rules.readOnly && (
        <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[13px] text-blue-800">This is a root item group and cannot be edited.</div>
      )}
      <section className="po-card">
        <DocumentForm
          layout={shownLayout}
          childLayouts={childLayouts}
          doc={doc}
          binding={binding}
          options={{
            currency: str(doc.currency) || "INR",
            href: (_table, f, value) => (f.options ? props.hrefs[`${f.options}\u0000${value}`] ?? null : null),
          }}
        />
      </section>
      {confirm && <ConfirmDialog message={confirm.message} busy={busy} onNo={() => setConfirm(null)} onYes={() => { const c = confirm; setConfirm(null); c.run(); }} />}
    </>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={onClick}>
      {children}
    </button>
  );
}
