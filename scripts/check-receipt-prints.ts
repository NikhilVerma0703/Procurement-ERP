// The receipt print formats against the old site's own prints (owner, 25-11-2026: "exactly same look and same
// work as previous website"). Two checks, both reading only:
//
//  1. The old site's answer for every format of two receipts, read from it on 26-11-2026
//     (frappe.www.printview.get_html_and_style): MM-03457 (a GST receipt) and MM-00407 (30 bags, so 30 QR
//     codes). Kept as fingerprints (SHA-256 of the text, spaces and line breaks aside) — no company data in
//     the repository — and compared with what this ERP prints from the imported receipts: the printed body
//     and the page's style (Frappe's print style and the format's CSS).
//  2. Where the full capture of 24-11-2026 is on this machine (data/erpnext-live, company data), the first
//     difference, if any, shown in the text.
//
//   npx tsx --conditions=react-server scripts/check-receipt-prints.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { db } from "@/lib/purchase/server/db";
import { receiptPrint } from "@/lib/purchase/print/receipt-print";
import { RECEIPT_PRINT_FORMATS } from "@/lib/purchase/print/receipt-formats";

/** The old site's prints, 26-11-2026: [receipt, format] → [body, style] fingerprints. */
const OLD: Record<string, [string, string]> = {
  "PR/25-26/MM-03457 | QR Codes": ["2d5a289ee06b2437", "820b23063dc1e16e"],
  "PR/25-26/MM-03457 | Test PR": ["04ff22cd830442b9", "5a403b5c74f82e07"],
  "PR/25-26/MM-03457 | Purchase Receipt PF": ["eabe4fa5cbeeb4be", "c3e92e1657980da5"],
  "PR/25-26/MM-03457 | Puchase Receipt Format": ["04ff22cd830442b9", "5a403b5c74f82e07"],
  "PR/25-26/MM-03457 | Goods Receipt": ["f57a5e8c5fd15899", "5a403b5c74f82e07"],
  "PR/25-26/MM-00407 | QR Codes": ["d4db536ec27028ca", "820b23063dc1e16e"],
  "PR/25-26/MM-00407 | Test PR": ["1b8449b545ac58f9", "5a403b5c74f82e07"],
  "PR/25-26/MM-00407 | Purchase Receipt PF": ["4cf2edac357d479c", "c3e92e1657980da5"],
  "PR/25-26/MM-00407 | Puchase Receipt Format": ["1b8449b545ac58f9", "5a403b5c74f82e07"],
  "PR/25-26/MM-00407 | Goods Receipt": ["7abf9d2217bf5eb1", "5a403b5c74f82e07"],
};
const CAPTURE = "data/erpnext-live/live-screens-20261124.json";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const fingerprint = (s: string) => createHash("sha256").update(norm(s)).digest("hex").slice(0, 16);
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  return i < 0 ? "" : s.slice(i + a.length, s.indexOf(b, i + a.length));
};
const body = (html: string) => between(html, '<div class="print-format">', "</div></div></body>");
const style = (html: string) => between(html, "<style>", "</style>");

async function main() {
  const snaps = existsSync(CAPTURE) ? (JSON.parse(readFileSync(CAPTURE, "utf8")) as { snaps: { label: string; html: string }[] }).snaps : [];
  let bad = 0;
  for (const key of Object.keys(OLD)) {
    const [number, format] = key.split(" | ");
    const r = await db.purchaseReceipt.findUnique({ where: { number }, select: { id: true } });
    if (!r) throw new Error(`${number} is not in the database`);
    if (!RECEIPT_PRINT_FORMATS.some((f) => f.name === format)) throw new Error(`No format ${format}`);
    const mine = await receiptPrint(r.id, format, { localImages: false });
    if (!mine.ok) throw new Error(mine.error);
    const [b, s] = [fingerprint(body(mine.html)), fingerprint(style(mine.html))];
    if (b === OLD[key][0] && s === OLD[key][1]) {
      console.log(`✓ ${key}: equal to the old print (body and style)`);
      continue;
    }
    bad++;
    console.log(`✗ ${key}: ${b === OLD[key][0] ? "body equal" : "body differs"}, ${s === OLD[key][1] ? "style equal" : "style differs"}`);
    const snap = snaps.find((x) => x.label === `Print - Purchase Receipt ${number.replace(/\//g, "-")} - ${format}`);
    if (snap) {
      const [a, c] = [norm(body(snap.html)), norm(body(mine.html))];
      let i = 0;
      while (i < a.length && a[i] === c[i]) i++;
      console.log(`    old: …${a.slice(Math.max(0, i - 80), i + 120)}\n    new: …${c.slice(Math.max(0, i - 80), i + 120)}`);
    }
  }
  await db.$disconnect();
  if (bad) process.exit(1);
}
main();
