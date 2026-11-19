"use client";

// "Attach File", as the old uploader worked for a PO (Frappe 14 FileUploader,
// "My Device"): drop files or pick them, each private unless unticked, then
// Upload. Files go one by one to api/purchase/orders/[id]/attachments; the
// server checks the size (10 MB) and stores them. The uploader's Library,
// Link and Camera sources were never used on POs and are left out.
import { Loader2, Lock, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/purchase/cn";
import { PURCHASE_API_ROOT } from "@/lib/purchase/routes";

const MAX_BYTES = 10 * 1024 * 1024;

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function AttachDialog({ orderId, onClose, onUploaded }: { orderId: string; onClose: () => void; onUploaded: () => void }) {
  const [files, setFiles] = useState<{ file: File; isPrivate: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list).map((file) => ({ file, isPrivate: true }))]);
  };

  const upload = async () => {
    setBusy(true);
    let done = 0;
    try {
      for (const { file, isPrivate } of files) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: File size exceeded the maximum allowed size of 10.0 MB`);
          continue;
        }
        const body = new FormData();
        body.append("file", file);
        body.append("is_private", isPrivate ? "1" : "0");
        const res = await fetch(`${PURCHASE_API_ROOT}/orders/${encodeURIComponent(orderId)}/attachments`, { method: "POST", body });
        const r = (await res.json().catch(() => ({ ok: false, error: `Upload failed (${res.status}).` }))) as { ok: boolean; error?: string };
        if (r.ok) done++;
        else toast.error(`${file.name}: ${r.error ?? "Upload failed."}`);
      }
    } finally {
      setBusy(false);
    }
    if (done) onUploaded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" role="dialog" aria-modal="true" aria-labelledby="po-upload-title" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 id="po-upload-title" className="text-[15px] font-semibold text-gray-900">
            Upload
          </h2>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" disabled={busy} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div
            className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-gray-500", over ? "border-gray-500 bg-gray-50" : "border-gray-300")}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              add(e.dataTransfer.files);
            }}
          >
            <span>Drag and drop files here or upload from</span>
            <button type="button" className="po-btn-secondary" disabled={busy} onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden /> My Device
            </button>
            <input
              ref={input}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {files.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {files.map((f, i) => (
                <li key={`${f.file.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-gray-900">{f.file.name}</div>
                    <div className={cn("text-xs", f.file.size > MAX_BYTES ? "text-red-600" : "text-gray-500")}>{size(f.file.size)}</div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={f.isPrivate}
                      disabled={busy}
                      onChange={(e) => setFiles((all) => all.map((x, j) => (j === i ? { ...x, isPrivate: e.target.checked } : x)))}
                    />
                    <Lock className="h-3 w-3" aria-hidden /> Private
                  </label>
                  <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={`Remove ${f.file.name}`} disabled={busy} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" className="po-btn-primary" disabled={busy || files.length === 0} onClick={() => void upload()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}
