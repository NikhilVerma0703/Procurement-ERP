// Golden check of the calculation engine against every imported PO (Step 4).
//
//   npm run golden                       # all POs; report in data/reports/golden-<stamp>.md
//   npm run golden -- --only <no>,<no>   # some POs, with every difference listed
//
// Each PO is recomputed with the old site's own rules of the period it was last saved in, and
// every computed figure is compared with the stored one. A difference is either a documented
// exception (golden.ts EXCEPTIONS, docs/04-calculation-engine.md) or a failure.
// Read-only. Exit code: 0 no unexplained difference, 2 unexplained differences, 1 error.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { EXCEPTIONS, goldenCheck } from "@/lib/purchase/calc/golden";

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = valueOf("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const examplesPerField = Number(valueOf("--examples") ?? 12);

const db = new PrismaClient();
const started = Date.now();

goldenCheck(db, { only })
  .then((r) => {
    const unexplained = r.mismatches.filter((m) => !m.why);
    const ra = [...r.roundingAdjustmentIn.values()];
    const lines: string[] = [];
    lines.push(`# Golden check — ${new Date().toISOString()}`, "");
    lines.push(
      `POs checked: ${r.checkedOrders}. Every figure matches on ${r.matchingOrders}; ` +
        `unexplained differences: ${unexplained.length}.`,
      "",
      `Old-site code period of the last save: ${[...r.eras].map(([e, n]) => `${e} ${n}`).join(", ")}.`,
      `Saved from 03-12-2025 with a carried-over rounding adjustment: ${ra.length} POs ` +
        `(from ${Math.min(...ra, 0)} to ${Math.max(...ra, 0)}).`,
      "",
      "## Differences by cause",
      "",
      "| Cause | Figures |",
      "|---|---:|",
    );
    for (const [k, n] of [...r.explained].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${k === "unexplained" ? "**Unexplained**" : EXCEPTIONS[k]} | ${n} |`);
    }
    lines.push("", "## By field", "", "| Field | Checked | Different | Unexplained |", "|---|---:|---:|---:|");
    const unexplainedBy = new Map<string, number>();
    for (const m of unexplained) unexplainedBy.set(m.path, (unexplainedBy.get(m.path) ?? 0) + 1);
    for (const [f, s] of [...r.fields].sort((a, b) => b[1].mismatched - a[1].mismatched || a[0].localeCompare(b[0]))) {
      if (s.mismatched) lines.push(`| ${f} | ${s.checked} | ${s.mismatched} | ${unexplainedBy.get(f) ?? 0} |`);
    }
    lines.push(`| (all other fields) | | 0 | 0 |`);

    lines.push("", "## Today's rules against the stored figures", "");
    lines.push("POs whose figure would differ if recomputed with the replica's rules (no old-site defects).", "");
    lines.push("| Field | POs | Examples |", "|---|---:|---|");
    for (const [f, set] of [...r.todayDiffers].sort((a, b) => b[1].size - a[1].size)) {
      lines.push(`| ${f} | ${set.size} | ${[...set].slice(0, 4).join(", ")} |`);
    }

    lines.push("", "## Examples", "");
    const byField = new Map<string, typeof r.mismatches>();
    for (const m of r.mismatches) byField.set(m.path, [...(byField.get(m.path) ?? []), m]);
    for (const [f, ms] of byField) {
      const eras = new Map<string, number>();
      for (const m of ms) eras.set(m.era, (eras.get(m.era) ?? 0) + 1);
      lines.push(`### ${f} (${ms.length})`, "", `By code period: ${[...eras].map(([e, n]) => `${e} ${n}`).join(", ")}`, "");
      lines.push("| PO | Row | Period | Stored | Computed | Cause |", "|---|---|---|---|---|---|");
      const shown = [...ms.filter((m) => !m.why), ...ms.filter((m) => m.why)].slice(0, only ? ms.length : examplesPerField);
      for (const m of shown) lines.push(`| ${m.po} | ${m.row ?? ""} | ${m.era} | ${m.stored} | ${m.computed} | ${m.why ?? "**unexplained**"} |`);
      lines.push("");
    }

    const dir = resolve(process.cwd(), "data", "reports");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const path = resolve(dir, `golden-${stamp}.md`);
    writeFileSync(path, lines.join("\n"));
    console.log(lines.slice(0, lines.indexOf("## Today's rules against the stored figures")).join("\n"));
    console.log(`\nReport: ${path}\nTook ${Math.round((Date.now() - started) / 1000)} s`);
    process.exitCode = unexplained.length ? 2 : 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
