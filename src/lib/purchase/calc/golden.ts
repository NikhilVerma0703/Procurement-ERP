// Golden check: recompute every imported PO with the engine and compare each computed figure
// with what the old site stored. The definition of correct for Step 4 (CLAUDE.md): every
// difference is a bug to fix or a documented exception (docs/04-calculation-engine.md).
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  ADD_DEDUCT_KEYS, CHARGE_TYPE_KEYS, DISCOUNT_ON_KEYS, MARGIN_TYPE_KEYS, PO_STATUS_KEYS, TAX_CATEGORY_KEYS, labelOf,
} from "../orders/labels";
import { calculatePurchaseOrder, purchaseOrderStatus, type CalcCurrency, type PurchaseOrderCalcInput, type PurchaseOrderCalcResult } from "./index";
import { dbDecimal, flt } from "./pymath";
import { GST_TAX_TYPES, precisionAt } from "./settings";
import { oldSiteEraAt, type OldSiteEra } from "./totals";

type Dec = Prisma.Decimal;
const num = (d: Dec | number | null | undefined) => (d == null ? 0 : Number(d.toString()));

const orderInclude = {
  currencyRef: true,
  company: true,
  taxCategory: true,
  items: { orderBy: { idx: "asc" }, include: { itemTaxTemplate: { include: { rates: true } } } },
  taxes: { orderBy: { idx: "asc" }, include: { accountHead: true } },
  costOverheads: { orderBy: { idx: "asc" } },
  paymentSchedule: { orderBy: { idx: "asc" } },
} satisfies Prisma.PurchaseOrderInclude;
export type GoldenOrder = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

export interface Mismatch {
  po: string;
  era: OldSiteEra;
  path: string;
  /** Item / tax / schedule row (idx), when the figure is on a row. */
  row?: number;
  stored: string;
  computed: string;
  /** The documented cause (EXCEPTIONS), or undefined when unexplained. */
  why?: ExceptionKind;
}

/**
 * Differences that are not engine errors: the old site stored a figure our rules cannot rebuild
 * from the PO itself. Each is explained in docs/04-calculation-engine.md.
 */
export const EXCEPTIONS = {
  "update-items": "Rows changed after submit (Update Items): the old site did not refresh these row figures",
  "addon-not-filled": "Add-on GST columns never filled (the form fills them only when an item, qty or rate is typed)",
  "addon-stale": "Add-on GST amount from an earlier qty or rate (filled 2 s after typing)",
  "addon-other-template": "Add-on GST rate from an earlier template or tax category of the row (or none on it now)",
  "addon-no-category": "Add-on GST columns on a PO whose Tax Category is now neither In-State nor Out-State",
  "template-treatment-later": "The Item Tax Template's GST treatment was set after the PO's last save",
} as const;
export type ExceptionKind = keyof typeof EXCEPTIONS;

export interface GoldenResult {
  checkedOrders: number;
  matchingOrders: number;
  /** POs per old-site code period (by last save). */
  eras: Map<OldSiteEra, number>;
  /** POs saved from 03-12-2025 whose figures needed the form's rounding adjustment at save time. */
  roundingAdjustmentIn: Map<string, number>;
  /** Today's rules (no old-site defects) against the stored figures: field → POs that differ. */
  todayDiffers: Map<string, Set<string>>;
  /** Differences by documented cause; "unexplained" must stay empty. */
  explained: Map<ExceptionKind | "unexplained", number>;
  /** field → [checked, mismatched] */
  fields: Map<string, { checked: number; mismatched: number }>;
  mismatches: Mismatch[];
  /** po → its mismatching fields */
  byOrder: Map<string, { order: GoldenOrder; result: PurchaseOrderCalcResult; paths: Set<string> }>;
}

function currencyOf(c: { code: string; smallestCurrencyFractionValue: Dec | null; fraction: string | null; numberFormat: string | null }): CalcCurrency {
  return { code: c.code, smallestFraction: num(c.smallestCurrencyFractionValue), fraction: c.fraction, numberFormat: c.numberFormat };
}

function parseJson<T>(v: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return v.trim() ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  return v as unknown as T;
}

/** The engine input for a stored PO: only what a user typed or chose. */
export function inputOf(o: GoldenOrder, currencies: Map<string, CalcCurrency>, lastSave: Date): PurchaseOrderCalcInput {
  const company = currencies.get(o.company.defaultCurrency ?? "INR") ?? currencies.get("INR")!;
  return {
    precision: precisionAt(lastSave),
    currency: currencyOf(o.currencyRef),
    companyCurrency: company,
    conversionRate: num(o.conversionRate),
    applyDiscountOn: labelOf(DISCOUNT_ON_KEYS, o.applyDiscountOn),
    additionalDiscountPercentage: num(o.additionalDiscountPercentage),
    discountAmount: num(o.discountAmount),
    disableRoundedTotal: o.disableRoundedTotal,
    taxCategory: o.taxCategory?.code ?? null,
    items: o.items.map((i) => ({
      itemCode: i.itemCode,
      itemName: i.itemName,
      qty: num(i.qty),
      conversionFactor: num(i.conversionFactor),
      priceListRate: num(i.priceListRate),
      discountPercentage: num(i.discountPercentage),
      discountAmount: num(i.discountAmount),
      marginType: i.marginType ? labelOf(MARGIN_TYPE_KEYS, i.marginType) : null,
      marginRateOrAmount: num(i.marginRateOrAmount),
      rate: num(i.rate),
      itemTaxRate: Object.fromEntries(Object.entries(parseJson<Record<string, number | string>>(i.itemTaxRate, {})).map(([k, v]) => [k, Number(v)])),
      applyTds: i.applyTds,
      weightPerUnit: num(i.weightPerUnit),
      itemTaxTemplate: i.itemTaxTemplate?.code ?? null,
      templateRates: i.itemTaxTemplate ? i.itemTaxTemplate.rates.map((r) => num(r.taxRate)) : null,
      gstTreatment: i.gstTreatment,
    })),
    taxes: o.taxes.map((t) => ({
      chargeType: labelOf(CHARGE_TYPE_KEYS, t.chargeType),
      rowId: t.rowId,
      accountHead: t.accountHead.code,
      rate: num(t.rate),
      taxAmount: num(t.taxAmount),
      category: labelOf(TAX_CATEGORY_KEYS, t.category),
      addDeductTax: labelOf(ADD_DEDUCT_KEYS, t.addDeductTax),
      includedInPrintRate: t.includedInPrintRate,
      gstTaxType: t.gstTaxType,
    })),
    costOverheadCharges: o.costOverheads.map((c) => num(c.serviceCharges)),
    paymentSchedule: o.paymentSchedule.map((s) => ({
      invoicePortion: num(s.invoicePortion), paymentAmount: num(s.paymentAmount), outstanding: num(s.outstanding),
    })),
    templateGstTreatment: (code) => o.items.find((i) => i.itemTaxTemplate?.code === code)?.itemTaxTemplate?.gstTreatment ?? null,
  };
}

type Pair = [stored: Dec | number | string | null | undefined, computed: number | string | null];

/** Every computed figure of a PO, paired with its stored value. */
function pairsOf(o: GoldenOrder, r: PurchaseOrderCalcResult): [string, Pair, number?][] {
  const out: [string, Pair, number?][] = [];
  let row: number | undefined;
  const add = (path: string, stored: Pair[0], computed: Pair[1]) => out.push([path, [stored, computed], row]);
  const head: [keyof GoldenOrder & keyof PurchaseOrderCalcResult][] = [
    ["totalQty"], ["total"], ["baseTotal"], ["netTotal"], ["baseNetTotal"], ["taxWithholdingNetTotal"],
    ["baseTaxWithholdingNetTotal"], ["taxesAndChargesAdded"], ["taxesAndChargesDeducted"], ["baseTaxesAndChargesAdded"],
    ["baseTaxesAndChargesDeducted"], ["totalTaxesAndCharges"], ["baseTotalTaxesAndCharges"], ["grandTotal"],
    ["baseGrandTotal"], ["roundingAdjustment"], ["baseRoundingAdjustment"], ["roundedTotal"], ["baseRoundedTotal"],
    ["discountAmount"], ["baseDiscountAmount"], ["totalNetWeight"], ["inWords"], ["baseInWords"],
  ];
  for (const [f] of head) add(`po.${f}`, o[f] as Pair[0], r[f] as Pair[1]);
  const status = purchaseOrderStatus({
    docStatus: o.docStatus === "DRAFT" ? 0 : o.docStatus === "SUBMITTED" ? 1 : 2,
    status: labelOf(PO_STATUS_KEYS, o.status),
    perReceived: num(o.perReceived),
    perBilled: num(o.perBilled),
  });
  add("po.status", labelOf(PO_STATUS_KEYS, o.status), status);

  o.items.forEach((s, i) => {
    const c = r.items[i];
    row = s.idx;
    const itemFields = [
      "rate", "amount", "netRate", "netAmount", "basePriceListRate", "baseRate", "baseAmount", "baseNetRate", "baseNetAmount",
      "discountAmount", "rateWithMargin", "baseRateWithMargin", "marginRateOrAmount", "stockQty", "stockUomRate", "totalWeight",
      "taxableValue",
    ] as const;
    for (const f of itemFields) add(`item.${f}`, s[f], c[f]);
    add("item.marginType", s.marginType ? labelOf(MARGIN_TYPE_KEYS, s.marginType) : null, c.marginType);
    add("item.gstTreatment", s.gstTreatment, c.gstTreatment);
    for (const t of GST_TAX_TYPES) {
      const camel = t.replace(/_(\w)/g, (_, ch: string) => ch.toUpperCase());
      add(`item.${camel}Rate`, s[`${camel}Rate` as "igstRate"], c.gst[`${t}_rate`]);
      add(`item.${camel}Amount`, s[`${camel}Amount` as "igstAmount"], c.gst[`${t}_amount`]);
    }
    for (const f of ["igst", "igstAmt", "cgst", "cgstAmt", "sgst", "sgstAmt"] as const) add(`addon.${f}`, s[f], c[f]);
  });

  o.taxes.forEach((s, i) => {
    const c = r.taxes[i];
    row = s.idx;
    for (const f of ["taxAmount", "taxAmountAfterDiscountAmount", "total", "baseTaxAmount", "baseTaxAmountAfterDiscountAmount", "baseTotal"] as const) {
      add(`tax.${f}`, s[f], c[f]);
    }
    const stored = parseJson<Record<string, [number, number]>>(s.itemWiseTaxDetail, {});
    // Compared without key order: Postgres jsonb re-sorts the keys of the imported breakup.
    const norm = (d: Record<string, [number, number]>) =>
      JSON.stringify(Object.entries(d).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, [rate, amt]]) => [k, dbDecimal(Number(rate)), dbDecimal(Number(amt))]));
    add("tax.itemWiseTaxDetail", norm(stored), norm(c.itemWiseTaxDetail));
  });

  o.paymentSchedule.forEach((s, i) => {
    const c = r.paymentSchedule[i];
    row = s.idx;
    add("schedule.paymentAmount", s.paymentAmount, c.paymentAmount);
    add("schedule.basePaymentAmount", s.basePaymentAmount, c.basePaymentAmount);
    if (!num(s.paidAmount)) add("schedule.outstanding", s.outstanding, c.outstanding);
  });
  return out;
}

const ADDON = ["igst", "igstAmt", "cgst", "cgstAmt", "sgst", "sgstAmt"] as const;
const ROW_FIGURES_NOT_REFRESHED = /^item\.(taxableValue|stockUomRate|gstTreatment|(igst|cgst|sgst|cess|cessNonAdvol)(Rate|Amount))$/;

/** Why a stored figure differs, when it is one of the documented exceptions. */
function explain(o: GoldenOrder, r: PurchaseOrderCalcResult, m: Mismatch, updatedAfterSubmit: ReadonlySet<string>): ExceptionKind | undefined {
  if (m.path.startsWith("addon.")) {
    const i = o.items.findIndex((x) => x.idx === m.row);
    const s = o.items[i];
    const c = r.items[i];
    const cat = o.taxCategory?.code ?? null;
    if (ADDON.every((f) => num(s[f]) === 0)) return "addon-not-filled";
    if (cat !== "In-State" && cat !== "Out-State") return "addon-no-category";
    if ((["igst", "cgst", "sgst"] as const).every((f) => num(s[f]) === c[f])) return "addon-stale";
    if (updatedAfterSubmit.has(o.number)) return "update-items";
    return "addon-other-template";
  }
  if (ROW_FIGURES_NOT_REFRESHED.test(m.path) && updatedAfterSubmit.has(o.number)) return "update-items";
  if (m.path === "item.gstTreatment") {
    const s = o.items.find((x) => x.idx === m.row);
    if (s?.itemTaxTemplate?.gstTreatment && s.itemTaxTemplate.gstTreatment !== m.stored) return "template-treatment-later";
  }
  return undefined;
}

/** POs whose rows were changed after submit (a later Version changes the totals or the item rows). */
async function updatedAfterSubmitOf(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ number: string }[]>`
    with v as (select order_id, at, data::jsonb d from purchase_order_events where kind = 'Version'),
    s as (select order_id, min(at) submit_at from v
          where exists (select 1 from jsonb_array_elements(d->'changed') c where c->>0 = 'docstatus' and c->>2 = '1')
          group by order_id)
    select distinct o.number from v join s using (order_id) join purchase_orders o on o.id = v.order_id
    where v.at > s.submit_at and (
      exists (select 1 from jsonb_array_elements(v.d->'changed') c where c->>0 in ('net_total', 'total_qty', 'grand_total', 'total'))
      or exists (select 1 from jsonb_array_elements(coalesce(v.d->'row_changed', '[]')) x where x->>0 = 'items')
      or exists (select 1 from jsonb_array_elements(coalesce(v.d->'added', '[]')) x where x->>0 = 'items'))`;
  return new Set(rows.map((x) => x.number));
}

/** The figures the form's carried-over rounding adjustment decides. */
function headlineMatches(o: GoldenOrder, r: PurchaseOrderCalcResult) {
  return (
    text(o.grandTotal) === text(r.grandTotal) &&
    text(o.roundingAdjustment) === text(r.roundingAdjustment) &&
    text(o.discountAmount) === text(r.discountAmount) &&
    text(o.netTotal) === text(r.netTotal)
  );
}

/** Values to try, most likely first: what the stored Grand Total implies, then every step of ±0.5. */
function* roundingAdjustmentCandidates(o: GoldenOrder, r: PurchaseOrderCalcResult, currencyPrecision: number) {
  const last = r.taxes.at(-1);
  if (last) yield flt(num(o.grandTotal) - last.total - r.costOverheadCharges, currencyPrecision);
  const step = 10 ** -currencyPrecision;
  const n = Math.round(0.5 / step);
  for (let k = 1; k <= n; k++) {
    yield flt(k * step, currencyPrecision);
    yield flt(-k * step, currencyPrecision);
  }
}

const text = (v: Pair[0] | Pair[1]): string => {
  if (v == null) return "";
  if (typeof v === "number") return dbDecimal(v);
  if (typeof v === "string") return v;
  return (v as Dec).toFixed(9);
};

export async function goldenCheck(db: PrismaClient, opts: { only?: string[] } = {}): Promise<GoldenResult> {
  const currencies = new Map((await db.purchaseCurrency.findMany()).map((c) => [c.code, currencyOf(c)]));
  const orders = await db.purchaseOrder.findMany({
    where: opts.only?.length ? { number: { in: opts.only } } : undefined,
    orderBy: { createdAt: "asc" },
    include: orderInclude,
  });
  // The last save of each PO (its last Version), when the old site last computed it.
  const versions = await db.purchaseOrderEvent.groupBy({ by: ["orderId"], where: { kind: "VERSION" }, _max: { at: true } });
  const lastVersion = new Map(versions.map((v) => [v.orderId, v._max.at]));
  const updatedAfterSubmit = await updatedAfterSubmitOf(db);
  const res: GoldenResult = {
    checkedOrders: 0, matchingOrders: 0, eras: new Map(), roundingAdjustmentIn: new Map(), todayDiffers: new Map(),
    explained: new Map(), fields: new Map(), mismatches: [], byOrder: new Map(),
  };
  for (const o of orders) {
    const lastSave = lastVersion.get(o.id) ?? o.createdAt;
    const input = inputOf(o, currencies, lastSave);
    const era = oldSiteEraAt(lastSave);
    res.eras.set(era, (res.eras.get(era) ?? 0) + 1);

    // The old site's own code of that period. From 03-12-2025 its Grand Total also carried the
    // rounding adjustment the form held when saved (not stored anywhere): find the one value that
    // reproduces the stored Grand Total, then every other figure must follow from it.
    let r = calculatePurchaseOrder({ ...input, oldSite: { era } });
    if ((era === "2025-12" || era === "2026-04") && !headlineMatches(o, r)) {
      for (const raIn of roundingAdjustmentCandidates(o, r, input.precision!.currency)) {
        const r2 = calculatePurchaseOrder({ ...input, oldSite: { era, roundingAdjustmentIn: raIn } });
        if (headlineMatches(o, r2)) {
          r = r2;
          res.roundingAdjustmentIn.set(o.number, raIn);
          break;
        }
      }
    }

    // Today's rules, for the record of what the replica would compute differently.
    const today = calculatePurchaseOrder(input);
    for (const [path, [stored, computed]] of pairsOf(o, today)) {
      if (text(stored) !== text(computed)) {
        const set = res.todayDiffers.get(path) ?? new Set<string>();
        set.add(o.number);
        res.todayDiffers.set(path, set);
      }
    }

    res.checkedOrders += 1;
    let ok = true;
    for (const [path, [stored, computed], row] of pairsOf(o, r)) {
      const stat = res.fields.get(path) ?? { checked: 0, mismatched: 0 };
      stat.checked += 1;
      const a = text(stored);
      const b = text(computed);
      if (a !== b) {
        stat.mismatched += 1;
        ok = false;
        const m: Mismatch = { po: o.number, era, path, row, stored: a, computed: b };
        m.why = explain(o, r, m, updatedAfterSubmit);
        const key = m.why ?? "unexplained";
        res.explained.set(key, (res.explained.get(key) ?? 0) + 1);
        res.mismatches.push(m);
        const entry = res.byOrder.get(o.number) ?? { order: o, result: r, paths: new Set<string>() };
        entry.paths.add(path);
        res.byOrder.set(o.number, entry);
      }
      res.fields.set(path, stat);
    }
    if (ok) res.matchingOrders += 1;
  }
  return res;
}
