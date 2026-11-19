"use client";

// Frappe's quick entry: "Add Supplier" on the list opened a dialog of the
// fields a new record needs ("New Supplier"), with Save and Edit Full Form.
// Saved from the list, the dialog closed and the list showed the new record;
// Edit Full Form opened the full form with what was typed (as Frappe carried
// the dialog's values over). Ctrl+S saves; Escape closes.
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { masterNewPath, type MasterKey } from "@/lib/purchase/routes";
import { SectionsView, useMasterValues } from "./MasterForm";
import { screenOf } from "./screens";

export function QuickEntryDialog({ master, onClose }: { master: MasterKey; onClose: () => void }) {
  const router = useRouter();
  const quick = screenOf(master).quick!;
  const [initial] = useState(quick.initial);
  const { values, errors, setErrors, set, latest } = useMasterValues(initial, quick.trigger);
  const [busy, setBusy] = useState(false);
  const doctype = quick.spec.doctype;

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await quick.save(latest.current);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success("Saved");
      for (const n of r.value.notices ?? []) toast.info(n);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, quick, latest, setErrors, onClose, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save, busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16" role="dialog" aria-modal="true" aria-labelledby="po-quick-title" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 id="po-quick-title" className="text-[15px] font-semibold text-gray-900">
            New {doctype}
          </h2>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" disabled={busy} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          <SectionsView spec={quick.spec} sections={quick.spec.tabs[0]!.sections} values={values} isNew editable={!busy} errors={errors} set={set} />
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" className="po-btn-secondary" disabled={busy} onClick={() => router.push(masterNewPath(master, quick.prefill(values)))}>
            Edit Full Form
          </button>
          <button type="button" className="po-btn-primary" disabled={busy} onClick={() => void save()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
