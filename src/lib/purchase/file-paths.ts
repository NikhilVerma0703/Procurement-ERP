// Where a file lives in the module's file store (server/files.ts): its place
// is "files/public/<name>" or "files/private/<name>", the old site's
// /files/<name> and /private/files/<name>. These rules keep a place from
// being anything else, whatever a stored row or a URL says. Pure.

/** The place as given, when it is a place: files/public|private/ and a name, with no "..", "." or empty part. */
export function safeStorePath(p: string): string | null {
  if (!/^files\/(public|private)\/./.test(p)) return null;
  if (p.includes("\\") || p.includes("\0")) return null;
  if (p.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return p;
}

/** The place of an old-site file URL ("/files/x.png" → "files/public/x.png"); null for any other URL. */
export function storePathOfUrl(url: string): string | null {
  const m = /^\/(private\/)?files\/(.+)$/.exec(url);
  if (!m) return null;
  let name = m[2];
  try {
    // The importer stores a file under its decoded name ("a%20b.pdf" is kept as "a b.pdf").
    name = decodeURI(name);
  } catch {
    /* not valid percent-encoding: the name as written */
  }
  return safeStorePath(`files/${m[1] ? "private" : "public"}/${name}`);
}
