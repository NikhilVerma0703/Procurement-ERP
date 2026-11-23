// Golden check of the stock valuation engine (Phase II, owner 21-11-2026): every item in every
// warehouse is replayed from nothing through lib/purchase/stock/ledger-engine.ts — the old ledger's
// own movements (quantities and incoming rates, as its transactions gave them) in the ledger's order
// — and each entry's computed balance quantity, valuation rate, stock value, value change and FIFO
// queue is compared with what ERPNext stored. As the POs are for the PO engine, the old ledger is the
// definition of correct for the stock engine: a difference is a bug or a documented exception.
//
//   npm run golden:ledger          (local data; read-only)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { flt } from "@/lib/purchase/calc/pymath";
import { newWarehouseState, processEntry, type BatchTotals, type EngineContext } from "@/lib/purchase/stock/ledger-engine";
import type { StockBin } from "@/lib/purchase/stock/valuation";

const db = new PrismaClient();

type Sle = {
  name: string; item: string; warehouse: string; voucher_type: string; voucher_no: string; actual_qty: number; incoming_rate: number;
  outgoing_rate: number; qty_after: number; valuation_rate: number; stock_value: number; svd: number; stock_queue: string | null;
  batch_no: string | null; serial_no: string | null; company: string;
};

const close = (a: number, b: number, abs: number, rel = 1e-9) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));

(async () => {
  const t0 = Date.now();
  const [rows, batches, serials] = await Promise.all([
    db.$queryRaw<Sle[]>`
      SELECT erpnext_name AS name, item_code AS item, warehouse_code AS warehouse, voucher_type, voucher_no,
             actual_qty::float8 AS actual_qty, incoming_rate::float8 AS incoming_rate, outgoing_rate::float8 AS outgoing_rate,
             qty_after_transaction::float8 AS qty_after, valuation_rate::float8 AS valuation_rate, stock_value::float8 AS stock_value,
             stock_value_difference::float8 AS svd, stock_queue, batch_no, serial_no, company_code AS company
      FROM purchase_stock_ledger_entries
      -- ERPNext's ledger replay (get_stock_ledger_entries) skipped is_cancelled only: the 2024 entry
      -- cancelled just by its docstatus still counted in the valuation (the reports skip it).
      WHERE NOT is_cancelled
      ORDER BY item_code, warehouse_code, posting_date_time, created_at`,
    db.purchaseBatch.findMany({ select: { code: true, useBatchwiseValuation: true } }),
    db.purchaseSerialNo.findMany({ select: { code: true, purchaseRate: true, companyCode: true } }),
  ]);
  const batchwise = new Set(batches.filter((b) => b.useBatchwiseValuation).map((b) => b.code));
  const serialMap = new Map(serials.map((s) => [s.code, { purchaseRate: Number(s.purchaseRate), company: s.companyCode }]));

  const fields = ["qty", "rate", "value", "svd", "queue"] as const;
  const bad: Record<(typeof fields)[number], number> = { qty: 0, rate: 0, value: 0, svd: 0, queue: 0 };
  const examples: string[] = [];
  let equal = 0;
  let negative = 0;
  let groups = 0;
  let firstBadInGroup = 0;
  const byPrecision: Record<number, number> = {};
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && rows[j].item === rows[i].item && rows[j].warehouse === rows[i].warehouse) j++;
    groups++;
    const w = newWarehouseState();
    const totals: BatchTotals = new Map();
    const ctx: EngineContext = {
      batchwise: (b) => batchwise.has(b),
      serial: (s) => serialMap.get(s) ?? null,
      fallbackRate: () => w.valuationRate,
      floatPrecision: 3,
      currencyPrecision: 3,
    };
    let groupBad = false;
    for (let k = i; k < j; k++) {
      const s = rows[k];
      const r = processEntry(w, {
        voucherType: s.voucher_type, voucherNo: s.voucher_no, actualQty: s.actual_qty, incomingRate: s.incoming_rate, outgoingRate: s.outgoing_rate,
        batchNo: s.batch_no, serialNo: s.serial_no, company: s.company, qtyAfterTransaction: s.qty_after, valuationRate: s.valuation_rate,
      }, ctx, totals);
      if (r.negative) negative++;
      let storedQueue: StockBin[] = [];
      try { storedQueue = JSON.parse(s.stock_queue ?? "[]") as StockBin[]; } catch { /* kept empty */ }
      const ok = {
        qty: close(r.qtyAfterTransaction, s.qty_after, 1e-6),
        rate: close(r.valuationRate, s.valuation_rate, 1e-6, 1e-7),
        value: close(r.stockValue, s.stock_value, 0.0011),
        svd: close(r.stockValueDifference, s.svd, 0.0011),
        queue: storedQueue.length === r.stockQueue.length && storedQueue.every((b, x) => close(b[0], r.stockQueue[x][0], 1e-6) && close(b[1], r.stockQueue[x][1], 1e-6, 1e-7)),
      };
      // The site's currency precision changed over time (System Settings: 2 until 13-11-2024, then 3;
      // briefly 5 on 24-07-2024; batch-wise values were sometimes stored unrounded). A value the engine's
      // own figure rounds to at one of those precisions is equal at the precision of its day.
      if (!ok.value || !ok.svd) {
        const prev = k > i ? rows[k - 1].stock_value : 0;
        for (const p of [2, 5, 9]) {
          const v = s.qty_after ? flt(r.unroundedStockValue, p) : 0;
          if (close(v, s.stock_value, 1e-6) && close(v - prev, s.svd, 1e-6)) { ok.value = true; ok.svd = true; byPrecision[p] = (byPrecision[p] ?? 0) + 1; break; }
        }
      }
      const wrong = fields.filter((f) => !ok[f]);
      if (!wrong.length) {
        equal++;
        // Equal at its day's precision: carry the stored value on, as the old ledger did.
        w.stockValue = s.stock_value; w.prevStockValue = s.stock_value; w.valuationRate = s.valuation_rate;
      }
      else {
        for (const f of wrong) bad[f]++;
        if (!groupBad) { firstBadInGroup++; groupBad = true; }
        if (examples.length < 40) {
          examples.push(`${s.name} ${s.voucher_type} ${s.voucher_no} · ${s.item} @ ${s.warehouse}: ` + wrong.map((f) =>
            f === "qty" ? `qty ${r.qtyAfterTransaction} ≠ ${s.qty_after}` : f === "rate" ? `rate ${r.valuationRate} ≠ ${s.valuation_rate}`
              : f === "value" ? `value ${r.stockValue} ≠ ${s.stock_value}` : f === "svd" ? `svd ${r.stockValueDifference} ≠ ${s.svd}`
                : `queue ${JSON.stringify(r.stockQueue).slice(0, 80)} ≠ ${String(s.stock_queue).slice(0, 80)}`).join("; "));
        }
        // Carry on from the stored state, so one difference is counted once, not in every later entry.
        w.qty = s.qty_after; w.valuationRate = s.valuation_rate; w.stockValue = s.stock_value; w.prevStockValue = s.stock_value; w.queue = storedQueue;
      }
    }
    i = j;
  }
  const lines = [
    `# Stock ledger replay — ${new Date().toISOString()}`, "",
    `Entries replayed: ${rows.length} in ${groups} item-warehouses; every figure equal on **${equal}**; different: **${rows.length - equal}** (in ${firstBadInGroup} item-warehouses). Refused as negative stock: ${negative}.`, "",
    `Equal at an earlier precision of the site: ${Object.entries(byPrecision).map(([p, n]) => `${n} at ${p === "9" ? "no rounding" : `${p} decimals`}`).join(", ") || "none"}.`, "",
    `| Figure | Different |`, `|---|---:|`, ...fields.map((f) => `| ${f} | ${bad[f]} |`), "",
    ...(examples.length ? ["## First differences", "", ...examples.map((e) => `- ${e}`)] : []),
  ];
  const dir = resolve(process.cwd(), "data/reports");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `golden-ledger-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")}.md`);
  writeFileSync(path, lines.join("\n"));
  console.log(`Entries: ${rows.length} (${groups} item-warehouses) · equal ${equal} · different ${rows.length - equal} · negative ${negative}`);
  console.log(`By figure: ${fields.map((f) => `${f} ${bad[f]}`).join(", ")}`);
  console.log(`Equal at an earlier precision: ${JSON.stringify(byPrecision)}`);
  console.log(`Report: ${path}\nTook ${Math.round((Date.now() - t0) / 1000)} s`);
  await db.$disconnect();
})();
