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

/** Allowed tags only, no attributes, text escaped. Unknown tags are dropped, their text kept. */
export function sanitizeHtml(input: string | null | undefined): string {
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
      if (!ALLOWED.has(name)) continue;
      if (VOID.has(name)) out += closing ? "" : "<br>";
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
