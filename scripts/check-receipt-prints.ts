// The receipt print formats against the old site's own prints (owner, 25-11-2026: "exactly same look and
// same work as previous website"): PR/25-26/MM-03457 printed in each format on the old site on 24-11-2026
// (data/erpnext-live/live-screens-20261124.json, company data, not in git), and here from the imported
// receipt. Compares the page's head (Frappe's print style and the format's CSS) and the printed body,
// spaces and line breaks aside. Reads only.
//
//   npx tsx --conditions=react-server scripts/check-receipt-prints.ts
import { existsSync, readFileSync } from "node:fs";
import { db } from "@/lib/purchase/server/db";
import { receiptPrint } from "@/lib/purchase/print/receipt-print";
import { RECEIPT_PRINT_FORMATS } from "@/lib/purchase/print/receipt-formats";

const RECEIPT = "PR/25-26/MM-03457";
const CAPTURE = "data/erpnext-live/live-screens-20261124.json";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  return i < 0 ? "" : s.slice(i + a.length, s.indexOf(b, i + a.length));
};
const body = (html: string) => between(html, '<div class="print-format">', "</div></div></body>");

async function main() {
  if (!existsSync(CAPTURE)) throw new Error(`${CAPTURE} is not on this machine`);
  const snaps = (JSON.parse(readFileSync(CAPTURE, "utf8")) as { snaps: { label: string; html: string }[] }).snaps;
  const r = await db.purchaseReceipt.findUnique({ where: { number: RECEIPT }, select: { id: true } });
  if (!r) throw new Error(`${RECEIPT} is not in the database`);
  let bad = 0;
  for (const f of RECEIPT_PRINT_FORMATS) {
    const snap = snaps.find((s) => s.label === `Print - Purchase Receipt ${RECEIPT.replace(/\//g, "-")} - ${f.name}`);
    if (!snap) {
      console.log(`  ${f.name}: no capture (the old site's print of it was not saved)`);
      continue;
    }
    const mine = await receiptPrint(r.id, f.name, { localImages: false });
    if (!mine.ok) throw new Error(mine.error);
    const headOld = norm(between(snap.html, "<style>", "</style>"));
    const headNew = norm(between(mine.html, "<style>", "</style>"));
    const [a, b] = [norm(body(snap.html)), norm(body(mine.html))];
    const ok = headOld === headNew && a === b;
    if (!ok) {
      bad++;
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      console.log(`✗ ${f.name}: ${headOld === headNew ? "head equal" : "head differs"}; body differs at ${i}:\n    old: …${a.slice(Math.max(0, i - 80), i + 120)}\n    new: …${b.slice(Math.max(0, i - 80), i + 120)}`);
    } else console.log(`✓ ${f.name}: head and body equal (${a.length} characters)`);
  }
  await db.$disconnect();
  if (bad) process.exit(1);
}
main();
