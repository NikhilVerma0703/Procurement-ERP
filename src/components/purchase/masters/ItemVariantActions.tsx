"use client";

// A template item's buttons, as item.js added them: View → Show Variants, and
// Create → Single Variant (a value for each attribute, then the new variant
// opens to be saved, as create_variant returned it unsaved) or Multiple
// Variants (values ticked per attribute; every new combination is saved).
import { ChevronDown, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createVariantsAction, variantCheckAction } from "@/app/purchase/items/actions";
import { cn } from "@/lib/purchase/cn";
import { masterPath, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { usePopover } from "../ui/usePopover";

type Choices = { attribute: string; values: { value: string; abbr: string }[] }[];

export function ItemVariantActions({ templateId, templateCode, choices, canCreate }: { templateId: string; templateCode: string; choices: Choices; canCreate: boolean }) {
  const [dialog, setDialog] = useState<"single" | "multiple" | null>(null);
  return (
    <>
      <Menu label="View" items={[{ label: "Show Variants", href: `${PURCHASE_PATHS.items}?variant_of=${encodeURIComponent(templateCode)}` }]} />
      {canCreate && (
        <Menu
          label="Create"
          items={[
            { label: "Single Variant", run: () => setDialog("single") },
            { label: "Multiple Variants", run: () => setDialog("multiple") },
          ]}
        />
      )}
      {dialog === "single" && <SingleVariant templateId={templateId} choices={choices} onClose={() => setDialog(null)} />}
      {dialog === "multiple" && <MultipleVariants templateId={templateId} choices={choices} onClose={() => setDialog(null)} />}
    </>
  );
}

function Menu({ label, items }: { label: string; items: { label: string; href?: string; run?: () => void }[] }) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  return (
    <div ref={ref} className="relative">
      <button type="button" className="po-btn-secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white py-1 text-[13px] shadow-lg" role="menu">
          {items.map((i) => (
            <li key={i.label}>
              {i.href ? (
                <Link href={i.href} role="menuitem" className="block px-3 py-1.5 text-gray-700 hover:bg-gray-50" onClick={() => setOpen(false)}>
                  {i.label}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setOpen(false);
                    i.run?.();
                  }}
                >
                  {i.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dialog({ title, onClose, busy, children, action, actionLabel, actionDisabled }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode; action: () => void; actionLabel: string; actionDisabled?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-20" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" disabled={busy} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4 text-[13px]">{children}</div>
        <div className="flex justify-end border-t border-gray-100 px-5 py-3">
          <button type="button" className="po-btn-primary" disabled={busy || actionDisabled} onClick={action}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SingleVariant({ templateId, choices, onClose }: { templateId: string; choices: Choices; onClose: () => void }) {
  const router = useRouter();
  const [args, setArgs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState<{ code: string; id: string } | null>(null);
  const create = async () => {
    setBusy(true);
    try {
      const r = await variantCheckAction(templateId, args);
      if (!r.ok) return void toast.error(r.error);
      if ("exists" in r.value) return void setExists({ code: r.value.exists, id: r.value.id });
      if ("error" in r.value) return void toast.error(r.value.error);
      const q = new URLSearchParams({ template: templateId });
      for (const [k, v] of Object.entries(args)) if (v) q.set(`attr:${k}`, v);
      router.push(`${PURCHASE_PATHS.items}/new?${q}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Create Variant" onClose={onClose} busy={busy} action={() => void create()} actionLabel="Create">
      {choices.map((c) => (
        <label key={c.attribute} className="block">
          <span className="mb-1 block text-xs text-gray-600">{c.attribute}</span>
          <select className="w-full rounded-md border border-transparent bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] focus:border-gray-300 focus:bg-white focus:outline-none" value={args[c.attribute] ?? ""} onChange={(e) => setArgs({ ...args, [c.attribute]: e.target.value })}>
            <option value="" />
            {c.values.map((v) => (
              <option key={v.value} value={v.value}>
                {v.value}
              </option>
            ))}
          </select>
        </label>
      ))}
      {exists && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
          Item Variant{" "}
          <Link href={masterPath("items", exists.id)} className="font-semibold underline">
            {exists.code}
          </Link>{" "}
          already exists with same attributes
        </p>
      )}
    </Dialog>
  );
}

function MultipleVariants({ templateId, choices, onClose }: { templateId: string; choices: Choices; onClose: () => void }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const lists = choices.map((c) => picked[c.attribute] ?? []).filter((l) => l.length);
  const count = lists.length ? lists.reduce((n, l) => n * l.length, 1) : 0;
  const toggle = (a: string, v: string) => setPicked((p) => ({ ...p, [a]: (p[a] ?? []).includes(v) ? (p[a] ?? []).filter((x) => x !== v) : [...(p[a] ?? []), v] }));
  const create = async () => {
    setBusy(true);
    try {
      const r = await createVariantsAction(templateId, picked);
      if (!r.ok) return void toast.error(r.error);
      for (const n of r.value.notices) toast.success(n);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Select Attribute Values" onClose={onClose} busy={busy} action={() => void create()} actionLabel={count === 1 ? "Create 1 Variant" : `Create ${count} Variants`} actionDisabled={!count}>
      <p className="text-gray-500">Select at least one value from each of the attributes.</p>
      {choices.map((c) => (
        <fieldset key={c.attribute}>
          <legend className="mb-1 text-xs font-semibold text-gray-700">{c.attribute}</legend>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {c.values.map((v) => (
              <label key={v.value} className={cn("flex items-center gap-2 py-0.5", busy ? "cursor-default" : "cursor-pointer")}>
                <input type="checkbox" className="h-3.5 w-3.5 accent-gray-800" disabled={busy} checked={(picked[c.attribute] ?? []).includes(v.value)} onChange={() => toggle(c.attribute, v.value)} />
                {v.value}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </Dialog>
  );
}
