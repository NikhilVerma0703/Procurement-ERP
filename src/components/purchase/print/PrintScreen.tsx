"use client";

// The print view, as the old site's (Frappe 14 /app/print/<DocType>/<name>, read 26-11-2026; owner:
// "Along with the Print option, provide these two options … Full Page … Refresh Page"):
//
//   * on the right of the heading: Full Page (the printed page alone, in a new tab), Refresh (draw it
//     again from the record as it is now), the form's icon (back to the record), ⋯ (Full Page, PDF,
//     Refresh) and Print;
//   * on the left: Print Format (the DocType's formats, its default first), Language (English: the old
//     site printed in English), Letter Head (Logo, its only one) and Print Settings' three options —
//     Compact Item Print, Print UOM after Quantity, Print taxes with zero amount (off, as they were);
//     the options and the letter head change only Frappe's Standard format, as on the old site;
//   * the printed page on Frappe's grey background.
//
// Print prints the page alone (the browser's dialog also saves it as a PDF). PDF downloads the server's
// PDF where the record has one (the PO sheets), else opens the same print dialog.
import Link from "next/link";
import { FileText, Maximize2, MoreHorizontal, Printer, RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/purchase/cn";
import { usePopover } from "../ui/usePopover";

export interface PrintScreenProps {
  /** The page that draws the record in a format (an HTML page of this app). */
  pageBase: string;
  formats: readonly string[];
  initial: string;
  /** The record's own page. */
  formHref: string;
  /** The server's PDF of the record in a format, where there is one. */
  pdfBase?: string | null;
  /** The heading: crumbs and the record's name. */
  crumbs: readonly string[];
  title: string;
}

const OPTIONS = [
  ["compact_item_print", "Compact Item Print"],
  ["print_uom_after_quantity", "Print UOM after Quantity"],
  ["print_taxes_with_zero_amount", "Print taxes with zero amount"],
] as const;

const withQuery = (base: string, q: Record<string, string>) => `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`;

export function PrintScreen(p: PrintScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [format, setFormat] = useState(p.initial);
  const [letterhead, setLetterhead] = useState("Logo");
  const [opts, setOpts] = useState<Record<string, boolean>>({});
  const [version, setVersion] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const menu = usePopover<HTMLDivElement>();

  const query = useMemo(() => {
    const q: Record<string, string> = { format, letterhead };
    for (const [k] of OPTIONS) if (opts[k]) q[k] = "1";
    return q;
  }, [format, letterhead, opts]);
  const pageHref = withQuery(p.pageBase, query);

  const choose = (f: string) => {
    setFormat(f);
    setHeight(null);
    // The address keeps the choice: a reload or a shared link opens the same format.
    router.replace(`${pathname}?${new URLSearchParams({ format: f })}`, { scroll: false });
  };
  const fullPage = () => window.open(pageHref, "_blank", "noopener");
  const refresh = () => {
    setHeight(null);
    setVersion((v) => v + 1);
  };
  const print = () => {
    frame.current?.contentWindow?.focus();
    frame.current?.contentWindow?.print();
  };
  const pdf = () => {
    if (p.pdfBase) window.location.href = withQuery(p.pdfBase, { format, download: "1" });
    else print();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-gray-500">
            {p.crumbs.join(" › ")}
          </nav>
          <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">{p.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="po-btn-secondary" onClick={fullPage}>
            <Maximize2 className="h-4 w-4" aria-hidden /> Full Page
          </button>
          <button type="button" className="po-btn-secondary" onClick={refresh}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </button>
          <Link href={p.formHref} className="po-btn-secondary px-2" title="Form" aria-label="Form">
            <FileText className="h-4 w-4" aria-hidden />
          </Link>
          <div ref={menu.ref} className="relative">
            <button type="button" className="po-btn-secondary px-2" title="Menu" aria-label="Menu" aria-haspopup="menu" aria-expanded={menu.open} onClick={() => menu.setOpen(!menu.open)}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
            {menu.open && (
              <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {(
                  [
                    ["Full Page", fullPage],
                    ["PDF", pdf],
                    ["Refresh", refresh],
                  ] as const
                ).map(([label, run]) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      menu.setOpen(false);
                      run();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="po-btn-primary" onClick={print}>
            <Printer className="h-4 w-4" aria-hidden /> Print
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="space-y-3 print:hidden">
          <label className="block">
            <span className="sr-only">Print Format</span>
            <select className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-[13px] text-gray-900" value={format} onChange={(e) => choose(e.target.value)} aria-label="Print Format">
              {p.formats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <select className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-[13px] text-gray-900" value="en" aria-label="Language" onChange={() => undefined}>
            <option value="en">English</option>
          </select>
          <select className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-[13px] text-gray-900" value={letterhead} aria-label="Select Letterhead" onChange={(e) => setLetterhead(e.target.value)}>
            <option value="Logo">Logo</option>
            <option value="">No Letterhead</option>
          </select>
          {OPTIONS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[12px] text-gray-700">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" checked={!!opts[key]} onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </aside>
        <div className={cn("rounded-card bg-[#d1d8dd]")}>
          <iframe
            ref={frame}
            key={`${pageHref}#${version}`}
            src={pageHref}
            title={`${p.title} print`}
            className="w-full rounded-card border-0"
            style={{ height: height ? `${height}px` : "78vh" }}
            onLoad={() => {
              const d = frame.current?.contentDocument;
              if (d?.documentElement) setHeight(d.documentElement.scrollHeight + 4);
            }}
          />
        </div>
      </div>
    </>
  );
}
