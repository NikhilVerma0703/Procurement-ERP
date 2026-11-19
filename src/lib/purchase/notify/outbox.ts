// Email from a PO, as Frappe 14 kept it: a Communication on the PO's timeline
// (here a purchase_order_events row of kind Email) and the sending of it.
//   * queueAndSend writes the email (recipients, subject, message, what to
//     attach), then sends it through the mail seam and records how it went:
//     "Sent", "Not Sent" (no outgoing email set up, as in Frappe's queue) or
//     "Error" (with the reason);
//   * the PO's sheet goes as a PDF in the chosen layout (Attach Document
//     Print), and chosen attached files go with it; a cancelled PO cannot be
//     printed, so it cannot be attached ("Not allowed to print cancelled
//     documents");
//   * "Send me a copy" copies the sender.
//   * notifyOrder sends the old site's notifications (notifications.ts) when
//     PURCHASE_NOTIFICATIONS=on. They are off by default: the old site last
//     logged one on 21-09-2024, so turning them on is the owner's decision.
// Server only.
import "server-only";
import type { Prisma } from "@prisma/client";
import type { PoLayout } from "../pdf/layouts/index";
import { renderOrderPdf } from "../pdf/render";
import { sanitizeHtml } from "../html";
import { db } from "../server/db";
import { readStoredPath } from "../server/files";
import { sendMail } from "../server/mail";
import { dueNotifications, recipientsFor, type NotifyEvent } from "./notifications";

export type DeliveryStatus = "Sent" | "Not Sent" | "Error";

export interface EmailDraft {
  orderId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  /** A person's email, or a notification ("Automated Message"). */
  type: "Communication" | "Automated Message";
  /** Who sent it (the signed-in user; for a notification, who caused it). */
  sender: string;
  notification?: string;
  /** Attach the PO's sheet in this layout. */
  printFormat?: PoLayout | null;
  /** Attach these of the PO's files. */
  attachmentIds?: string[];
  sendMeACopy?: boolean;
  readReceipt?: boolean;
}

export interface SendOutcome {
  eventId: string;
  status: DeliveryStatus;
  /** Why it was not sent. */
  reason?: string;
}

const MAX_SUBJECT = 998; // a mail header line

export async function queueAndSend(d: EmailDraft): Promise<SendOutcome | { refused: string }> {
  const order = await db.purchaseOrder.findUnique({ where: { id: d.orderId }, select: { id: true, number: true } });
  if (!order) return { refused: "Purchase Order not found" };
  const cc = d.sendMeACopy && !d.cc.includes(d.sender) ? [...d.cc, d.sender] : d.cc;
  const html = sanitizeHtml(d.html);
  const subject = d.subject.replace(/[\r\n]+/g, " ").slice(0, MAX_SUBJECT);
  const files = d.attachmentIds?.length
    ? await db.purchaseAttachment.findMany({ where: { id: { in: d.attachmentIds }, orderId: order.id }, select: { id: true, fileName: true, storagePath: true, fileUrl: true } })
    : [];
  const data = {
    communicationType: d.type,
    recipients: d.to.join(", "),
    cc: cc.join(", ") || null,
    bcc: d.bcc.join(", ") || null,
    deliveryStatus: "Not Sent" as DeliveryStatus,
    ...(d.notification ? { notification: d.notification } : {}),
    ...(d.printFormat ? { printFormat: d.printFormat } : {}),
    ...(files.length ? { attachments: files.map((f) => ({ id: f.id, fileName: f.fileName })) } : {}),
    ...(d.readReceipt ? { readReceipt: true } : {}),
  };
  const event = await db.purchaseOrderEvent.create({
    data: { source: "app", orderId: order.id, orderNumber: order.number, kind: "EMAIL", at: new Date(), byEmail: d.sender, subject, content: html, data },
    select: { id: true },
  });

  const record = async (status: DeliveryStatus, reason?: string) => {
    await db.purchaseOrderEvent.update({
      where: { id: event.id },
      data: { data: { ...data, deliveryStatus: status, ...(reason ? { error: reason } : {}), ...(status === "Sent" ? { sentAt: new Date().toISOString() } : {}) } as Prisma.InputJsonValue },
    });
    return { eventId: event.id, status, ...(reason ? { reason } : {}) };
  };

  // What goes with it: the sheet, then the chosen files.
  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  if (d.printFormat) {
    const pdf = await renderOrderPdf(order.id, d.printFormat);
    if (!pdf.ok) return record("Error", pdf.error);
    attachments.push({ filename: pdf.filename, content: pdf.pdf, contentType: "application/pdf" });
  }
  for (const f of files) {
    const bytes = f.storagePath ? await readStoredPath(f.storagePath) : null;
    if (!bytes) return record("Error", `${f.fileName} is missing from the file store.`);
    attachments.push({ filename: f.fileName, content: bytes });
  }

  const r = await sendMail({
    to: d.to,
    cc,
    bcc: d.bcc,
    subject,
    html,
    replyTo: d.type === "Communication" ? d.sender : undefined,
    readReceiptTo: d.readReceipt ? d.sender : undefined,
    attachments,
  });
  if (r.sent) return record("Sent", r.rejected.length ? `Not delivered to ${r.rejected.join(", ")}` : undefined);
  return r.notConfigured ? record("Not Sent", r.reason) : record("Error", r.error);
}

const STATE_LABEL: Record<string, string> = { CREATED: "Created", APPROVED: "Approved", REJECTED: "Rejected" };

/** Are the old site's notifications switched on? */
export const notificationsOn = () => process.env.PURCHASE_NOTIFICATIONS === "on";

/**
 * Sends the old site's notifications for an event on a PO ("New" when it is first saved,
 * "Submit" when it is approved). Never throws: a notification that fails is recorded on the
 * timeline, and a failure to send one never undoes the action that caused it.
 */
export async function notifyOrder(event: NotifyEvent, orderId: string, actorEmail: string): Promise<void> {
  if (!notificationsOn()) return;
  try {
    const o = await db.purchaseOrder.findUnique({ where: { id: orderId }, select: { number: true, workflowState: true, createdBy: true, contactEmail: true } });
    if (!o) return;
    const ctx = { number: o.number, workflowState: STATE_LABEL[o.workflowState] ?? o.workflowState, owner: o.createdBy, contactEmail: o.contactEmail };
    const due = dueNotifications(event, ctx);
    if (!due.length) return;
    const users = await db.purchaseUser.findMany({ select: { email: true, enabled: true, roles: true } });
    for (const def of due) {
      const to = recipientsFor(def, ctx, users);
      if (!to.length) continue;
      await queueAndSend({ orderId, to, cc: [], bcc: [], subject: def.subject(o.number), html: def.message(o.number), type: "Automated Message", sender: actorEmail, notification: def.name });
    }
  } catch (e) {
    console.error(`Purchase notification for ${orderId} failed:`, e);
  }
}
