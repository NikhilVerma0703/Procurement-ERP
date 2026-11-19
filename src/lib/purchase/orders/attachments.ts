// Files attached to a PO, as the old form's sidebar handled them (Frappe 14:
// core/doctype/file/file.py, desk/form/utils.py remove_attach):
//   * a file is private unless the user chose otherwise ("/private/files/x"),
//     public ones are "/files/x", both kept in the module's file store;
//   * the same bytes attached again (same privacy) reuse the stored file;
//     another file of the same name gets the end of its hash before the
//     extension ("Invoice3f2a1b.pdf"), as get_file_name did;
//   * at most 10 MB (Frappe's default max_file_size);
//   * attaching writes "Added <file>" on the timeline (a lock for a private
//     file), removing writes "Removed <file>"; the bytes go only when no other
//     attachment uses them.
// Server only.
import "server-only";
import { createHash } from "node:crypto";
import { db } from "../server/db";
import type { PurchaseUser } from "../server/current-user";
import { deleteStoredPath, readStoredPath, writeStoredPath } from "../server/files";
import { cleanFileName, withSuffix } from "./attachment-names";
import type { ActionResult } from "./form-schema";

/** Frappe's default largest upload. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** The URL as Frappe quoted it in the timeline (quote(file_url, safe="/:")). */
const quoteUrl = (url: string) => encodeURI(url).replace(/[?#]/g, encodeURIComponent);

export async function addAttachment(
  user: PurchaseUser,
  orderId: string,
  file: { name: string; bytes: Buffer; isPrivate: boolean },
): Promise<ActionResult<{ id: string; fileName: string }>> {
  if (!file.bytes.length) return { ok: false, error: "The file is empty." };
  if (file.bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: "File size exceeded the maximum allowed size of 10.0 MB" };
  const order = await db.purchaseOrder.findUnique({ where: { id: orderId }, select: { id: true, number: true } });
  if (!order) return { ok: false, error: "Purchase Order not found" };

  const hash = createHash("md5").update(file.bytes).digest("hex");
  const folder = file.isPrivate ? "private" : "public";
  let fileName = cleanFileName(file.name);
  let storagePath = `files/${folder}/${fileName}`;
  // The same bytes already stored, with the same privacy: point at them (Frappe's duplicate_file).
  const same = await db.purchaseAttachment.findFirst({ where: { contentHash: hash, isPrivate: file.isPrivate, storagePath: { not: null } }, select: { fileName: true, storagePath: true } });
  if (same?.storagePath && (await readStoredPath(same.storagePath))) {
    storagePath = same.storagePath;
    fileName = same.fileName;
  } else {
    const existing = await readStoredPath(storagePath);
    if (existing) {
      fileName = withSuffix(fileName, hash.slice(-6));
      storagePath = `files/${folder}/${fileName}`;
    }
    if (!(await readStoredPath(storagePath))) await writeStoredPath(storagePath, file.bytes);
  }
  const fileUrl = `${file.isPrivate ? "/private" : ""}/files/${fileName}`;
  const now = new Date();
  const row = await db.$transaction(async (tx) => {
    const a = await tx.purchaseAttachment.create({
      data: { orderId: order.id, fileName, fileUrl, isPrivate: file.isPrivate, fileSize: file.bytes.length, contentHash: hash, storagePath, uploadedBy: user.email, uploadedAt: now },
      select: { id: true },
    });
    await tx.purchaseOrderEvent.create({
      data: {
        source: "app",
        orderId: order.id,
        orderNumber: order.number,
        kind: "ATTACHMENT",
        subject: "Attachment",
        at: now,
        byEmail: user.email,
        content: `Added <a href="${escapeHtml(quoteUrl(fileUrl))}" target="_blank">${escapeHtml(fileName)}</a>${file.isPrivate ? ' <i class="fa fa-lock text-warning"></i>' : ""}`,
      },
    });
    return a;
  });
  return { ok: true, value: { id: row.id, fileName } };
}

export async function removeAttachment(user: PurchaseUser, id: string): Promise<ActionResult<{ orderId: string | null }>> {
  const a = await db.purchaseAttachment.findUnique({ where: { id }, include: { order: { select: { id: true, number: true } } } });
  if (!a) return { ok: false, error: "Attachment not found" };
  await db.$transaction(async (tx) => {
    await tx.purchaseAttachment.delete({ where: { id } });
    if (a.order) {
      await tx.purchaseOrderEvent.create({
        data: {
          source: "app",
          orderId: a.order.id,
          orderNumber: a.order.number,
          kind: "ATTACHMENT",
          subject: "Attachment Removed",
          at: new Date(),
          byEmail: user.email,
          content: `Removed ${escapeHtml(a.fileName)}`,
        },
      });
    }
  });
  // The bytes go when nothing else points at them.
  if (a.storagePath && !(await db.purchaseAttachment.count({ where: { storagePath: a.storagePath } }))) await deleteStoredPath(a.storagePath);
  return { ok: true, value: { orderId: a.orderId } };
}
