// Takes the PO attachments (and the letter-head logo the PO sheets print)
// out of the backup's file archives into this system's file store, the
// purchase_files table (server/files.ts), through the writer the run passes.
//
// ERPNext's "Download Files Backup" gives two plain tar archives, public and
// private files, with paths like "<site>/public/files/<name>". A file record's
// URL is "/files/<name>" or "/private/files/<name>"; that is how they meet.
import { readFile } from "node:fs/promises";

export interface TarEntry {
  name: string;
  data: Buffer;
}

const cstr = (b: Buffer, from: number, len: number) => {
  const s = b.subarray(from, from + len);
  const z = s.indexOf(0);
  return s.subarray(0, z === -1 ? s.length : z).toString("utf8");
};

/** The regular files of a tar archive (ustar, GNU long names and pax paths understood). */
export function tarEntries(buf: Buffer): TarEntry[] {
  const out: TarEntry[] = [];
  let off = 0;
  let longName: string | null = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const size = parseInt(cstr(h, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = cstr(h, 257, 6).startsWith("ustar") ? cstr(h, 345, 155) : "";
    const data = buf.subarray(off + 512, off + 512 + size);
    let name = longName ?? (prefix ? `${prefix}/${cstr(h, 0, 100)}` : cstr(h, 0, 100));
    longName = null;
    if (type === "L") {
      longName = cstr(data, 0, data.length);
    } else if (type === "x") {
      const path = /\d+ path=([^\n]*)\n/.exec(data.toString("utf8"));
      if (path) longName = path[1];
    } else if (type === "0" || type === "\0") {
      out.push({ name, data: Buffer.from(data) });
    }
    off += 512 + Math.ceil(size / 512) * 512;
    name = "";
  }
  return out;
}

export interface FileToRestore {
  /** "/files/<name>" or "/private/files/<name>", as the old site served it. */
  fileUrl: string;
}

export interface RestoredFile {
  fileUrl: string;
  /** Relative to the file store, e.g. "files/public/<name>". */
  storagePath: string | null;
  bytes: number;
}

/**
 * Finds each wanted file in the archives and stores it with `store` at its place
 * ("files/public/<name>"). Files not found are returned with storagePath null (the report lists them).
 */
export async function restoreFiles(
  archives: { publicTar: string; privateTar: string },
  wanted: readonly FileToRestore[],
  store: (storagePath: string, data: Buffer) => Promise<void>,
): Promise<RestoredFile[]> {
  const [pub, priv] = await Promise.all([readFile(archives.publicTar), readFile(archives.privateTar)]);
  const index = new Map<string, Buffer>();
  for (const e of tarEntries(pub)) {
    const m = /\/public(\/files\/.+)$/.exec(e.name);
    if (m) index.set(m[1], e.data);
  }
  for (const e of tarEntries(priv)) {
    const m = /\/private(\/files\/.+)$/.exec(e.name);
    if (m) index.set(`/private${m[1]}`, e.data);
  }
  const results: RestoredFile[] = [];
  for (const w of wanted) {
    const url = decodeURI(w.fileUrl);
    const data = index.get(url);
    if (!data) {
      results.push({ fileUrl: w.fileUrl, storagePath: null, bytes: 0 });
      continue;
    }
    const isPrivate = url.startsWith("/private/");
    const name = url.replace(/^\/(private\/)?files\//, "");
    const storagePath = `files/${isPrivate ? "private" : "public"}/${name}`;
    await store(storagePath, data);
    results.push({ fileUrl: w.fileUrl, storagePath, bytes: data.length });
  }
  return results;
}
