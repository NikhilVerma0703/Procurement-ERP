// The module's outgoing email (the shape of the Main ERP's mailers: nodemailer
// over SMTP, set by SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM,
// as in its lib/attendance/reportEmail.ts).
//
// STANDALONE: those variables in .env. Without them nothing is sent: the email
// stays "Not Sent" on the PO's timeline, as Frappe's Email Queue kept mail when
// no outgoing account was set. AT THE MERGE: the Main ERP's same variables (or
// its mail helper) behind this one function.
import "server-only";
import { createTransport } from "nodemailer";

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  /** Where replies go (the person who wrote the email). */
  replyTo?: string;
  /** Ask the recipient's mail program for a read receipt. */
  readReceiptTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export type MailResult =
  | { sent: true; rejected: string[] }
  | { sent: false; notConfigured: true; reason: string }
  | { sent: false; notConfigured: false; error: string };

/** Is outgoing email set up? */
export function mailConfigured(): boolean {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

export async function sendMail(m: OutgoingMail): Promise<MailResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { sent: false, notConfigured: true, reason: "SMTP is not configured — set SMTP_HOST, SMTP_USER and SMTP_PASS." };
  }
  const port = Number(SMTP_PORT || 587);
  const transport = createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  try {
    const info = await transport.sendMail({
      from: SMTP_FROM || `"Pacific Surfaces" <${SMTP_USER}>`,
      to: m.to,
      cc: m.cc?.length ? m.cc : undefined,
      bcc: m.bcc?.length ? m.bcc : undefined,
      subject: m.subject,
      html: m.html,
      replyTo: m.replyTo,
      headers: m.readReceiptTo ? { "Disposition-Notification-To": m.readReceiptTo } : undefined,
      attachments: m.attachments,
    });
    // Nodemailer rejects only when every address fails; the rest are reported here.
    return { sent: true, rejected: (info.rejected ?? []).map(String) };
  } catch (e) {
    return { sent: false, notConfigured: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    transport.close();
  }
}
