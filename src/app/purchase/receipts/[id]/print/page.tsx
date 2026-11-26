import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReceiptPrintView } from "@/components/purchase/print/ReceiptPrintView";
import { DEFAULT_RECEIPT_PRINT_FORMAT, RECEIPT_PRINT_FORMATS } from "@/lib/purchase/print/receipt-formats";
import { receiptPath } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await db.purchaseReceipt.findUnique({ where: { id }, select: { number: true } });
  return { title: r ? `${r.number} · Print` : "Print" };
}

// A receipt's print view, as the old form's printer icon opened it: the receipt in a print format
// (QR Codes first, the old default), and Print — the browser's print, whose "Save as PDF" gives the file
// the old PDF button downloaded.
export default async function PurchaseReceiptPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  await purchasePageGate("stock");
  const { id } = await params;
  const { format } = await searchParams;
  const r = await db.purchaseReceipt.findUnique({ where: { id }, select: { id: true, number: true, title: true } });
  if (!r) notFound();
  const names = RECEIPT_PRINT_FORMATS.map((f) => f.name);
  return (
    <>
      <PageHeader
        crumbs={["Stock", "Purchase Receipt", r.number]}
        title={r.number}
        actions={
          <Link href={receiptPath(r.id)} className="po-btn-secondary">
            Back to {r.title ?? r.number}
          </Link>
        }
      />
      <ReceiptPrintView id={r.id} formats={names} initial={format && names.includes(format) ? format : DEFAULT_RECEIPT_PRINT_FORMAT} />
    </>
  );
}
