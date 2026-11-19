// The module's file store: files the old site served as "/files/<name>"
// (public) and "/private/files/<name>" (private) — the PO attachments and the
// letter-head logo the PO sheets print — taken out of the backup by the
// importer (lib/purchase/migrate/files.ts).
//
// STANDALONE: a folder, data/storage/purchase (or PURCHASE_FILE_STORE), with
// files/public and files/private under it. AT THE MERGE: the Main ERP's own
// file storage, behind these same two functions.
import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export function fileStoreRoot(): string {
  return resolve(process.cwd(), process.env.PURCHASE_FILE_STORE ?? "data/storage/purchase");
}

/** A stored file's bytes by its old-site URL ("/files/x.png", "/private/files/x.pdf"); null when it is not there. */
export async function readStoredFile(url: string): Promise<Buffer | null> {
  const m = /^\/(private\/)?files\/(.+)$/.exec(url);
  if (!m) return null;
  const base = resolve(fileStoreRoot(), "files", m[1] ? "private" : "public");
  const path = resolve(base, ...m[2].split("/"));
  // Never outside the store, whatever the URL says.
  if (!path.startsWith(base + sep)) return null;
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/** A path inside the store ("files/private/x.pdf"), or null when it would lead outside it. */
function storePath(relative: string): string | null {
  const root = fileStoreRoot();
  const path = resolve(root, ...relative.split("/"));
  return path.startsWith(root + sep) ? path : null;
}

/** A file's bytes by its place in the store (an attachment's storagePath); null when it is not there. */
export async function readStoredPath(relative: string): Promise<Buffer | null> {
  const path = storePath(relative);
  if (!path) return null;
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/** Is there a file at this place in the store? */
export async function storedPathExists(relative: string): Promise<boolean> {
  return (await readStoredPath(relative)) !== null;
}

/** Writes a file at a place in the store (folders made as needed). */
export async function writeStoredPath(relative: string, bytes: Buffer): Promise<void> {
  const path = storePath(relative);
  if (!path) throw new Error("A file must stay inside the file store.");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}

/** Removes a file from the store; a file already gone is fine. */
export async function deleteStoredPath(relative: string): Promise<void> {
  const path = storePath(relative);
  if (!path) return;
  try {
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
