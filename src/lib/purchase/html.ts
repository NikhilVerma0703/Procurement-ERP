// Rich text the PO keeps (Terms and Conditions): what may be stored and shown.
//
// The old site's terms are simple formatted text (paragraphs, line breaks,
// bold, italics, underline, lists, a heading; checked over all 3,199 POs).
// Whatever the editor sends is cut down to exactly that: an allow-list of
// tags, with every attribute removed, so nothing stored can run script or
// load anything when shown or printed. Pure, no DOM: runs on the server.

const ALLOWED = new Set(["p", "div", "br", "span", "strong", "b", "em", "i", "u", "s", "ol", "ul", "li", "h1", "h2", "h3", "h4", "blockquote"]);
const VOID = new Set(["br"]);
/** Elements dropped with everything inside them. */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math", "textarea", "select"]);

const TAG = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)\s*>/;
const ENTITY = /^&(#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/;

/**
 * With `tables` (Phase II, 21-11-2026): a document's read-only Tax Breakup and GST Breakup are
 * tables (ERPNext's and India Compliance's HTML), so table elements are allowed too, keeping only
 * plain class names and colspan / rowspan — still nothing that could run or load anything.
 */
const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col"]);
const ATTR = /\s([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;

function tableAttributes(tag: string): string {
  let out = "";
  for (const m of tag.matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (name === "class" && /^[A-Za-z0-9 _-]{1,100}$/.test(value)) out += ` class="${value}"`;
    if ((name === "colspan" || name === "rowspan") && /^\d{1,3}$/.test(value)) out += ` ${name}="${value}"`;
  }
  return out;
}

/** Allowed tags only, no attributes, text escaped. Unknown tags are dropped, their text kept. */
export function sanitizeHtml(input: string | null | undefined, opts: { tables?: boolean } = {}): string {
  const s = String(input ?? "");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "<") {
      if (s.startsWith("<!--", i)) {
        const end = s.indexOf("-->", i + 4);
        i = end === -1 ? s.length : end + 3;
        continue;
      }
      const m = TAG.exec(s.slice(i, i + 2000));
      if (!m) {
        out += "&lt;";
        i += 1;
        continue;
      }
      const [whole, closing, rawName] = m;
      const name = rawName.toLowerCase();
      i += whole.length;
      if (DROP_WITH_CONTENT.has(name) && !closing) {
        const close = new RegExp(`<\\s*/\\s*${name}\\s*>`, "i").exec(s.slice(i));
        i = close ? i + close.index + close[0].length : s.length;
        continue;
      }
      const table = !!opts.tables && TABLE_TAGS.has(name);
      if (!ALLOWED.has(name) && !table) continue;
      if (VOID.has(name)) out += closing ? "" : "<br>";
      else if (name === "col") out += closing ? "" : `<col${tableAttributes(whole)}>`;
      else if (table || (opts.tables && name === "div")) out += closing ? `</${name}>` : `<${name}${tableAttributes(whole)}>`;
      else out += closing ? `</${name}>` : `<${name}>`;
      continue;
    }
    if (ch === "&") {
      const e = ENTITY.exec(s.slice(i, i + 40));
      if (e) {
        out += e[0];
        i += e[0].length;
      } else {
        out += "&amp;";
        i += 1;
      }
      continue;
    }
    out += ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : ch;
    i += 1;
  }
  return out;
}

/** Is there any text in it? (An empty editor leaves "<p><br></p>".) */
/** Text safe to place in HTML (the GST breakup's HSN codes, Phase II). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function htmlIsEmpty(html: string | null | undefined): boolean {
  return htmlToText(html).trim() === "";
}

/** The text of stored rich text, for places that show plain text. */
export function htmlToText(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
