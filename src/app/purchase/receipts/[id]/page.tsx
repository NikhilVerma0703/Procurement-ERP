import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { OrderFooter } from "@/components/purchase/activity/OrderFooter";
import { Connections } from "@/components/purchase/doc/Connections";
import { loadDocActivity } from "@/lib/purchase/doc/activity";
import { DocumentView } from "@/components/purchase/doc/DocumentView";
import { IndicatorPill } from "@/components/purchase/doc/IndicatorPill";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import { transactionLabels } from "@/lib/purchase/doc/transaction";
import { gateEntryPath, masterPath, orderPath, receiptPath, receiptPrintPath } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { receiptIndicator } from "@/lib/purchase/stock/receipt-status";
import { receiptConnections } from "@/lib/purchase/stock/connections";
import { adjacentReceipts, loadReceiptDoc } from "@/lib/purchase/stock/receipts";
import { ReceiptForm } from "@/components/purchase/stock/ReceiptForm";
import { ReceiptCancelButton } from "@/components/purchase/stock/ReceiptCancelButton";
import { engineMasters } from "@/lib/purchase/orders/save";
import { RECEIPT_CHILDREN } from "@/lib/purchase/stock/receipt-meta";
import { storedReceiptDoc } from "@/lib/purchase/stock/receipt-save";

// One Purchase Receipt, laid out exactly as the old form (Phase II, owner 21-11-2026): its tabs,
// sections, fields and grids from the form definition captured from the old site on 21-11-2026.
// A draft opens editable (stock/ReceiptForm: the old form's behaviour, saved by the server with
// every figure recomputed); a submitted or cancelled receipt is shown read-only with Frappe's rules,
// its links opening the supplier, items and POs here.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await db.purchaseReceipt.findUnique({ where: { id }, select: { title: true, number: true } });
  return { title: r ? `${r.title ?? r.number} - ${r.number}` : "Purchase Receipt" };
}

export default async function PurchaseReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await purchasePageGate("stock");
  const { id } = await params;
  const loaded = await loadReceiptDoc(db, id);
  if (!loaded) notFound();
  const { receipt, doc, companyCurrency, ids, linkTitles } = loaded;
  const ind = receiptIndicator({
    docStatus: receipt.docStatus, status: receipt.status, isReturn: !!doc.is_return, grandTotal: Number(receipt.grandTotal),
    perBilled: Number(doc.per_billed ?? 0), perReturned: Number(doc.per_returned ?? 0),
  });
  const [{ prev, next }, connections, activity] = await Promise.all([
    adjacentReceipts(db, receipt.id),
    receiptConnections(db, receipt.id),
    loadDocActivity("Purchase Receipt", receipt.number, receipt),
  ]);
  const labels = transactionLabels(doc, companyCurrency);
  const navigation = (
    <div className="flex items-center gap-1.5">
      {/* The old form's printer icon (a cancelled receipt did not print: Print Settings). */}
      {receipt.docStatus !== "CANCELLED" && (
        <Link href={receiptPrintPath(receipt.id)} className="po-btn-secondary px-2.5" title="Print" aria-label="Print">
          <Printer className="h-4 w-4" />
        </Link>
      )}
      {prev ? <Link href={receiptPath(prev)} className="po-btn-secondary" title="Previous Document" aria-label="Previous Document"><ChevronLeft className="h-4 w-4" /></Link> : null}
      {next ? <Link href={receiptPath(next)} className="po-btn-secondary" title="Next Document" aria-label="Next Document"><ChevronRight className="h-4 w-4" /></Link> : null}
    </div>
  );
  const footer = (
    <OrderFooter
      orderId={receipt.id}
      items={activity.items}
      created={activity.created}
      edited={activity.edited}
      viewer={{ email: gate.user?.email ?? "", isAdmin: gate.tier === "ADMIN" }}
      canComment={false}
    />
  );
  if (receipt.docStatus === "DRAFT") {
    const stored = await storedReceiptDoc(receipt.id);
    if (!stored) notFound();
    return (
      <>
        <PageHeader crumbs={["Stock", "Purchase Receipt", receipt.number]} title={receipt.title ?? receipt.number} actions={navigation} />
        <ReceiptForm
          key={String(stored.doc.modified ?? "")}
          id={receipt.id}
          initial={stored.doc}
          modified={String(stored.doc.modified ?? "")}
          layout={LAYOUTS["Purchase Receipt"]}
          childLayouts={RECEIPT_CHILDREN}
          masters={await engineMasters(companyCurrency)}
          companyCurrency={companyCurrency}
        />
        {footer}
      </>
    );
  }
  return (
    <>
      <PageHeader
        crumbs={["Stock", "Purchase Receipt", receipt.number]}
        title={receipt.title ?? receipt.number}
        badge={<IndicatorPill label={ind.label} colour={ind.colour} />}
        actions={
          <>
            {navigation}
            {receipt.docStatus === "SUBMITTED" && <ReceiptCancelButton id={receipt.id} number={receipt.number} modified={String(doc.modified ?? "")} />}
          </>
        }
      />
      <section className="po-card">
        <DocumentView
          layout={LAYOUTS["Purchase Receipt"]}
          doc={doc}
          options={{
            currency: String(doc.currency ?? companyCurrency),
            label: labels.label,
            hidden: labels.hidden,
            linkTitle: (_table, f, value) => linkTitles.get(`${f.options}\u0000${value}`),
            tabContent: { Connections: <Connections groups={connections} /> },
            href: (table, f, value) => {
              if (table === null && f.fieldname === "supplier") return ids.supplier ? masterPath("suppliers", ids.supplier) : null;
              if (f.fieldname === "item_code") { const i = ids.items.get(value); return i ? masterPath("items", i) : null; }
              if (f.fieldname === "purchase_order") { const o = ids.orders.get(value); return o ? orderPath(o) : null; }
              if (table === null && f.fieldname === "gate_entry") return receipt.gateEntryId ? gateEntryPath(receipt.gateEntryId) : null;
              return null;
            },
          }}
        />
      </section>
      {/* The old form's timeline: history, comments, emails. */}
      {footer}
    </>
  );
}
