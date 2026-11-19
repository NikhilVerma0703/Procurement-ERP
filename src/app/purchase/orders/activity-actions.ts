"use server";

// The writes of a PO's sidebar and timeline: comments, and removing an
// attachment (adding one is the upload route, api/purchase/orders/[id]/
// attachments). Each starts with purchaseGate(action) and runs through
// purchaseWrite() (CLAUDE.md, seams); the rules are lib/purchase/orders/
// comments.ts and attachments.ts.
import { revalidatePath } from "next/cache";
import type { PurchaseAction } from "@/lib/purchase/access";
import { isEmailAddress, splitAddresses } from "@/lib/purchase/notify/compose";
import { queueAndSend, type DeliveryStatus } from "@/lib/purchase/notify/outbox";
import { removeAttachment } from "@/lib/purchase/orders/attachments";
import { addComment, deleteComment, updateComment } from "@/lib/purchase/orders/comments";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { DEFAULT_PO_LAYOUT, isPoLayout } from "@/lib/purchase/pdf/layouts/index";
import { orderPath } from "@/lib/purchase/routes";
import type { PurchaseUser } from "@/lib/purchase/server/current-user";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { purchaseWrite } from "@/lib/purchase/server/write";

async function gated<T>(action: PurchaseAction, fn: (user: PurchaseUser) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const g = await purchaseGate(action);
  if (!g.ok || !g.user) return { ok: false, error: g.status === 401 ? purchaseRefusal(g) : "You are not permitted to do this." };
  const user = g.user;
  const w = await purchaseWrite(user, () => fn(user));
  return w.done ? w.value : { ok: false, error: w.refusal };
}

const refresh = (orderId: string | null | undefined) => {
  if (orderId) revalidatePath(orderPath(orderId));
};

export async function addCommentAction(orderId: string, html: string): Promise<ActionResult<{ id: string }>> {
  const r = await gated("comment", (u) => addComment(u, orderId, html));
  if (r.ok) refresh(orderId);
  return r;
}

export async function updateCommentAction(id: string, html: string): Promise<ActionResult> {
  const r = await gated("comment", (u) => updateComment(u, id, html));
  if (!r.ok) return r;
  refresh(r.value.orderId);
  return { ok: true };
}

export async function deleteCommentAction(id: string): Promise<ActionResult> {
  const r = await gated("comment", (u) => deleteComment(u, id));
  if (!r.ok) return r;
  refresh(r.value.orderId);
  return { ok: true };
}

export async function removeAttachmentAction(id: string): Promise<ActionResult> {
  const r = await gated("attach", (u) => removeAttachment(u, id));
  if (!r.ok) return r;
  refresh(r.value.orderId);
  return { ok: true };
}

/** What the New Email dialog sends. */
export interface EmailForm {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
  attachPrint: boolean;
  printFormat: string;
  attachmentIds: string[];
  sendMeACopy: boolean;
  readReceipt: boolean;
}

/** The most addresses one email may go to. */
const MAX_RECIPIENTS = 100;

/**
 * New Email from a PO (Frappe's communication.email.make): checks the addresses, writes the email
 * on the PO's timeline and sends it. The answer says whether it went: "Sent", or "Not Sent" when no
 * outgoing email is set up, or "Error" with the reason.
 */
export async function sendEmailAction(orderId: string, form: EmailForm): Promise<ActionResult<{ status: DeliveryStatus; reason?: string }>> {
  const r = await gated("email", async (u): Promise<ActionResult<{ status: DeliveryStatus; reason?: string }>> => {
    const to = splitAddresses(form.to);
    const cc = splitAddresses(form.cc);
    const bcc = splitAddresses(form.bcc);
    if (!to.length) return { ok: false, error: "Enter Email Recipient(s)", fieldErrors: { to: "Enter Email Recipient(s)" } };
    const bad = [...to, ...cc, ...bcc].find((e) => !isEmailAddress(e));
    if (bad) return { ok: false, error: `${bad} is not a valid Email Address` };
    if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) return { ok: false, error: `An email may go to at most ${MAX_RECIPIENTS} addresses.` };
    const subject = String(form.subject ?? "").trim();
    if (!subject) return { ok: false, error: "Missing Fields: Subject", fieldErrors: { subject: "Subject is required." } };
    const sent = await queueAndSend({
      orderId,
      to,
      cc,
      bcc,
      subject,
      html: String(form.html ?? ""),
      type: "Communication",
      sender: u.email,
      printFormat: form.attachPrint ? (isPoLayout(form.printFormat) ? form.printFormat : DEFAULT_PO_LAYOUT) : null,
      attachmentIds: Array.isArray(form.attachmentIds) ? form.attachmentIds.filter((x) => typeof x === "string").slice(0, 50) : [],
      sendMeACopy: Boolean(form.sendMeACopy),
      readReceipt: Boolean(form.readReceipt),
    });
    if ("refused" in sent) return { ok: false, error: sent.refused };
    return { ok: true, value: { status: sent.status, ...(sent.reason ? { reason: sent.reason } : {}) } };
  });
  if (r.ok) refresh(orderId);
  return r;
}
