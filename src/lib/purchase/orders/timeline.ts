// A PO's timeline as ERPNext 14 drew it under the form, built from the PO's
// events (purchase_order_events: the old site's Versions, Comments and
// Communications, and this app's own, written in the same shapes). Ported
// from Frappe 14.101.1: form/footer/form_timeline.js, form/footer/
// version_timeline_content_builder.js, form/templates/timeline_message_box.html
// and desk/form/load.py (get_docinfo):
//   * versions: only the newest 10. Each gives up to four lines:
//     "X submitted this document" / "X cancelled this document" (when the
//     docstatus change is reached), "X changed value of A from a to b, …" (the
//     first three visible fields; the list is read in order and stops at the
//     third, so on most approvals the docstatus change is never reached),
//     "X changed values for A from a to b in row #n, …" and "X added rows for
//     Items" / "X removed rows for …" (one name per row);
//   * workflow lines ("X Approved"), status labels and notes ("X To Receive and
//     Bill"), attachment lines ("X Added file.pdf");
//   * comments and emails as cards; emails beyond the newest 20 behind "Load
//     More Communications";
//   * newest first.
// A value is cut to 40 characters and shown in bold (format_content_for_timeline).
// Hidden fields (Workflow State among them) are never named (doc-meta.ts). Pure.
import { FIELD_LABELS, TABLE_DOCTYPES } from "./doc-meta";

/** A piece of a timeline line. */
export interface Run {
  text: string;
  bold?: boolean;
  /** A link (an attachment's file). */
  href?: string;
  /** The lock the old timeline put after a private file's name. */
  lock?: boolean;
}

export type TimelineEventKind = "VERSION" | "WORKFLOW" | "LABEL" | "COMMENT" | "ATTACHMENT" | "EMAIL" | "DELETED" | "INFO";

export interface TimelineEvent {
  id: string;
  /** Where it came from: the old site's Version / Comment / Communication, or "app". */
  source: string;
  kind: TimelineEventKind;
  at: Date;
  byEmail: string | null;
  subject: string | null;
  content: string | null;
  data: unknown;
}

export interface TimelineLine {
  type: "line";
  id: string;
  at: string;
  /** The badge: a workflow step, a file added or removed; none for the rest. */
  icon: "workflow" | "upload" | "remove" | null;
  runs: Run[];
}

export interface TimelineComment {
  type: "comment";
  id: string;
  at: string;
  byEmail: string;
  byName: string;
  /** The comment as stored (the page sanitises it before showing it). */
  html: string;
}

export interface TimelineEmail {
  type: "email";
  id: string;
  at: string;
  /** A notification ("Notification sent to …") rather than an email someone wrote. */
  automated: boolean;
  byName: string;
  /** Who sent it (for Reply). */
  senderEmail: string | null;
  /** Recipients, cc and bcc, by name where known. */
  to: string[];
  /** The recipients' addresses (for Reply on one's own email, and Reply All). */
  toEmails: string[];
  /** The cc addresses (for Reply All). */
  ccEmails: string[];
  subject: string | null;
  html: string;
  /** Delivery status ("Sent", "Not Sent", "Error"), when known. */
  status: string | null;
  /** Why it was not sent, when it was not. */
  error: string | null;
  /** What went with it: the PO's sheet (in its layout) and attached files, linked while they exist. */
  files: { name: string; href: string | null }[];
}

export type TimelineItem = TimelineLine | TimelineComment | TimelineEmail;

export interface TimelineOptions {
  /** A user's full name by email (the email itself when unknown, as Frappe's user_info did). */
  nameOf: (email: string) => string;
  /** The link for a file the old site served at this URL, when it is still attached. */
  fileHref?: (fileUrl: string) => string | null;
  /** The link for an attachment by id, when it is still attached. */
  attachmentHref?: (id: string) => string | null;
  /** The PO's sheet in a layout: its file name and link. */
  sheet?: (layout: string) => { name: string; href: string };
}

/** How many versions the timeline shows (load.py: get_versions, limit=10). */
export const VERSIONS_SHOWN = 10;
/** How many emails show before "Load More Communications" (load.py: limit=21, form_timeline.js: 20). */
export const EMAILS_SHOWN = 20;

/** The text of some HTML, as the browser's textContent gives it (no line breaks added). */
export function textContent(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** format_content_for_timeline: the value's text, cut to 40 characters, bold; "" for nothing. */
export function timelineValue(v: unknown): Run {
  let text = v === null || v === undefined ? "" : textContent(String(v));
  if (text.length > 40) text = `${text.slice(0, 40)}...`;
  return { text: text || '""', bold: true };
}

const join = (parts: Run[][], sep: string): Run[] => parts.flatMap((p, i) => (i ? [{ text: sep }, ...p] : p));

type Change = [string, unknown, unknown];
interface VersionShape {
  comment?: string;
  changed?: Change[];
  row_changed?: [string, number, string, Change[]][];
  added?: [string, unknown][];
  removed?: [string, unknown][];
  updater_reference?: { label?: string; doctype?: string } | null;
  audit_user?: string;
}

/** The lines one version gives (version_timeline_content_builder.js). */
export function versionLines(data: unknown, user: string): Run[][] {
  const v = (data ?? {}) as VersionShape;
  const who: Run = { text: user, bold: true };
  if (v.comment) return [[{ text: textContent(v.comment) }]];
  const ref = v.updater_reference && (v.updater_reference.label || v.updater_reference.doctype)
    ? v.updater_reference.label || `via ${v.updater_reference.doctype}`
    : null;
  const tail: Run[] = ref ? [{ text: ` ${ref}` }] : [];
  const out: Run[][] = [];

  // Values changed on the PO: the list is read until three visible fields are named.
  const parts: Run[][] = [];
  for (const p of v.changed ?? []) {
    if (p[0] === "docstatus") {
      if (p[2] === 1) out.push([who, { text: " submitted this document" }, ...tail]);
      else if (p[2] === 2) out.push([who, { text: " cancelled this document" }, ...tail]);
    } else {
      const label = FIELD_LABELS["Purchase Order"][p[0]];
      if (label) parts.push([{ text: `${label} from ` }, timelineValue(p[1]), { text: " to " }, timelineValue(p[2])]);
    }
    if (parts.length >= 3) break;
  }
  if (parts.length) out.push([who, { text: " changed value of " }, ...join(parts, ", "), ...tail]);

  // Values changed in the rows, three at most over all the rows.
  const rowParts: Run[][] = [];
  rows: for (const row of v.row_changed ?? []) {
    const doctype = TABLE_DOCTYPES[row[0]];
    for (const p of row[3] ?? []) {
      const label = doctype ? FIELD_LABELS[doctype][p[0]] : undefined;
      if (label) rowParts.push([{ text: `${label} from ` }, timelineValue(p[1]), { text: " to " }, timelineValue(p[2]), { text: ` in row #${Number(row[1]) + 1}` }]);
      if (rowParts.length >= 3) break rows;
    }
  }
  if (rowParts.length) out.push([who, { text: " changed values for " }, ...join(rowParts, ", "), ...tail]);

  // Rows added or removed: the table's name once per row.
  for (const key of ["added", "removed"] as const) {
    const labels = (v[key] ?? []).map((p) => FIELD_LABELS["Purchase Order"][p[0]]).filter(Boolean);
    if (labels.length) out.push([who, { text: ` ${key} rows for ${labels.join(", ")}` }]);
  }

  if (v.audit_user) return out.map((runs) => [...runs, { text: " · " }, { text: `[Action taken by ${v.audit_user}]`, bold: true }]);
  return out;
}

/** "Added <a href=…>file.pdf</a>" (or "Removed file.pdf") as runs, the file linked while it is attached. */
function attachmentRuns(html: string, o: TimelineOptions): Run[] {
  const m = /^(.*?)<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>(.*)$/is.exec(html);
  if (!m) return [{ text: textContent(html).trim() }];
  let url = m[2];
  try {
    url = decodeURI(m[2]);
  } catch {
    // A malformed escape: look the URL up as it is.
  }
  const href = o.fileHref?.(url) ?? null;
  const after = textContent(m[4]).trim();
  return [
    { text: textContent(m[1]) },
    { text: textContent(m[3]), ...(href ? { href } : {}) },
    ...(/fa-lock/.test(m[4]) ? [{ text: "", lock: true }] : []),
    ...(after ? [{ text: ` ${after}` }] : []),
  ];
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const emails = (v: unknown): string[] => (str(v) ?? "").split(",").map((e) => e.trim()).filter(Boolean);

/** The PO's timeline items, newest first, from all its events. */
export function buildTimeline(events: TimelineEvent[], o: TimelineOptions): TimelineItem[] {
  const newestFirst = [...events].sort((a, b) => b.at.getTime() - a.at.getTime());
  const of = (kind: TimelineEventKind) => newestFirst.filter((e) => e.kind === kind);
  const name = (e: TimelineEvent) => o.nameOf(e.byEmail ?? "Administrator");
  const at = (e: TimelineEvent) => e.at.toISOString();
  const items: TimelineItem[] = [];

  // In ERPNext's order, so that lines at the same moment keep it: emails, comments, versions,
  // workflow, attachments, then notes.
  for (const e of of("EMAIL")) {
    const d = (e.data ?? {}) as Record<string, unknown>;
    const type = str(d.communicationType) ?? (e.source === "app" ? "Communication" : "Automated Message");
    const layout = str(d.printFormat);
    const attached = Array.isArray(d.attachments) ? (d.attachments as { id?: unknown; fileName?: unknown }[]) : [];
    items.push({
      type: "email",
      id: e.id,
      at: at(e),
      automated: type === "Automated Message",
      byName: name(e),
      senderEmail: e.byEmail,
      to: [...emails(d.recipients), ...emails(d.cc), ...emails(d.bcc)].map((x) => o.nameOf(x)),
      toEmails: emails(d.recipients),
      ccEmails: emails(d.cc),
      subject: e.subject,
      html: e.content ?? "",
      status: str(d.deliveryStatus) ?? null,
      error: str(d.error),
      files: [
        ...(layout && o.sheet ? [o.sheet(layout)] : []),
        ...attached.map((a) => ({ name: String(a.fileName ?? ""), href: typeof a.id === "string" ? (o.attachmentHref?.(a.id) ?? null) : null })),
      ],
    });
  }
  for (const e of of("COMMENT")) {
    items.push({ type: "comment", id: e.id, at: at(e), byEmail: e.byEmail ?? "", byName: name(e), html: e.content ?? "" });
  }
  for (const e of of("VERSION").slice(0, VERSIONS_SHOWN)) {
    versionLines(e.data, name(e)).forEach((runs, i) => items.push({ type: "line", id: `${e.id}:${i}`, at: at(e), icon: null, runs }));
  }
  for (const e of of("WORKFLOW")) {
    items.push({ type: "line", id: e.id, at: at(e), icon: "workflow", runs: [{ text: name(e), bold: true }, { text: ` ${e.content ?? ""}` }] });
  }
  for (const e of of("ATTACHMENT")) {
    const removed = e.subject === "Attachment Removed";
    items.push({ type: "line", id: e.id, at: at(e), icon: removed ? "remove" : "upload", runs: [{ text: name(e), bold: true }, { text: " " }, ...attachmentRuns(e.content ?? "", o)] });
  }
  for (const e of newestFirst.filter((x) => x.kind === "LABEL" || x.kind === "INFO")) {
    items.push({ type: "line", id: e.id, at: at(e), icon: null, runs: [{ text: name(e), bold: true }, { text: ` ${textContent(e.content ?? "")}` }] });
  }
  // A stable sort keeps the order above among lines at the same moment.
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
