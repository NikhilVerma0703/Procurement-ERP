"use client";

// A receipt's print view: the Print Format choice, Print, and the printed receipt in a frame (the page
// api/purchase/receipts/[id]/print draws, on Frappe's grey print-view background). Print prints the
// frame alone; the browser's print dialog also saves it as a PDF.
import { Printer } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { receiptPrintHtmlPath } from "@/lib/purchase/routes";

export function ReceiptPrintView({ id, formats, initial }: { id: string; formats: readonly string[]; initial: string }) {
  const [format, setFormat] = useState(initial);
  const [height, setHeight] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const choose = (f: string) => {
    setFormat(f);
    setHeight(null);
    // The address keeps the choice, so a reload or a shared link opens the same format.
    router.replace(`${pathname}?format=${encodeURIComponent(f)}`, { scroll: false });
  };
  return (
    <div className="space-y-3">
      <div className="po-card flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          Print Format
          <select className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] text-gray-900" value={format} onChange={(e) => choose(e.target.value)}>
            {formats.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="po-btn-primary"
            onClick={() => {
              frame.current?.contentWindow?.focus();
              frame.current?.contentWindow?.print();
            }}
          >
            <Printer className="h-4 w-4" aria-hidden /> Print
          </button>
        </div>
      </div>
      <iframe
        ref={frame}
        key={format}
        src={receiptPrintHtmlPath(id, format)}
        title="Purchase Receipt print"
        className="w-full rounded-card border border-gray-200 bg-[#d1d8dd]"
        style={{ height: height ? `${height}px` : "78vh" }}
        onLoad={() => {
          const d = frame.current?.contentDocument;
          if (d?.documentElement) setHeight(d.documentElement.scrollHeight + 4);
        }}
      />
    </div>
  );
}
