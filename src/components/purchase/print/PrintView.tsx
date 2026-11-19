"use client";

// The PO's print view, as the old form's printer icon opened it: the sheet in
// the chosen layout (Print Format), a PDF button that saves it and a Print
// button that prints it. The sheet itself is the server's PDF
// (api/purchase/orders/[id]/pdf).
import { Download, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { orderPdfPath } from "@/lib/purchase/routes";

export function PrintView({ id, layouts, initial }: { id: string; layouts: readonly string[]; initial: string }) {
  const [format, setFormat] = useState(initial);
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <div className="space-y-3">
      <div className="po-card flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          Print Format
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] text-gray-900"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {layouts.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <a className="po-btn-secondary" href={orderPdfPath(id, { format, download: true })}>
            <Download className="h-4 w-4" aria-hidden /> PDF
          </a>
          <button
            type="button"
            className="po-btn-primary"
            onClick={() => {
              try {
                frame.current?.contentWindow?.focus();
                frame.current?.contentWindow?.print();
              } catch {
                window.open(orderPdfPath(id, { format }), "_blank", "noopener");
              }
            }}
          >
            <Printer className="h-4 w-4" aria-hidden /> Print
          </button>
        </div>
      </div>
      <iframe ref={frame} key={format} src={orderPdfPath(id, { format })} title="Purchase Order sheet" className="h-[78vh] w-full rounded-card border border-gray-200 bg-white" />
    </div>
  );
}
