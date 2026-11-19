"use client";

// Below a saved PO, as the old form had it (Frappe 14 form/footer):
//   * "Add a comment": the box, "Ctrl+Enter to add comment", Comment;
//   * the timeline: "Activity" with Communication | All when the PO has
//     emails or comments, then every item newest first (lib/purchase/orders/
//     timeline.ts), the newest 20 emails before "Load More Communications";
//   * at the end, who created the PO and who last edited it.
// A comment's author may edit it (Edit, then Save or Dismiss) and delete it;
// an Admin may delete any. "Copy Link" copies a link to the comment.
import { Bell, GitBranch, Loader2, Mail, MessageSquare, MoreHorizontal, Plus, Reply, ReplyAll, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addCommentAction, deleteCommentAction, updateCommentAction } from "@/app/purchase/orders/activity-actions";
import { ConfirmDialog } from "@/components/purchase/form/Grid";
import { HtmlEditor } from "@/components/purchase/form/HtmlEditor";
import { cn } from "@/lib/purchase/cn";
import { sanitizeHtml } from "@/lib/purchase/html";
import { EMAILS_SHOWN, type TimelineComment, type TimelineEmail, type TimelineItem } from "@/lib/purchase/orders/timeline";
import { Avatar, Runs, When } from "./bits";
import { EmailComposer, useCompose, type ComposeSetup } from "./compose";

type Person = { email: string; name: string; at: string } | null;

export interface OrderFooterProps {
  orderId: string;
  items: TimelineItem[];
  created: Person;
  edited: Person;
  viewer: { email: string; isAdmin: boolean };
  canComment: boolean;
  /** New Email (absent when the user may not email, or the PO is cancelled). */
  compose?: ComposeSetup;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function OrderFooter({ orderId, items, created, edited, viewer, canComment, compose }: OrderFooterProps) {
  const router = useRouter();
  const composer = useCompose();
  const canEmail = Boolean(compose && composer);
  const [onlyCommunication, setOnlyCommunication] = useState(false);
  const [allEmails, setAllEmails] = useState(false);
  const hasActivity = items.some((i) => i.type === "comment" || i.type === "email");

  // The newest 20 emails, then a button where the rest would start.
  let emailsSeen = 0;
  const shown: (TimelineItem | { type: "more"; id: string })[] = [];
  for (const item of items) {
    if (onlyCommunication && item.type === "line") continue;
    if (item.type === "email") {
      emailsSeen++;
      if (!allEmails && emailsSeen > EMAILS_SHOWN) {
        if (emailsSeen === EMAILS_SHOWN + 1) shown.push({ type: "more", id: "load-more" });
        continue;
      }
    }
    shown.push(item);
  }

  return (
    <div className="mt-4 space-y-4">
      {canComment && <CommentBox orderId={orderId} onAdded={() => router.refresh()} />}

      <div className="relative pl-9">
        <span className="absolute bottom-0 left-[13px] top-0 border-l border-gray-200" aria-hidden />
        {canEmail && (
          <div className="relative py-2">
            <Dot />
            <button type="button" className="po-btn-secondary" onClick={() => composer?.open()}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New Email
            </button>
          </div>
        )}
        {hasActivity && (
          <div className="relative flex flex-wrap items-center gap-3 py-2">
            <Dot />
            <h4 className="text-[15px] font-semibold text-gray-900">Activity</h4>
            <nav className="flex gap-1 text-xs" aria-label="Show">
              {(
                [
                  [true, "Communication"],
                  [false, "All"],
                ] as const
              ).map(([only, label]) => (
                <button
                  key={label}
                  type="button"
                  className={cn("rounded-md px-2 py-1", onlyCommunication === only ? "bg-gray-100 font-medium text-gray-900" : "text-gray-500 hover:text-gray-800")}
                  aria-pressed={onlyCommunication === only}
                  onClick={() => setOnlyCommunication(only)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        )}

        <ol className="space-y-1">
          {shown.map((item) =>
            item.type === "more" ? (
              <li key={item.id} className="relative py-2">
                <button type="button" className="po-btn-secondary" onClick={() => setAllEmails(true)}>
                  Load More Communications
                </button>
              </li>
            ) : item.type === "line" ? (
              <li key={item.id} className="relative py-1.5 text-[13px] leading-5 text-gray-600">
                {item.icon ? <Badge icon={item.icon} /> : <Dot />}
                <Runs runs={item.runs} />
                <span className="text-gray-500">
                  {" "}
                  - <When at={item.at} />
                </span>
              </li>
            ) : item.type === "comment" ? (
              <CommentCard key={item.id} item={item} viewer={viewer} canComment={canComment} onChanged={() => router.refresh()} />
            ) : (
              <EmailCard
                key={item.id}
                item={item}
                onReply={
                  canEmail && !item.automated
                    ? (all) => {
                        // Frappe: a reply goes to the sender, or, on one's own email, to its recipients;
                        // Reply All copies the others.
                        const mine = same(item.senderEmail ?? "", viewer.email);
                        const to = mine ? item.toEmails : [item.senderEmail ?? ""];
                        const others = (mine ? item.ccEmails : [...item.toEmails, ...item.ccEmails]).filter((e) => !same(e, viewer.email) && !to.some((t) => same(t, e)));
                        composer?.open({
                          title: "Reply",
                          to: to.filter(Boolean).join(", "),
                          cc: all ? others.join(", ") : "",
                          subject: /^re:/i.test(item.subject ?? "") ? (item.subject ?? "") : `Re: ${item.subject ?? ""}`,
                        });
                      }
                    : undefined
                }
              />
            ),
          )}
          {(created || edited) && !onlyCommunication && (
            <li className="relative py-1.5 text-[13px] text-gray-600">
              <Dot />
              {created && <Who person={created} viewer={viewer.email} verb="created" />}
              {created && edited && " • "}
              {edited && <Who person={edited} viewer={viewer.email} verb="edited" />}
            </li>
          )}
        </ol>
      </div>
      {compose && <EmailComposer setup={compose} onSent={() => router.refresh()} />}
    </div>
  );
}

function Who({ person, viewer, verb }: { person: NonNullable<Person>; viewer: string; verb: string }) {
  return (
    <span>
      {same(person.email, viewer) ? "You" : <b className="font-semibold text-gray-800">{person.name}</b>} {verb} this <When at={person.at} />
    </span>
  );
}

function Dot() {
  return <span className="absolute -left-[27px] top-[11px] h-2 w-2 rounded-full border border-gray-300 bg-white" aria-hidden />;
}

const BADGES = { workflow: GitBranch, upload: Upload, remove: Trash2, comment: MessageSquare, mail: Mail, notification: Bell } as const;
const BADGE_TITLES = { workflow: "Workflow", upload: "Upload", remove: "Delete", comment: "Comment", mail: "Email", notification: "Notification" } as const;

function Badge({ icon, top = "top-1" }: { icon: keyof typeof BADGES; top?: string }) {
  const Icon = BADGES[icon];
  return (
    <span className={cn("absolute -left-[35px] grid h-6 w-6 place-items-center rounded-full border border-gray-200 bg-white text-gray-500", top)} title={BADGE_TITLES[icon]}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

function CommentBox({ orderId, onAdded }: { orderId: string; onAdded: () => void }) {
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const latest = useRef(html);
  latest.current = html;

  const submit = async () => {
    const value = latest.current;
    if (busy || !sanitizeHtml(value).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() && !/<img/i.test(value)) return;
    setBusy(true);
    try {
      const r = await addCommentAction(orderId, value);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setHtml("");
      setVersion((v) => v + 1);
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="po-comment-box" className="po-card px-4 py-4 sm:px-5" aria-labelledby="po-add-comment">
      <h3 id="po-add-comment" className="mb-3 text-[15px] font-semibold text-gray-900">
        Add a comment
      </h3>
      <HtmlEditor key={version} value={html} onChange={setHtml} label="Comment" minHeightClass="min-h-[80px]" onSubmit={() => void submit()} disabled={busy} />
      <p className="mt-1.5 text-xs text-gray-500">Ctrl+Enter to add comment</p>
      <button type="button" className="po-btn-secondary mt-3" disabled={busy} onClick={() => void submit()}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        Comment
      </button>
    </section>
  );
}

function CardMenu({ items }: { items: { label: string; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="More actions" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-1 min-w-[120px] rounded-md border border-gray-200 bg-white py-1 text-[13px] shadow-lg" role="menu">
          {items.map((i) => (
            <li key={i.label}>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false);
                  i.run();
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function copyLink(anchor: string) {
  const url = `${window.location.origin}${window.location.pathname}#${anchor}`;
  void navigator.clipboard?.writeText(url).then(
    () => toast.success("Copied to clipboard."),
    () => toast.error("Could not copy the link."),
  );
}

function CommentCard({ item, viewer, canComment, onChanged }: { item: TimelineComment; viewer: { email: string; isAdmin: boolean }; canComment: boolean; onChanged: () => void }) {
  const mine = canComment && same(item.byEmail, viewer.email);
  const mayDelete = canComment && (mine || viewer.isAdmin);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.html);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await updateCommentAction(item.id, draft);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const r = await deleteCommentAction(item.id);
      if (!r.ok) toast.error(r.error);
      else onChanged();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li id={`comment-${item.id}`} className="relative py-2">
      <Badge icon="comment" top="top-3.5" />
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
            <Avatar name={item.byName} />
            <span className="text-gray-900">{item.byName}</span>
            <span className="text-gray-500">commented</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">
              <When at={item.at} />
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {mine && (
              <button type="button" className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" disabled={busy} onClick={() => (editing ? void save() : (setDraft(item.html), setEditing(true)))}>
                {editing ? "Save" : "Edit"}
              </button>
            )}
            {editing ? (
              <button type="button" className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" disabled={busy} onClick={() => setEditing(false)}>
                Dismiss
              </button>
            ) : (
              <CardMenu items={[{ label: "Copy Link", run: () => copyLink(`comment-${item.id}`) }, ...(mayDelete ? [{ label: "Delete", run: () => setConfirming(true) }] : [])]} />
            )}
          </div>
        </div>
        {editing ? (
          <div className="mt-2">
            <HtmlEditor value={draft} onChange={setDraft} label="Comment" minHeightClass="min-h-[80px]" onSubmit={() => void save()} />
          </div>
        ) : (
          <div className="po-html mt-2 text-[13px] text-gray-800" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.html) }} />
        )}
      </div>
      {confirming && <ConfirmDialog message="Delete comment?" busy={busy} onNo={() => setConfirming(false)} onYes={() => void remove()} />}
    </li>
  );
}

function EmailCard({ item, onReply }: { item: TimelineEmail; onReply?: (all: boolean) => void }) {
  const shownTo = item.to.slice(0, 3).join(", ") + (item.to.length > 3 ? " ..." : "");
  return (
    <li id={`communication-${item.id}`} className="relative py-2">
      <Badge icon={item.automated ? "notification" : "mail"} top="top-3.5" />
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex items-start justify-between gap-2 text-[13px]">
          {item.automated ? (
            <div className="min-w-0 text-gray-800">
              Notification sent to {shownTo}
              <div className="text-gray-500">
                <When at={item.at} />
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 gap-2">
              <Avatar name={item.byName} />
              <div className="min-w-0">
                <span className="text-gray-900">{item.byName}</span>
                <span className="text-gray-400"> · </span>
                <span className="text-gray-500">
                  <When at={item.at} />
                </span>
                {item.subject && <div className="my-1 text-gray-500">{item.subject}</div>}
              </div>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {item.status && (
              <span
                className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", item.status === "Sent" ? "bg-green-50 text-green-700" : item.status === "Error" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700")}
                title={item.error ?? undefined}
              >
                {item.status}
              </span>
            )}
            {onReply && (
              <>
                <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Reply" title="Reply" onClick={() => onReply(false)}>
                  <Reply className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Reply All" title="Reply All" onClick={() => onReply(true)}>
                  <ReplyAll className="h-4 w-4" aria-hidden />
                </button>
              </>
            )}
            <CardMenu items={[{ label: "Copy Link", run: () => copyLink(`communication-${item.id}`) }]} />
          </div>
        </div>
        <div className="po-html mt-2 text-[13px] text-gray-800" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.html) }} />
        {item.files.length > 0 && (
          <ul className="mt-2.5 space-y-0.5 text-xs">
            {item.files.map((f, i) => (
              <li key={i} className="truncate text-gray-500">
                {f.href ? (
                  <a href={f.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    📎 {f.name}
                  </a>
                ) : (
                  <span>📎 {f.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
