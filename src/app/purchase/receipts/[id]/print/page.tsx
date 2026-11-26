import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintScreen } from "@/components/purchase/print/PrintScreen";
import { DEFAULT_RECEIPT_PRINT_FORMAT, RECEIPT_PRINT_FORMATS } from "@/lib/purchase/print/receipt-formats";
import { receiptPath, receiptPrintPagePath } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await db.purchaseReceipt.findUnique({ where: { id }, select: { number: true } });
  return { title: r ? `${r.number} · Print` : "Print" };
}

// A receipt's print view, as the old form's printer icon opened it (components/purchase/print/
// PrintScreen): the receipt in one of its print formats — QR Codes first, the old default — with Full
// Page, Refresh, the form, PDF (the browser's print to PDF) and Print.
export default async function PurchaseReceiptPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  await purchasePageGate("stock");
  const { id } = await params;
  const { format } = await searchParams;
  const r = await db.purchaseReceipt.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!r) notFound();
  const names = RECEIPT_PRINT_FORMATS.map((f) => f.name);
  return (
    <PrintScreen
      pageBase={receiptPrintPagePath(r.id)}
      formats={names}
      initial={format && names.includes(format) ? format : DEFAULT_RECEIPT_PRINT_FORMAT}
      formHref={receiptPath(r.id)}
      crumbs={["Stock", "Purchase Receipt", r.number]}
      title={r.number}
    />
  );
}
