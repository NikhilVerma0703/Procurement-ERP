"use client";

// The New Email dialog of a PO (Frappe 14's CommunicationComposer), and the
// small context that opens it from the form's ⋯ menu (Email, Ctrl+E), the
// timeline's New Email button, or an email's Reply / Reply All.
//   * To (the PO's contact email to start with), CC and BCC behind ▾;
//   * Subject (required; "{supplier} (#PUR-ORD/…)", or "Re: …" after an email);
//   * Message;
//   * Send me a copy, Send Read Receipt, Attach Document Print with its print
//     format (the five layouts, PDF PO first), and the PO's attachments to pick;
//   * Discard, Send.
// The server checks and sends it (sendEmailAction). Without outgoing email set
// up it is kept as "Not Sent", which the toast says.
import { ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { sendEmailAction } from "@/app/purchase/orders/activity-actions";
import { HtmlEditor } from "@/components/purchase/form/HtmlEditor";
import type { OrderAttachment } from "@/lib/purchase/orders/activity";

export interface ComposeRequest {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  title?: string;
}

interface ComposeCtx {
  request: ComposeRequest | null;
  open: (r?: ComposeRequest) => void;
  close: () => void;
}

const ComposeContext = createContext<ComposeCtx | null>(null);

export function ComposeProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ComposeRequest | null>(null);
  return <ComposeContext.Provider value={{ request, open: (r) => setRequest(r ?? {}), close: () => setRequest(null) }}>{children}</ComposeContext.Provider>;
}

/** Opens the dialog; null outside a saved PO's page. */
export const useCompose = () => useContext(ComposeContext);

export interface ComposeSetup {
  orderId: string;
  /** What a new email starts with. */
  defaults: { to: string; subject: string };
  attachments: OrderAttachment[];
  layouts: readonly string[];
}

/** The dialog, open while a request is pending. */
export function EmailComposer({ setup, onSent }: { setup: ComposeSetup; onSent: () => void }) {
  const ctx = useCompose();
  if (!ctx?.request) return null;
  return <EmailDialog key={JSON.stringify(ctx.request)} setup={setup} request={ctx.request} onClose={ctx.close} onSent={onSent} />;
}

function EmailDialog({ setup, request, onClose, onSent }: { setup: ComposeSetup; request: ComposeRequest; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState(request.to ?? setup.defaults.to);
  const [cc, setCc] = useState(request.cc ?? "");
  const [bcc, setBcc] = useState(request.bcc ?? "");
  const [more, setMore] = useState(Boolean(request.cc || request.bcc));
  const [subject, setSubject] = useState(request.subject ?? setup.defaults.subject);
  const [html, setHtml] = useState("");
  const [sendMeACopy, setSendMeACopy] = useState(false);
  const [readReceipt, setReadReceipt] = useState(false);
  const [attachPrint, setAttachPrint] = useState(false);
  const [printFormat, setPrintFormat] = useState(setup.layouts[0] ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const send = async () => {
    setBusy(true);
    setErrors({});
    try {
      const r = await sendEmailAction(setup.orderId, { to, cc, bcc, subject, html, attachPrint, printFormat, attachmentIds: picked, sendMeACopy, readReceipt });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      if (r.value.status === "Sent") toast.success("Email sent.");
      else if (r.value.status === "Not Sent") toast.warning(`The email is kept on the timeline but was not sent: ${r.value.reason ?? "outgoing email is not set up."}`);
      else toast.error(`There were errors while sending email. Please try again.${r.value.reason ? ` (${r.value.reason})` : ""}`);
      onSent();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-md border border-gray-200 bg-[#f4f5f6] px-3 py-1.5 text-[13px] text-gray-900 focus:border-gray-400 focus:bg-white focus:outline-none";
  const label = "mb-1 block text-xs text-gray-600";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16" role="dialog" aria-modal="true" aria-labelledby="po-email-title" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 id="po-email-title" className="text-[15px] font-semibold text-gray-900">
            {request.title ?? "New Email"}
          </h2>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" disabled={busy} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label htmlFor="po-email-to" className={label}>
              To
            </label>
            <div className="flex items-start gap-2">
              <input id="po-email-to" className={field} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, …" autoComplete="off" aria-invalid={Boolean(errors.to)} />
              <button type="button" className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50" aria-label={more ? "Hide CC and BCC" : "Show CC and BCC"} aria-expanded={more} onClick={() => setMore((m) => !m)}>
                {more ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
              </button>
            </div>
            {errors.to && <p className="mt-1 text-xs text-red-600">{errors.to}</p>}
          </div>
          {more && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="po-email-cc" className={label}>
                  CC
                </label>
                <input id="po-email-cc" className={field} value={cc} onChange={(e) => setCc(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="po-email-bcc" className={label}>
                  BCC
                </label>
                <input id="po-email-bcc" className={field} value={bcc} onChange={(e) => setBcc(e.target.value)} autoComplete="off" />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="po-email-subject" className={label}>
              Subject <span className="text-red-500">*</span>
            </label>
            <input id="po-email-subject" className={field} value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={Boolean(errors.subject)} required />
            {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject}</p>}
          </div>
          <div>
            <span className={label}>Message</span>
            <HtmlEditor value={html} onChange={setHtml} label="Message" minHeightClass="min-h-[180px]" />
          </div>
          <div className="grid gap-4 border-t border-gray-100 pt-3 sm:grid-cols-2">
            <div className="space-y-2 text-[13px] text-gray-700">
              {(
                [
                  ["Send me a copy", sendMeACopy, setSendMeACopy],
                  ["Send Read Receipt", readReceipt, setReadReceipt],
                  ["Attach Document Print", attachPrint, setAttachPrint],
                ] as const
              ).map(([text, value, set]) => (
                <label key={text} className="flex items-center gap-2">
                  <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
                  {text}
                </label>
              ))}
              {attachPrint && (
                <div>
                  <label htmlFor="po-email-format" className={label}>
                    Select Print Format
                  </label>
                  <select id="po-email-format" className={field} value={printFormat} onChange={(e) => setPrintFormat(e.target.value)}>
                    {setup.layouts.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="text-[13px] text-gray-700">
              <span className={label}>Select Attachments</span>
              {setup.attachments.length ? (
                <ul className="space-y-1.5">
                  {setup.attachments.map((a) => (
                    <li key={a.id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                        <span className="truncate">{a.fileName}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">This PO has no attachments.</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" className="po-btn-secondary" disabled={busy} onClick={onClose}>
            Discard
          </button>
          <button type="button" className="po-btn-primary" disabled={busy} onClick={() => void send()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
