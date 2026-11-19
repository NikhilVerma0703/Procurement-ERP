// How an attached file is named in the store, as Frappe 14's File did it
// (core/doctype/file/file.py): the base name only, no control characters, at
// most 140 characters (the old field's length); another file of the same name
// gets the end of its hash before the extension (get_file_name). Pure.

/** A file name as stored. */
export function cleanFileName(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const s = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!s || s === "." || s === "..") return "file";
  if (s.length <= 140) return s;
  const dot = s.lastIndexOf(".");
  const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : "";
  return s.slice(0, 140 - ext.length) + ext;
}

/** "Invoice.pdf" with a suffix before the extension: "Invoice3f2a1b.pdf". */
export function withSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}${suffix}${name.slice(dot)}` : `${name}${suffix}`;
}
