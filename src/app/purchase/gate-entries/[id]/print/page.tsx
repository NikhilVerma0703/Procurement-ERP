import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { PrintButton } from "@/components/purchase/stock/PrintButton";
import { formatDate, formatFloat } from "@/lib/purchase/format";
import { sanitizeHtml } from "@/lib/purchase/html";
import { gateEntryPath } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { loadGateEntryDoc } from "@/lib/purchase/stock/gate-entries";

// A Gate Entry's print — the old site's "GATE ENTRY PRINT" (a print-designer format, captured in
// docs/reference/erpnext-setup/stock/print_formats/Gate Entry/GATE ENTRY PRINT.html): the heading
// "Gate Entry" and the entry's name, then two columns of label and value — Naming Series, Location,
// Po No, Invoice No, Inward No, Supplier | Invoice Date, Gate Entry Date, Inward Date, Po Date,
// Financial Year, Vehicle No — then the Items table (Po No, Po Date, Item Code, Item Description, UOM,
// Po Qty, Item Qty, Bal Qty). Printed with the browser's Print; the page's chrome does not print.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const g = await db.purchaseGateEntry.findUnique({ where: { id }, select: { number: true } });
  return { title: g ? `${g.number} · Print` : "Print" };
}

const LEFT = [
  ["Naming Series", "naming_series"],
  ["Location", "location"],
  ["Po No", "po_no"],
  ["Invoice No", "invoice_no"],
  ["Inward No", "inward_no"],
  ["Supplier", "supplier"],
] as const;
const RIGHT = [
  ["Invoice Date", "invoice_date"],
  ["Gate Entry Date", "gate_entry_date"],
  ["Inward Date", "inward_date"],
  ["Po Date", "po_date"],
  ["Financial Year", "financial_year"],
  ["Vehicle No", "vehicle_no"],
] as const;
const DATES = new Set(["invoice_date", "gate_entry_date", "inward_date", "po_date"]);

export default async function GateEntryPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await purchasePageGate("stock");
  const { id } = await params;
  const loaded = await loadGateEntryDoc(db, id);
  if (!loaded) notFound();
  const { entry, doc } = loaded;
  const value = (f: string) => {
    const v = doc[f];
    if (v === null || v === undefined || v === "") return "";
    return DATES.has(f) ? formatDate(String(v)) : String(v);
  };
  const items = Array.isArray(doc.items) ? (doc.items as Record<string, unknown>[]) : [];
  const Column = ({ rows }: { rows: readonly (readonly [string, string])[] }) => (
    <div className="space-y-1.5">
      {rows.map(([label, f]) => (
        <div key={f} className="grid grid-cols-[42%_58%] gap-2 text-[13px]">
          <div className="text-gray-500">{label}</div>
          <div className="text-gray-900">{value(f)}</div>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          crumbs={["Stock", "Gate Entry", entry.number]}
          title={entry.number}
          actions={
            <>
              <Link href={gateEntryPath(entry.id)} className="po-btn-secondary">Back to {entry.number}</Link>
              <PrintButton />
            </>
          }
        />
        <div className="mb-3 text-xs text-gray-500">Print Format: GATE ENTRY PRINT</div>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-10 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-6 border-b border-gray-200 pb-3">
          <h3 className="text-xl font-semibold text-gray-900">Gate Entry</h3>
          <p className="text-[13px] text-gray-700">{entry.number}</p>
        </header>
        <section className="mb-6 grid grid-cols-2 gap-8">
          <Column rows={LEFT} />
          <Column rows={RIGHT} />
        </section>
        <section>
          <div className="mb-1 text-[13px] font-medium text-gray-700">Items</div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                {["Sr", "Po No", "Po Date", "Item Code", "Item Description", "UOM", "Po Qty", "Item Qty", "Bal Qty"].map((h) => (
                  <th key={h} className={`border border-gray-300 px-2 py-1.5 font-medium ${["Po Qty", "Item Qty", "Bal Qty"].includes(h) ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={String(r.name ?? i)} className="align-top">
                  <td className="border border-gray-300 px-2 py-1.5">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{String(r.po_no ?? "")}</td>
                  <td className="border border-gray-300 px-2 py-1.5 whitespace-nowrap">{r.po_date ? formatDate(String(r.po_date)) : ""}</td>
                  <td className="border border-gray-300 px-2 py-1.5">{String(r.item_code ?? "")}</td>
                  <td className="border border-gray-300 px-2 py-1.5">
                    <span className="po-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(r.item_description ?? "")) }} />
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5">{String(r.uom ?? "")}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{formatFloat(Number(r.po_qty ?? 0), 3)}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{formatFloat(Number(r.item_qty ?? 0), 3)}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{formatFloat(Number(r.bal_qty ?? 0), 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </article>
    </>
  );
}
