"use client";

// Frappe's Rename dialog ("Rename {name}"): the title field's new value where
// the doctype has one, and the new name. The record keeps its page (its id).
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { renameMasterAction } from "@/app/purchase/masters-actions";
import { inputClass } from "@/components/purchase/form/controls";
import type { MasterKey } from "@/lib/purchase/routes";

export function RenameDialog({ master, id, doctype, name, title, onClose }: {
  master: MasterKey;
  id: string;
  doctype: string;
  name: string;
  /** The title field (Item Name, Title), when the doctype has one apart from its name. */
  title?: { label: string; value: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState(name);
  const [newTitle, setNewTitle] = useState(title?.value ?? "");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await renameMasterAction(master, id, newName, title ? newTitle : null);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Saved");
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" role="dialog" aria-modal="true" aria-label={`Rename ${name}`} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="truncate text-[15px] font-semibold text-gray-900">Rename {name}</h2>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" disabled={busy} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          {title && (
            <label className="block">
              <span className="mb-1 block text-xs text-gray-600">New {title.label}</span>
              <input className={inputClass} value={newTitle} disabled={busy} onChange={(e) => setNewTitle(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs text-gray-600">
              New {doctype} Name<span className="ml-0.5 text-red-500">*</span>
            </span>
            <input className={inputClass} value={newName} disabled={busy} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </label>
          <div className="flex justify-end pt-1">
            <button type="submit" className="po-btn-primary" disabled={busy || !newName.trim()}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
