// Golden check of the Stock Reports (Phase II, owner 21-11-2026): our Stock Balance and Stock
// Ledger, computed from the imported ledger, against the answers the OLD SITE ITSELF gave on
// 21-11-2026 (data/erpnext-live/live-stock-reports-*.json, captured from the live reports before
// the shutdown — docs/12 §5). As the 3,227 POs are for the PO engine, these are the definition of
// correct for the stock reports: a difference is a bug or a documented exception.
//
//   npm run golden:stock          (local data; read-only)
//
// Compares every row: the balance report keyed by item and warehouse, each figure as the site
// rounded it (3 decimals); the ledger entry by entry, in order.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadItemDetails, loadLedger, loadOpeningVouchers } from "@/lib/purchase/stock/ledger-data";
import { FLOAT_PRECISION, stockBalance, stockLedger, type StockLedgerRow } from "@/lib/purchase/stock/reports";
import { flt } from "@/lib/purchase/calc/pymath";

type LiveRow = Record<string, unknown>;
interface LiveReport { report_name: string; filters: Record<string, string>; result: (LiveRow | unknown[])[] }

const root = process.cwd();
const liveDir = join(root, "data/erpnext-live");
const liveFile = readdirSync(liveDir).filter((f) => f.startsWith("live-stock-reports-")).sort().pop();
if (!liveFile) throw new Error("No live capture in data/erpnext-live (docs/12 §5).");
const live = JSON.parse(readFileSync(join(liveDir, liveFile), "utf8")) as { capturedAt: string; reports: Record<string, LiveReport> };
const db = new PrismaClient();

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const same = (a: number, b: number, precision: number) => flt(a, precision) === flt(b, precision);
const lines: string[] = [`# Stock reports golden check — ${new Date().toISOString()}`, "", `Live answers: \`${liveFile}\` (captured ${live.capturedAt})`, ""];
let allOk = true;

async function balance(key: string) {
  const rep = live.reports[key];
  if (!rep) return;
  const f = rep.filters;
  const entries = await loadLedger(db, { company: f.company, toDate: f.to_date });
  const items = await loadItemDetails(db, entries.map((e) => e.itemCode));
  const ours = stockBalance(entries, items, { fromDate: f.from_date, toDate: f.to_date }, await loadOpeningVouchers(db, f.to_date));
  const theirs = rep.result.filter((r): r is LiveRow => !Array.isArray(r));
  const byKey = new Map(ours.map((r) => [`${r.itemCode}\u0000${r.warehouse}`, r]));
  const fields = [["bal_qty", "balQty"], ["bal_val", "balVal"], ["opening_qty", "openingQty"], ["opening_val", "openingVal"], ["in_qty", "inQty"],
    ["in_val", "inVal"], ["out_qty", "outQty"], ["out_val", "outVal"], ["val_rate", "valRate"]] as const;
  let equal = 0;
  const diffs: string[] = [];
  const seen = new Set<string>();
  for (const t of theirs) {
    const k = `${t.item_code}\u0000${t.warehouse}`;
    seen.add(k);
    const o = byKey.get(k);
    if (!o) {
      diffs.push(`only on the old site: ${t.item_code} @ ${t.warehouse}`);
      continue;
    }
    const bad = fields.filter(([lf, of]) => !same(num(t[lf]), o[of], FLOAT_PRECISION)).map(([lf, of]) => `${lf} ${num(t[lf])} ≠ ${o[of]}`);
    if (bad.length) diffs.push(`${t.item_code} @ ${t.warehouse}: ${bad.join(", ")}`);
    else equal++;
  }
  for (const o of ours) if (!seen.has(`${o.itemCode}\u0000${o.warehouse}`)) diffs.push(`only here: ${o.itemCode} @ ${o.warehouse}`);
  const ok = diffs.length === 0 && ours.length === theirs.length;
  allOk &&= ok;
  lines.push(`## Stock Balance ${f.from_date} → ${f.to_date} ${ok ? "✓" : "✗"}`, "",
    `Rows: old site ${theirs.length}, here ${ours.length}; every figure equal on **${equal}**; differences: **${diffs.length}**.`, "");
  if (diffs.length) lines.push(...diffs.slice(0, 200).map((d) => `- ${d}`), diffs.length > 200 ? `- … and ${diffs.length - 200} more` : "", "");
  console.log(`Stock Balance ${f.from_date} → ${f.to_date}: ${theirs.length} rows on the old site, ${ours.length} here, ${equal} equal, ${diffs.length} different ${ok ? "✓" : "✗"}`);
}

async function ledger(key: string) {
  const rep = live.reports[key];
  if (!rep) return;
  const f = rep.filters;
  const entries = await loadLedger(db, { company: f.company, fromDate: f.from_date, toDate: f.to_date });
  const items = await loadItemDetails(db, entries.map((e) => e.itemCode));
  const ours = stockLedger(entries, items).filter((r): r is StockLedgerRow => !("opening" in r));
  const theirs = rep.result.filter((r): r is LiveRow => !Array.isArray(r) && r.item_code !== "'Opening'");
  const fields = [["in_qty", "inQty", 9], ["out_qty", "outQty", 9], ["qty_after_transaction", "qtyAfterTransaction", 9],
    ["incoming_rate", "incomingRate", 9], ["valuation_rate", "valuationRate", 9], ["in_out_rate", "inOutRate", FLOAT_PRECISION],
    ["stock_value", "stockValue", 9], ["stock_value_difference", "stockValueDifference", 9]] as const;
  const diffs: string[] = [];
  let equal = 0;
  const n = Math.max(ours.length, theirs.length);
  for (let i = 0; i < n; i++) {
    const t = theirs[i];
    const o = ours[i];
    if (!t || !o) {
      diffs.push(`row ${i + 1}: ${t ? `only on the old site: ${t.voucher_no} ${t.item_code}` : `only here: ${o!.voucherNo} ${o!.itemCode}`}`);
      continue;
    }
    if (t.voucher_no !== o.voucherNo || t.item_code !== o.itemCode || t.warehouse !== o.warehouse) {
      diffs.push(`row ${i + 1}: order differs — old site ${t.voucher_no} ${t.item_code} @ ${t.warehouse}, here ${o.voucherNo} ${o.itemCode} @ ${o.warehouse}`);
      continue;
    }
    const bad = fields.filter(([lf, of, p]) => !same(num(t[lf]), num(o[of]), p)).map(([lf, of]) => `${lf} ${num(t[lf])} ≠ ${o[of]}`);
    if (bad.length) diffs.push(`row ${i + 1} ${t.voucher_no} ${t.item_code}: ${bad.join(", ")}`);
    else equal++;
  }
  const ok = diffs.length === 0;
  allOk &&= ok;
  lines.push(`## Stock Ledger ${f.from_date} → ${f.to_date} ${ok ? "✓" : "✗"}`, "",
    `Entries: old site ${theirs.length}, here ${ours.length}; equal, in the same order: **${equal}**; differences: **${diffs.length}**.`, "");
  if (diffs.length) lines.push(...diffs.slice(0, 200).map((d) => `- ${d}`), diffs.length > 200 ? `- … and ${diffs.length - 200} more` : "", "");
  console.log(`Stock Ledger ${f.from_date} → ${f.to_date}: ${theirs.length} entries on the old site, ${ours.length} here, ${equal} equal, ${diffs.length} different ${ok ? "✓" : "✗"}`);
}

(async () => {
  const t0 = Date.now();
  await balance("stock_balance_all");
  await balance("stock_balance_fy2526");
  await ledger("stock_ledger_all");
  const dir = resolve(root, "data/reports");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const path = join(dir, `golden-stock-${stamp}.md`);
  writeFileSync(path, lines.join("\n"));
  console.log(`${allOk ? "✓ Every stock report row equals the old site's." : "✗ Differences — see the report."}\nReport: ${path}\nTook ${Math.round((Date.now() - t0) / 1000)} s`);
  await db.$disconnect();
  process.exit(allOk ? 0 : 1);
})();
