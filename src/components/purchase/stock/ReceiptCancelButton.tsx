"use client";

// A submitted receipt's Cancel (the old form's button): "Permanently Cancel …?", then the receipt is
// cancelled with its ledger entries, its POs' received quantities and its gate entry's Inward No undone.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelReceiptAction } from "@/app/purchase/receipts/actions";
import { ConfirmDialog } from "@/components/purchase/form/Grid";

export function ReceiptCancelButton({ id, number, modified }: { id: string; number: string; modified: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <button type="button" className="po-btn-secondary" disabled={busy} onClick={() => setAsking(true)}>
        {busy ? "Cancelling…" : "Cancel"}
      </button>
      {asking && (
        <ConfirmDialog
          message={`Permanently Cancel ${number}?`}
          busy={busy}
          onNo={() => setAsking(false)}
          onYes={() => {
            setAsking(false);
            start(async () => {
              const r = await cancelReceiptAction({ id, modified });
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Cancelled");
              router.refresh();
            });
          }}
        />
      )}
    </>
  );
}
