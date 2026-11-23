// Golden check of the receipts' totals (Phase II, owner 21-11-2026): every one of the old site's
// Purchase Receipts recomputed by lib/purchase/stock/receipt-calc.ts (the buying calculation engine
// the 3,227 POs prove, as ERPNext's taxes_and_totals is one for every buying document), with the
// old site's precision and code of the receipt's last save, and each stored figure compared at
// 9 decimals: the totals, In Words, every item's amounts and GST, every tax row. What a receipt
// saved here will store must be what the old site would have stored. A difference is a bug or a
// documented exception (EXCEPTIONS); "unexplained" must stay 0.
//
//   npm run golden:receipts          (local data; read-only)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { CalcCurrency, PurchaseOrderCalcResult } from "@/lib/purchase/calc";
import { dbDecimal, flt } from "@/lib/purchase/calc/pymath";
import { precisionAt } from "@/lib/purchase/calc/settings";
import { oldSiteEraAt } from "@/lib/purchase/calc/totals";
import { calculateReceipt, type ReceiptCalcInput } from "@/lib/purchase/stock/receipt-calc";

const db = new PrismaClient();
const include = { items: { orderBy: { idx: "asc" } }, taxes: { orderBy: { idx: "asc" } }, serviceItems: { orderBy: { idx: "asc" } } } as const;
type Receipt = Prisma.PurchaseReceiptGetPayload<{ include: typeof include }>;
type Dec = Prisma.Decimal;

/** Figures the old site stored that the receipt itself cannot rebuild. */
const EXCEPTIONS = {
  "landed-cost":
    "A Landed Cost Voucher submitted against the receipt re-saved its rows through update_valuation_rate (round_floats_in): " +
    "the row GST amounts were rounded to the currency precision of that day (2 until 13-11-2024, then 3)",
} as const;
type Why = keyof typeof EXCEPTIONS | "unexplained";

const num = (v: Dec | number | string | null | undefined) => (v == null ? 0 : Number(v));
const text = (v: Dec | number | string | null | undefined): string => (v == null ? "" : typeof v === "number" ? dbDecimal(v) : typeof v === "string" ? v : v.toFixed(9));
const legacy = (row: { legacy: Prisma.JsonValue }) => (row.legacy ?? {}) as Record<string, string | null>;
const json = (s: string | null) => {
  try { return JSON.parse(s ?? "{}") as Record<string, number | string>; } catch { return {}; }
};

(async () => {
  const t0 = Date.now();
  const currencies = new Map((await db.purchaseCurrency.findMany()).map((c) => [c.code, {
    code: c.code, smallestFraction: num(c.smallestCurrencyFractionValue), fraction: c.fraction, numberFormat: c.numberFormat,
  } as CalcCurrency]));
  const templates = new Map((await db.purchaseItemTaxTemplate.findMany({ include: { rates: true } })).map((t) => [t.code, t]));
  const receipts: Receipt[] = await db.purchaseReceipt.findMany({ include, orderBy: { createdAt: "asc" } });
  const versions = await db.purchaseDocEvent.groupBy({ by: ["docName"], where: { doctype: "Purchase Receipt", kind: "VERSION" }, _max: { at: true } });
  const lastVersion = new Map(versions.map((v) => [v.docName, v._max.at!]));
  const withLandedCost = new Set((await db.$queryRaw<{ doc: string }[]>`
    select distinct r.receipt_document doc from purchase_landed_cost_receipts r
    join purchase_landed_cost_vouchers v on v.id = r.voucher_id where v.doc_status <> 'Draft'`).map((r) => r.doc));

  const checked = new Map<string, { n: number; bad: number }>();
  const examples = new Map<string, string[]>();
  const explained = new Map<Why, number>();
  let equalReceipts = 0;
  let roundingAdjustmentIn = 0;
  const eras = new Map<string, number>();
  for (const pr of receipts) {
    const lastSave = lastVersion.get(pr.number) ?? pr.createdAt;
    const era = oldSiteEraAt(lastSave);
    eras.set(era, (eras.get(era) ?? 0) + 1);
    const input: ReceiptCalcInput = {
      precision: precisionAt(lastSave),
      currency: currencies.get(pr.currency) ?? currencies.get("INR")!,
      companyCurrency: currencies.get("INR")!,
      conversionRate: num(pr.conversionRate),
      applyDiscountOn: (pr.applyDiscountOn ?? "Grand Total") as "Grand Total" | "Net Total",
      additionalDiscountPercentage: num(pr.additionalDiscountPercentage),
      discountAmount: num(pr.discountAmount),
      disableRoundedTotal: legacy(pr).disable_rounded_total === "1",
      taxCategory: pr.taxCategory,
      items: pr.items.map((i) => {
        const l = legacy(i);
        const t = i.itemTaxTemplate ? templates.get(i.itemTaxTemplate) : undefined;
        return {
          itemCode: i.itemCode, itemName: i.itemName ?? i.itemCode, qty: num(i.qty), conversionFactor: num(i.conversionFactor),
          priceListRate: num(i.priceListRate), discountPercentage: num(i.discountPercentage), discountAmount: num(i.discountAmount),
          marginType: (i.marginType || null) as "Percentage" | "Amount" | null, marginRateOrAmount: num(i.marginRateOrAmount), rate: num(i.rate),
          itemTaxRate: Object.fromEntries(Object.entries(json(i.itemTaxRate)).map(([k, v]) => [k, Number(v)])),
          applyTds: l.apply_tds !== "0", weightPerUnit: num(l.weight_per_unit),
          itemTaxTemplate: i.itemTaxTemplate, templateRates: t ? t.rates.map((x) => num(x.taxRate)) : null, gstTreatment: i.gstTreatment,
        };
      }),
      taxes: pr.taxes.map((t) => ({
        chargeType: (t.chargeType ?? "Actual") as never, rowId: t.rowId ? Number(t.rowId) : null, accountHead: t.accountHead, rate: num(t.rate),
        taxAmount: num(t.taxAmount), category: (t.category ?? "Total") as never, addDeductTax: (t.addDeductTax ?? "Add") as never,
        includedInPrintRate: t.includedInPrintRate, gstTaxType: t.gstTaxType,
      })),
      // The add-on's Services Charges is a Data field: typed as "29,463" or " 5,575"; Frappe's flt
      // reads them as numbers (commas dropped), and so does this one.
      costOverheadCharges: pr.serviceItems.map((s) => flt(s.serviceCharges)),
      paymentSchedule: [],
      templateGstTreatment: (code: string) => templates.get(code)?.gstTreatment ?? null,
    };
    let r: PurchaseOrderCalcResult = calculateReceipt({ ...input, oldSite: { era } });
    // From 03-12-2025 the old Grand Total also carried the rounding adjustment the form held (never
    // stored): find the one value that reproduces the stored Grand Total, as the PO check does.
    const headline = (x: PurchaseOrderCalcResult) => text(pr.grandTotal) === text(x.grandTotal) && text(pr.netTotal) === text(x.netTotal)
      && text(pr.roundingAdjustment) === text(x.roundingAdjustment);
    if ((era === "2025-12" || era === "2026-04") && !headline(r)) {
      const cp = input.precision!.currency;
      const step = 10 ** -cp;
      const cands = [flt(num(pr.grandTotal) - (r.taxes.at(-1)?.total ?? r.netTotal) - r.costOverheadCharges, cp)];
      for (let k = 1; k <= Math.round(0.5 / step); k++) cands.push(flt(k * step, cp), flt(-k * step, cp));
      for (const ra of cands) {
        const r2 = calculateReceipt({ ...input, oldSite: { era, roundingAdjustmentIn: ra } });
        if (headline(r2)) { r = r2; roundingAdjustmentIn++; break; }
      }
    }
    const pairs: [string, string, string][] = [];
    const head: [string, Dec | string | null, number | string][] = [
      ["total", pr.total, r.total], ["base_total", pr.baseTotal, r.baseTotal], ["net_total", pr.netTotal, r.netTotal],
      ["base_net_total", pr.baseNetTotal, r.baseNetTotal], ["total_qty", pr.totalQty, r.totalQty],
      ["taxes_and_charges_added", pr.taxesAndChargesAdded, r.taxesAndChargesAdded],
      ["base_taxes_and_charges_added", pr.baseTaxesAndChargesAdded, r.baseTaxesAndChargesAdded],
      ["total_taxes_and_charges", pr.totalTaxesAndCharges, r.totalTaxesAndCharges],
      ["base_total_taxes_and_charges", pr.baseTotalTaxesAndCharges, r.baseTotalTaxesAndCharges],
      ["grand_total", pr.grandTotal, r.grandTotal], ["base_grand_total", pr.baseGrandTotal, r.baseGrandTotal],
      ["rounding_adjustment", pr.roundingAdjustment, r.roundingAdjustment], ["base_rounding_adjustment", pr.baseRoundingAdjustment, r.baseRoundingAdjustment],
      ["rounded_total", pr.roundedTotal, r.roundedTotal], ["base_rounded_total", pr.baseRoundedTotal, r.baseRoundedTotal],
      ["discount_amount", pr.discountAmount, r.discountAmount], ["base_discount_amount", pr.baseDiscountAmount, r.baseDiscountAmount],
      ["in_words", pr.inWords, r.inWords], ["base_in_words", pr.baseInWords, r.baseInWords],
    ];
    for (const [f, s, c] of head) pairs.push([`receipt.${f}`, text(s), text(c)]);
    pr.items.forEach((s, i) => {
      const c = r.items[i];
      for (const [f, sv, cv] of [
        ["rate", s.rate, c.rate], ["amount", s.amount, c.amount], ["net_rate", s.netRate, c.netRate], ["net_amount", s.netAmount, c.netAmount],
        ["base_rate", s.baseRate, c.baseRate], ["base_amount", s.baseAmount, c.baseAmount], ["base_net_rate", s.baseNetRate, c.baseNetRate],
        ["base_net_amount", s.baseNetAmount, c.baseNetAmount], ["stock_qty", s.stockQty, c.stockQty], ["taxable_value", s.taxableValue, c.taxableValue],
        ["igst_rate", s.igstRate, c.gst.igst_rate], ["cgst_rate", s.cgstRate, c.gst.cgst_rate], ["sgst_rate", s.sgstRate, c.gst.sgst_rate],
        ["igst_amount", s.igstAmount, c.gst.igst_amount], ["cgst_amount", s.cgstAmount, c.gst.cgst_amount], ["sgst_amount", s.sgstAmount, c.gst.sgst_amount],
      ] as [string, Dec, number][]) pairs.push([`item.${f}`, text(sv), text(cv)]);
    });
    pr.taxes.forEach((s, i) => {
      const c = r.taxes[i];
      if (!c) return;
      for (const [f, sv, cv] of [
        ["tax_amount", s.taxAmount, c.taxAmount], ["total", s.total, c.total], ["base_tax_amount", s.baseTaxAmount, c.baseTaxAmount],
        ["tax_amount_after_discount_amount", s.taxAmountAfterDiscountAmount, c.taxAmountAfterDiscountAmount],
      ] as [string, Dec, number][]) pairs.push([`tax.${f}`, text(sv), text(cv)]);
    });
    let ok = true;
    for (const [f, s, c] of pairs) {
      const st = checked.get(f) ?? { n: 0, bad: 0 };
      st.n++;
      checked.set(f, st);
      if (s === c) continue;
      let why: Why = "unexplained";
      if (/^item\.(igst|cgst|sgst)_amount$/.test(f) && withLandedCost.has(pr.number) && [2, 3].some((p) => text(flt(Number(c), p)) === s)) why = "landed-cost";
      explained.set(why, (explained.get(why) ?? 0) + 1);
      if (why !== "unexplained") continue;
      st.bad++;
      ok = false;
      const ex = examples.get(f) ?? [];
      if (ex.length < 6) ex.push(`${pr.number} (${era}): ${s} ≠ ${c}`);
      examples.set(f, ex);
    }
    if (ok) equalReceipts++;
  }
  const unexplained = explained.get("unexplained") ?? 0;
  const lines = [
    `# Receipts golden check — ${new Date().toISOString()}`, "",
    `Receipts checked: ${receipts.length}. Every figure equal (or a documented exception) on **${equalReceipts}**. Unexplained differences: **${unexplained}**.`, "",
    `Old-site code period of the last save: ${[...eras].map(([e, n]) => `${e} ${n}`).join(", ")}. Receipts needing the form's carried rounding adjustment (from 03-12-2025): ${roundingAdjustmentIn}.`, "",
    "## Documented exceptions", "",
    ...Object.entries(EXCEPTIONS).map(([k, v]) => `- **${k}** (${explained.get(k as Why) ?? 0} figures): ${v}.`), "",
    "## Unexplained differences by field", "",
    "| Field | Checked | Different |", "|---|---:|---:|",
    ...[...checked].filter(([, s]) => s.bad).sort((a, b) => b[1].bad - a[1].bad).map(([f, s]) => `| ${f} | ${s.n} | ${s.bad} |`),
    `| (all ${[...checked].filter(([, s]) => !s.bad).length} other fields) | | 0 |`, "",
    ...(examples.size ? ["## Examples", "", ...[...examples].flatMap(([f, ex]) => [`- **${f}**`, ...ex.map((e) => `  - ${e}`)])] : []),
  ];
  const dir = resolve(process.cwd(), "data/reports");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `golden-receipts-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")}.md`);
  writeFileSync(path, lines.join("\n"));
  console.log(`Receipts: ${receipts.length} · equal ${equalReceipts} · unexplained differences ${unexplained} · landed-cost rounding ${explained.get("landed-cost") ?? 0}`);
  const worst = [...checked].filter(([, s]) => s.bad).sort((a, b) => b[1].bad - a[1].bad).slice(0, 12);
  if (worst.length) console.log(worst.map(([f, s]) => `${f} ${s.bad}/${s.n}`).join(" · "));
  console.log(`Report: ${path}\nTook ${Math.round((Date.now() - t0) / 1000)} s`);
  await db.$disconnect();
  if (unexplained) process.exitCode = 1;
})();
