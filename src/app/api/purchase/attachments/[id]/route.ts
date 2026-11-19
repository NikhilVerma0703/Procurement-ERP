// An attachment's file: GET /api/purchase/attachments/<id>. The module gate
// ("view"), then the bytes from the file store. PDFs and pictures open in the
// browser; anything else downloads, and nothing uploaded may run as a page
// of this site (nosniff; a sandboxing CSP on downloads).
import { NextResponse } from "next/server";
import { db } from "@/lib/purchase/server/db";
import { readStoredPath, readStoredFile } from "@/lib/purchase/server/files";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INLINE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const DOWNLOAD: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
};

/** A Content-Disposition file name: ASCII fallback plus the UTF-8 name (RFC 6266). */
const disposition = (kind: "inline" | "attachment", name: string) =>
  `${kind}; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await purchaseGate("view");
  if (!g.ok) return new NextResponse(purchaseRefusal(g), { status: g.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const { id } = await params;
  const a = await db.purchaseAttachment.findUnique({ where: { id }, select: { fileName: true, fileUrl: true, storagePath: true } });
  if (!a) return new NextResponse("File not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const bytes = (a.storagePath ? await readStoredPath(a.storagePath) : null) ?? (await readStoredFile(a.fileUrl));
  if (!bytes) return new NextResponse("File not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const ext = (a.fileName.split(".").pop() ?? "").toLowerCase();
  const inline = INLINE[ext];
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": inline ?? DOWNLOAD[ext] ?? "application/octet-stream",
      "Content-Disposition": disposition(inline ? "inline" : "attachment", a.fileName),
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      // A download may be anything; a sandbox keeps it from acting as a page of this site. (Not on a
      // PDF or picture shown inline: Chrome's PDF viewer will not open in a sandbox.)
      ...(inline ? {} : { "Content-Security-Policy": "sandbox" }),
      "Cache-Control": "private, no-store",
    },
  });
}
