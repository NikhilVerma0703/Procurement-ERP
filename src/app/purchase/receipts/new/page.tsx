import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { ReceiptForm } from "@/components/purchase/stock/ReceiptForm";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import { engineMasters } from "@/lib/purchase/orders/save";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { db } from "@/lib/purchase/server/db";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { blankReceipt, receiptFromOrder } from "@/lib/purchase/stock/receipt-map";
import { RECEIPT_CHILDREN } from "@/lib/purchase/stock/receipt-meta";

// A new Purchase Receipt (Phase II, owner 21-11-2026): blank (the list's Add Purchase Receipt), or
// made from a submitted PO (its Create › Purchase Receipt: ?purchase_order=<PO id>), as ERPNext's
// make_purchase_receipt made it. Nothing is stored until Save.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New Purchase Receipt" };

export default async function NewPurchaseReceiptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await purchasePageGate("stock");
  const sp = await searchParams;
  const fromOrder = typeof sp.purchase_order === "string" ? sp.purchase_order : null;
  const made = fromOrder ? await receiptFromOrder(fromOrder) : null;
  const initial = made?.ok ? made.doc : await blankReceipt();
  const company = await db.purchaseCompany.findFirst({ where: { code: String(initial.company ?? "") }, select: { defaultCurrency: true } });
  const companyCurrency = company?.defaultCurrency ?? "INR";
  return (
    <>
      <PageHeader crumbs={["Stock", "Purchase Receipt", "New"]} title="New Purchase Receipt" />
      {made && !made.ok && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {made.error} <Link href={PURCHASE_PATHS.receipts} className="underline">Back to the list</Link>
        </div>
      )}
      <ReceiptForm
        id={null}
        initial={initial}
        modified={null}
        layout={LAYOUTS["Purchase Receipt"]}
        childLayouts={RECEIPT_CHILDREN}
        masters={await engineMasters(companyCurrency)}
        companyCurrency={companyCurrency}
      />
    </>
  );
}
