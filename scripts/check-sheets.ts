// Compares the replica's PO sheets with the PDFs the old site printed
// (docs/reference/live-capture/pdfs, captured 16-11-2026; local only).
//
//   npx tsx --conditions=react-server scripts/check-sheets.ts [--keep <dir>]
//
// For every captured PO in a layout the replica has, it renders the sheet,
// extracts the text of both PDFs with pdftotext (poppler, UTF-8) and checks
// that every word of each is in the other. The two renderers place and wrap
// text differently, so a word is looked for in the other sheet's text with
// its spaces and line breaks taken out ("1.2-" and "2.5MM" on two lines is
// "1.2-2.5MM"), and ligature characters count as their letters ("ﬁ" is
// "fi"). A word not found is a difference to explain. A cancelled PO must be
// refused, as the old site refused it. Read-only.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPoLayout } from "../src/lib/purchase/pdf/layouts/index";
import { renderOrderPdf } from "../src/lib/purchase/pdf/render";
import { db } from "../src/lib/purchase/server/db";

const ROOT = join(process.cwd(), "docs/reference/live-capture/pdfs");
const keepAt = process.argv.indexOf("--keep");
const outDir = keepAt >= 0 ? process.argv[keepAt + 1] : mkdtempSync(join(tmpdir(), "po-sheets-"));

interface Entry {
  file?: string;
  print_format?: string;
  purchase_order?: string;
  why?: string;
}

const textOf = (pdf: string) => execFileSync("pdftotext", ["-enc", "UTF-8", pdf, "-"], { encoding: "utf8" }).normalize("NFKC");
const words = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * The words of `a` not found in `b`, wherever and however `b` wrapped them. The old browser
 * also broke a word after a hyphen ("0.6-" / "1.2MM"), so a hyphenated word counts as found
 * when each of its pieces is. And when a cell's lines follow each other in the text, pdftotext
 * joins a word broken after a hyphen and drops the hyphen ("0.6-" / "1.2MM" comes out as
 * "0.61.2MM"), so a word also counts as found when it splits into a piece found with a hyphen
 * after it and a piece found as it is — and a word ending in a hyphen, when it is there without.
 */
function notIn(a: string, b: string): string[] {
  const flat = b.replace(/\s+/g, "");
  const rejoined = (w: string) =>
    (w.endsWith("-") && flat.includes(w.slice(0, -1))) ||
    [...w].some((_, i) => i > 0 && flat.includes(`${w.slice(0, i)}-`) && flat.includes(w.slice(i)));
  return words(a).filter((w) => !flat.includes(w) && !w.split(/(?<=-)/).every((piece) => flat.includes(piece)) && !rejoined(w));
}

/**
 * Captured sheets whose old rendering garbled text, with why. The 40-item PO's repeated heading
 * was drawn over the items table (the template opened a new heading inside an unclosed table),
 * so its PDF holds overlapped, interleaved letters; the replica prints the same content cleanly.
 */
const GARBLED: Record<string, string> = {
  "PUR-ORD/25-26/01426": "the old PDF drew each repeated heading over the items table",
};

async function main() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as Entry[];
  let same = 0;
  let checked = 0;
  for (const e of manifest) {
    if (!e.file || !e.purchase_order || !e.print_format) continue;
    const label = `${e.print_format} · ${e.purchase_order} (${e.why})`;
    if (!isPoLayout(e.print_format)) {
      console.log(`- ${label}: layout not built`);
      continue;
    }
    const o = await db.purchaseOrder.findUnique({ where: { number: e.purchase_order }, select: { id: true } });
    if (!o) {
      console.log(`- ${label}: PO not in the imported data (made after the backup)`);
      continue;
    }
    checked++;
    const ref = textOf(join(ROOT, e.file));
    const r = await renderOrderPdf(o.id, e.print_format);
    if (!r.ok) {
      const refused = ref.includes(r.error);
      console.log(`${refused ? "✓" : "✗"} ${label}: refused "${r.error}"${refused ? ", as the old site did" : ""}`);
      if (refused) same++;
      continue;
    }
    const mine = join(outDir, `${e.print_format}-${e.purchase_order.replace(/\//g, "_")}.pdf`);
    writeFileSync(mine, r.pdf);
    const ours = textOf(mine);
    const missing = notIn(ref, ours);
    const extra = notIn(ours, ref);
    if (!missing.length && !extra.length) {
      same++;
      console.log(`✓ ${label}: all ${words(ref).length} words`);
    } else if (GARBLED[e.purchase_order]) {
      // Only the old PDF's garbled words may differ: the table headings it drew over other text
      // (and a figure pdftotext ran into its neighbour cell, "100.0₹").
      const ok = notIn(ours, ref).every((w) => /^(SNO|PRODUCT|DESCRIPTION)$/.test(w) || /^[\d.]+₹$/.test(w));
      if (ok) same++;
      console.log(`${ok ? "≈" : "✗"} ${label}: ${GARBLED[e.purchase_order]}; ${missing.length} garbled words of the old PDF not reproduced`);
    } else {
      console.log(`✗ ${label}: ${words(ref).length} words; not printed ${JSON.stringify(missing.slice(0, 20))}; printed only here ${JSON.stringify(extra.slice(0, 20))}`);
    }
  }
  console.log(`\n${same} of ${checked} sheets match. Rendered sheets: ${outDir}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
