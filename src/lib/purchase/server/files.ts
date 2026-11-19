// The module's file store: the files the old site served as "/files/<name>"
// (public) and "/private/files/<name>" (private) — the PO attachments and the
// letter-head logo the PO sheets print — each kept by its place
// ("files/private/x.pdf", lib/purchase/file-paths.ts).
//
// IN THE DATABASE (purchase_files), in standalone as after the merge: the
// Main ERP runs on Vercel, with no lasting disk, and keeps uploaded files as
// bytes in its own tables (its Lab attachments, its commercial document
// blobs). Step 9 moved the store here from a folder (data/storage/purchase),
// so the merge carries this file across unchanged. The importer fills it from
// the backup's file archives (lib/purchase/migrate/files.ts).
import "server-only";
import { safeStorePath, storePathOfUrl } from "../file-paths";
import { db } from "./db";

/** A stored file's bytes by its old-site URL ("/files/x.png", "/private/files/x.pdf"); null when it is not there. */
export async function readStoredFile(url: string): Promise<Buffer | null> {
  const path = storePathOfUrl(url);
  return path ? readStoredPath(path) : null;
}

/** A file's bytes by its place in the store (an attachment's storagePath); null when it is not there. */
export async function readStoredPath(relative: string): Promise<Buffer | null> {
  const path = safeStorePath(relative);
  if (!path) return null;
  const f = await db.purchaseFile.findUnique({ where: { path }, select: { bytes: true } });
  return f ? Buffer.from(f.bytes) : null;
}

/** Is there a file at this place in the store? */
export async function storedPathExists(relative: string): Promise<boolean> {
  const path = safeStorePath(relative);
  return path ? (await db.purchaseFile.count({ where: { path } })) > 0 : false;
}

/** Stores a file at a place. A place already taken is refused, as the folder store refused it. */
export async function writeStoredPath(relative: string, bytes: Buffer): Promise<void> {
  const path = safeStorePath(relative);
  if (!path) throw new Error("A file must stay inside the file store.");
  await db.purchaseFile.create({ data: { path, bytes: new Uint8Array(bytes), sizeBytes: bytes.length } });
}

/** Removes a file from the store; a file already gone is fine. */
export async function deleteStoredPath(relative: string): Promise<void> {
  const path = safeStorePath(relative);
  if (!path) return;
  await db.purchaseFile.deleteMany({ where: { path } });
}
