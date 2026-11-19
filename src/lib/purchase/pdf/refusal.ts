// Frappe's refusal page for a print request it would not serve: a title and the message, as a small
// HTML page (the PDF routes answer it in place of a PDF). Pure.

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function refusalPage(status: number, title: string, message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head><body style="font-family:system-ui,sans-serif;padding:48px;color:#1f2937"><h1 style="font-size:20px;margin:0 0 8px">${escape(title)}</h1><p style="margin:0">${escape(message)}</p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
