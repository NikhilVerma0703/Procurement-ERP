"use client";

// A saved PO's sidebar, as the old form had it (Frappe 14 form/sidebar):
//   * Attachments: "Attach File", then each file as a pill (a lock when it is
//     private, its name opening it, × removing it after "Are you sure you want
//     to delete the attachment?"); the newest 10, then "Show All";
//   * the comment count (it takes you to the comment box);
//   * who last edited the PO, and who created it.
// Left out, as unused in 2.5 years (plan §5: kept out unless the owner says
// otherwise): Assigned To (0 POs), Shared With, Tags (0), likes (0), Follow.
import { Lock, MessageSquare, Paperclip, Plus, Unlock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { removeAttachmentAction } from "@/app/purchase/orders/activity-actions";
import { ConfirmDialog } from "@/components/purchase/form/Grid";
import type { OrderAttachment } from "@/lib/purchase/orders/activity";
import { AttachDialog } from "./AttachDialog";
import { When } from "./bits";

type Person = { email: string; name: string; at: string } | null;

/** How many attachments show before "Show All" (attachments.js, attachments_page_length). */
const ATTACHMENTS_SHOWN = 10;

export function OrderSidebar({
  orderId,
  attachments,
  commentCount,
  created,
  edited,
  canAttach,
}: {
  orderId: string;
  attachments: OrderAttachment[];
  commentCount: number;
  created: Person;
  edited: Person;
  canAttach: boolean;
}) {
  const router = useRouter();
  const [attaching, setAttaching] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [removing, setRemoving] = useState<OrderAttachment | null>(null);
  const [busy, setBusy] = useState(false);
  const newestFirst = [...attachments].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, ATTACHMENTS_SHOWN);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const r = await removeAttachmentAction(removing.id);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5 text-[13px] text-gray-600">
      <section aria-labelledby="po-attachments">
        <h3 id="po-attachments" className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <Paperclip className="h-3.5 w-3.5" aria-hidden /> Attachments
        </h3>
        <ul className="space-y-1.5">
          {canAttach && (
            <li>
              <button type="button" className="flex w-full items-center justify-between rounded-md bg-gray-100 px-2.5 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-200" onClick={() => setAttaching(true)}>
                Attach File <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          )}
          {shown.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1.5">
              {a.isPrivate ? <Lock className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-label="Private" /> : <Unlock className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-label="Public" />}
              <a href={a.href} target="_blank" rel="noopener noreferrer" title={a.fileName} className="min-w-0 flex-1 truncate text-gray-800 hover:underline">
                {a.fileName}
              </a>
              {canAttach && (
                <button type="button" className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800" aria-label={`Remove ${a.fileName}`} onClick={() => setRemoving(a)}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
          {!showAll && newestFirst.length > ATTACHMENTS_SHOWN && (
            <li>
              <button type="button" className="text-xs text-gray-600 hover:underline" onClick={() => setShowAll(true)}>
                Show All
              </button>
            </li>
          )}
        </ul>
      </section>

      <a href="#po-comment-box" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800" title="Comments">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {commentCount}
      </a>

      <hr className="border-gray-200" />
      <ul className="space-y-2 text-xs text-gray-500">
        {edited && (
          <li>
            <b className="font-semibold text-gray-700">{edited.name}</b> edited this · <When at={edited.at} />
          </li>
        )}
        {created && (
          <li>
            <b className="font-semibold text-gray-700">{created.name}</b> created this · <When at={created.at} />
          </li>
        )}
      </ul>

      {attaching && (
        <AttachDialog
          orderId={orderId}
          onClose={() => setAttaching(false)}
          onUploaded={() => {
            setAttaching(false);
            router.refresh();
          }}
        />
      )}
      {removing && <ConfirmDialog message="Are you sure you want to delete the attachment?" busy={busy} onNo={() => setRemoving(null)} onYes={() => void remove()} />}
    </div>
  );
}
