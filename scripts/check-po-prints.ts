// The Purchase Order print formats against the old site's own output (owner, 26-11-2026: "The final printed
// Purchase Order must look the same as the original website's Purchase Order Template"). Every format of four
// POs — in-state GST (02512), out-of-state IGST (02510), a USD import (02263), a recent one (02560) — read from
// the old site on 26-11-2026 (frappe.www.printview.get_html_and_style, the PO loaded by its name as Print / Full
// Page / PDF loaded it) and kept as fingerprints (SHA-256 of the text, spaces aside); compared with what this ERP
// prints from the imported POs. Reads only.
//
//   npm run check:po-prints
import { createHash } from "node:crypto";
import { db } from "@/lib/purchase/server/db";
import { orderPrint } from "@/lib/purchase/print/po-print";

const OLD: Record<string, [string, string]> = {
  "PUR-ORD/25-26/02512 | PDF PO": ["1d98881305029ee1", "3c807e03457e4866"],
  "PUR-ORD/25-26/02512 | Standard": ["45252adf9c741045", "820b23063dc1e16e"],
  "PUR-ORD/25-26/02512 | Test Future Lab PO": ["40fe29cdf4a4beeb", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | tecnosint": ["66475d3af4e16443", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | PURCHASE ORDER TEMPLATE": ["441d56dabf6ec566", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | Purchase Order Print": ["9a4651f1e20b6a9f", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | Purchase Order 2025": ["a984c6e210a3960b", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | Purchase Order": ["ff1ae0caf29b7093", "3c7a513ea89278a7"],
  "PUR-ORD/25-26/02512 | PO print format": ["484bdc4f3db9adae", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | Import PO": ["bc6abdc3837d7e6c", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | Future Lab PO": ["fdd7d368ffcf394c", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02512 | Drop Shipping Format": ["ea6708017cf8a9d5", "820b23063dc1e16e"],
  "PUR-ORD/25-26/02510 | PDF PO": ["e675991e8d81b4d4", "3c807e03457e4866"],
  "PUR-ORD/25-26/02510 | Standard": ["1f91559a424b890e", "820b23063dc1e16e"],
  "PUR-ORD/25-26/02510 | Test Future Lab PO": ["24d5914b3b6bf51e", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | tecnosint": ["b60a695f45bcda11", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | PURCHASE ORDER TEMPLATE": ["4f2572a9d64858d4", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | Purchase Order Print": ["40eefd0410c7138f", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | Purchase Order 2025": ["9c287afb3b8a5bfe", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | Purchase Order": ["4a8af81cd425765f", "3c7a513ea89278a7"],
  "PUR-ORD/25-26/02510 | PO print format": ["07404904127c9938", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | Import PO": ["c9078388c5a85ccc", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | Future Lab PO": ["7ae80d3d8f02e177", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02510 | Drop Shipping Format": ["519d4483d628b9d0", "820b23063dc1e16e"],
  "PUR-ORD/25-26/02263 | PDF PO": ["610bf16b54b90bdb", "3c807e03457e4866"],
  "PUR-ORD/25-26/02263 | Standard": ["e6c252d6c908400b", "820b23063dc1e16e"],
  "PUR-ORD/25-26/02263 | Test Future Lab PO": ["83aef8872f41e39a", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | tecnosint": ["7c77a88f8c6f31dd", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | PURCHASE ORDER TEMPLATE": ["14e7045af0ddfe35", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | Purchase Order Print": ["05ffdbe672b9da33", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | Purchase Order 2025": ["3b3e27571350bbde", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | Purchase Order": ["877396c9a6285eef", "3c7a513ea89278a7"],
  "PUR-ORD/25-26/02263 | PO print format": ["012135f3289c58d3", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | Import PO": ["4ac99ceec24714d4", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | Future Lab PO": ["4ef913eea614f3b0", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02263 | Drop Shipping Format": ["d4404a6637d62a85", "820b23063dc1e16e"],
  "PUR-ORD/25-26/02560 | PDF PO": ["88e9bfa61c6f11fb", "3c807e03457e4866"],
  "PUR-ORD/25-26/02560 | Standard": ["ca8e56ba6f6cc38c", "820b23063dc1e16e"],
  "PUR-ORD/25-26/02560 | Test Future Lab PO": ["3c4d6af9df7b4686", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | tecnosint": ["18fd471af99ffab4", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | PURCHASE ORDER TEMPLATE": ["12102213564ac3e9", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | Purchase Order Print": ["b5cb4cae6ba41774", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | Purchase Order 2025": ["da63b8b0090d0574", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | Purchase Order": ["1ff85e75dbcd4a1b", "3c7a513ea89278a7"],
  "PUR-ORD/25-26/02560 | PO print format": ["2a0dd21e3447e565", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | Import PO": ["27ec4efe8d790b11", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | Future Lab PO": ["861732f9ffb893ef", "5a403b5c74f82e07"],
  "PUR-ORD/25-26/02560 | Drop Shipping Format": ["341224f14c604c40", "820b23063dc1e16e"],
};

const fingerprint = (s: string) => createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  return i < 0 ? "" : s.slice(i + a.length, s.indexOf(b, i + a.length));
};

async function main() {
  let bad = 0;
  for (const key of Object.keys(OLD)) {
    const [number, format] = key.split(" | ");
    const o = await db.purchaseOrder.findUnique({ where: { number }, select: { id: true } });
    if (!o) throw new Error(`${number} is not in the database`);
    const p = await orderPrint(o.id, format, { localImages: false });
    if (!p.ok) throw new Error(p.error);
    const b = fingerprint(between(p.html, '<div class="print-format">', "</div></div></body>"));
    const s = fingerprint(between(p.html, '<style id="print-style">', "</style>"));
    const ok = b === OLD[key][0] && s === OLD[key][1];
    if (!ok) bad++;
    console.log(`${ok ? "✓" : "✗"} ${key}${ok ? "" : `: body ${b === OLD[key][0] ? "equal" : "differs"}, style ${s === OLD[key][1] ? "equal" : "differs"}`}`);
  }
  await db.$disconnect();
  if (bad) process.exit(1);
}
main();
