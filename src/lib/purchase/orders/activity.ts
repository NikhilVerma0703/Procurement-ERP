// What the PO page shows around the form, as the old form's sidebar and
// footer did (Frappe's get_docinfo): the timeline, the attachments, the
// comment count, and who created and last edited the PO. Server only.
import "server-only";
import { defaultEmailSubject } from "../notify/compose";
import { pdfFileName } from "../pdf/sheet";
import { orderPdfPath } from "../routes";
import { loginNames } from "../server/current-user";
import { db } from "../server/db";
import { buildTimeline, type TimelineItem } from "./timeline";

export interface OrderAttachment {
  id: string;
  fileName: string;
  isPrivate: boolean;
  /** Where the browser opens it (the module's gated file route). */
  href: string;
}

export interface OrderActivity {
  items: TimelineItem[];
  attachments: OrderAttachment[];
  /** Comments only, as the sidebar's count was. */
  commentCount: number;
  created: { email: string; name: string; at: string } | null;
  edited: { email: string; name: string; at: string } | null;
  /** What the New Email dialog starts with. */
  compose: { to: string; subject: string };
}

/** The file route of an attachment. */
export const attachmentHref = (id: string) => `/api/purchase/attachments/${encodeURIComponent(id)}`;

/** Full names by email: the old site's users, then this app's logins; the email itself when unknown. */
export async function namesOf(emails: Iterable<string>): Promise<(email: string) => string> {
  const list = [...new Set([...emails].filter(Boolean).map((e) => e.toLowerCase()))];
  const [users, logins] = await Promise.all([
    db.purchaseUser.findMany({ where: { email: { in: list, mode: "insensitive" } }, select: { email: true, fullName: true, firstName: true, lastName: true } }),
    // Today's logins through the seam (server/current-user.ts), so the merge rewires one place.
    loginNames(list),
  ]);
  const names = new Map<string, string>(logins);
  for (const u of users) {
    const full = u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ");
    if (full) names.set(u.email.toLowerCase(), full);
  }
  return (email: string) => names.get(email.toLowerCase()) ?? email;
}

export async function loadOrderActivity(orderId: string): Promise<OrderActivity | null> {
  const [order, events, files] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id: orderId },
      select: { number: true, supplierName: true, contactEmail: true, createdAt: true, createdBy: true, updatedAt: true, updatedBy: true },
    }),
    db.purchaseOrderEvent.findMany({ where: { orderId }, orderBy: { at: "desc" } }),
    db.purchaseAttachment.findMany({ where: { orderId }, orderBy: { uploadedAt: "asc" } }),
  ]);
  if (!order) return null;

  const people = new Set<string>();
  for (const e of events) {
    if (e.byEmail) people.add(e.byEmail);
    const d = (e.data ?? {}) as Record<string, unknown>;
    for (const k of ["recipients", "cc", "bcc"]) if (typeof d[k] === "string") for (const x of (d[k] as string).split(",")) people.add(x.trim());
  }
  if (order.createdBy) people.add(order.createdBy);
  if (order.updatedBy) people.add(order.updatedBy);
  const nameOf = await namesOf(people);

  const byUrl = new Map(files.map((f) => [f.fileUrl, attachmentHref(f.id)]));
  const attachedIds = new Set(files.map((f) => f.id));
  const items = buildTimeline(
    events.map((e) => ({ id: e.id, source: e.source, kind: e.kind, at: e.at, byEmail: e.byEmail, subject: e.subject, content: e.content, data: e.data })),
    {
      nameOf,
      fileHref: (url) => byUrl.get(url) ?? null,
      attachmentHref: (id) => (attachedIds.has(id) ? attachmentHref(id) : null),
      sheet: (layout) => ({ name: `${pdfFileName(order.number)} (${layout})`, href: orderPdfPath(orderId, { format: layout }) }),
    },
  );
  const person = (email: string | null, at: Date) => (email ? { email, name: nameOf(email), at: at.toISOString() } : null);
  // The last email a person wrote on this PO (not a notification), for "Re: …".
  const lastEmail = events.find((e) => e.kind === "EMAIL" && (e.data as { communicationType?: string } | null)?.communicationType === "Communication");
  return {
    items,
    attachments: files.map((f) => ({ id: f.id, fileName: f.fileName, isPrivate: f.isPrivate, href: attachmentHref(f.id) })),
    commentCount: events.filter((e) => e.kind === "COMMENT").length,
    created: person(order.createdBy, order.createdAt),
    edited: person(order.updatedBy, order.updatedAt),
    compose: { to: order.contactEmail ?? "", subject: defaultEmailSubject(order.number, order.supplierName, lastEmail?.subject ?? null) },
  };
}
