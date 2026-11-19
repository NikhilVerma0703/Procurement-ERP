// Attach a file to a PO: POST multipart form data, "file" and "is_private"
// ("1" or "0"; private when left out, as the old uploader's default was).
// The module gate ("attach"), then lib/purchase/orders/attachments.ts.
// Answers { ok, error } as JSON.
import { NextResponse, type NextRequest } from "next/server";
import { addAttachment, ATTACHMENT_TOO_BIG, MAX_ATTACHMENT_BYTES } from "@/lib/purchase/orders/attachments";
import { FORM_OVERHEAD_BYTES } from "@/lib/purchase/orders/attachment-limit";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { purchaseWrite } from "@/lib/purchase/server/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// As the Main ERP's Lab uploads route: storing a file of up to 4 MB in the database, on Vercel.
export const maxDuration = 30;

const answer = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await purchaseGate("attach");
  if (!g.ok || !g.user) return answer(g.status, { ok: false, error: g.status === 401 ? purchaseRefusal(g) : "You are not permitted to do this." });
  const user = g.user;
  const { id } = await params;
  // Refuse an oversized body before reading it (Vercel itself refuses a body near 4.5 MB). The form
  // adds a little around the file, so the declared length may pass the limit by that much.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + FORM_OVERHEAD_BYTES) return answer(413, { ok: false, error: ATTACHMENT_TOO_BIG });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return answer(400, { ok: false, error: "No file was sent." });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return answer(400, { ok: false, error: "No file was sent." });
  if (file.size > MAX_ATTACHMENT_BYTES) return answer(413, { ok: false, error: ATTACHMENT_TOO_BIG });
  const isPrivate = form.get("is_private") !== "0";
  const bytes = Buffer.from(await file.arrayBuffer());
  const w = await purchaseWrite(user, () => addAttachment(user, id, { name: file.name, bytes, isPrivate }));
  if (!w.done) return answer(403, { ok: false, error: w.refusal });
  return answer(w.value.ok ? 200 : 400, w.value as Record<string, unknown>);
}
