// The PO calculation engine (Step 4). Figures are made up; the engine is checked against the 3,199
// real POs by `npm run golden` (local data only).
import { describe, expect, it } from "vitest";
import { addonGstColumns } from "@/lib/purchase/calc/addon";
import { itemGstDetails, taxableValues } from "@/lib/purchase/calc/gst";
import { calculatePurchaseOrder, type PurchaseOrderCalcInput } from "@/lib/purchase/calc/index";
import { bankersRoundingLegacy, dbDecimal, flt, pyFormatFixed, pyRound, remainder, roundToCurrencyFraction } from "@/lib/purchase/calc/pymath";
import { addMonths, lastDayOfMonth, scheduleAmounts, scheduleFromTerms } from "@/lib/purchase/calc/schedule";
import { precisionAt } from "@/lib/purchase/calc/settings";
import { purchaseOrderStatus } from "@/lib/purchase/calc/status";
import { oldSiteEraAt } from "@/lib/purchase/calc/totals";
import { inWords, moneyInWords } from "@/lib/purchase/calc/words";

const INR = { code: "INR", smallestFraction: 0, fraction: "Paisa", numberFormat: "#,##,###.##" };
const USD = { code: "USD", smallestFraction: 0.01, fraction: "Cent", numberFormat: "#,###.##" };

type ItemIn = PurchaseOrderCalcInput["items"][number];
type TaxIn = PurchaseOrderCalcInput["taxes"][number];

const item = (code: string, qty: number, rate: number, extra: Partial<ItemIn> = {}): ItemIn => ({
  itemCode: code, itemName: code, qty, conversionFactor: 1, priceListRate: 0, discountPercentage: 0, discountAmount: 0,
  marginType: null, marginRateOrAmount: 0, rate, itemTaxRate: {}, applyTds: true, weightPerUnit: 0,
  itemTaxTemplate: null, templateRates: null, gstTreatment: null, ...extra,
});
const tax = (accountHead: string, chargeType: TaxIn["chargeType"], rate: number, extra: Partial<TaxIn> = {}): TaxIn => ({
  chargeType, rowId: null, accountHead, rate, taxAmount: 0, category: "Total", addDeductTax: "Add", includedInPrintRate: false,
  gstTaxType: null, ...extra,
});
const po = (over: Partial<PurchaseOrderCalcInput>): PurchaseOrderCalcInput => ({
  currency: INR, companyCurrency: INR, conversionRate: 1, applyDiscountOn: "Grand Total", additionalDiscountPercentage: 0,
  discountAmount: 0, disableRoundedTotal: false, taxCategory: "In-State", items: [], taxes: [], costOverheadCharges: [],
  paymentSchedule: [], ...over,
});

describe("Python / Frappe number behaviour", () => {
  it("rounds the exact value of a double, ties to even, like Python's round()", () => {
    expect(pyRound(2.675, 2)).toBe(2.67); // 2.675 is 2.67499999… in binary
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(0.375, 2)).toBe(0.38);
    expect([pyRound(2.5), pyRound(3.5), pyRound(-2.5)]).toEqual([2, 4, -2]);
    expect(pyFormatFixed(0.125, 2)).toBe("0.12");
    expect(pyFormatFixed(1234.5, 2)).toBe("1234.50");
  });

  it("flt follows the old site's 'Banker's Rounding (legacy)': half up with decimals, half even to whole numbers", () => {
    expect(flt(2.675, 2)).toBe(2.68);
    expect(flt(1.005, 2)).toBe(1.01);
    expect([flt(2.5, 0), flt(3.5, 0), flt(-2.5, 0)]).toEqual([2, 4, -2]);
    expect(bankersRoundingLegacy(160.4745, 3)).toBe(160.475);
    expect(flt("1,234.5")).toBe(1234.5);
    expect(flt(null)).toBe(0);
  });

  it("rounds a total to the currency's smallest fraction", () => {
    expect(roundToCurrencyFraction(415799.5, 0, 3)).toBe(415800); // 415799 is odd → up
    expect(roundToCurrencyFraction(23152.5, 0, 3)).toBe(23152); // 23152 is even → stays
    expect(roundToCurrencyFraction(1860.192, 0.01, 3)).toBe(1860.19);
    expect(remainder(10.25, 0.1, 2)).toBe(0.05);
  });

  it("writes a figure as MariaDB stored it in DECIMAL(21,9)", () => {
    expect(dbDecimal(0.1 + 0.2)).toBe("0.300000000");
    expect(dbDecimal(1e-7)).toBe("0.000000100");
    expect(dbDecimal(-5e-10)).toBe("-0.000000001");
    expect(dbDecimal(415799.5)).toBe("415799.500000000");
  });

  it("knows the precision the old site used at a given time", () => {
    expect(precisionAt(new Date("2024-05-01T00:00:00Z"))).toEqual({ currency: 2, float: 3 });
    expect(precisionAt(new Date("2024-09-01T00:00:00Z"))).toEqual({ currency: 2, float: 4 });
    expect(precisionAt(new Date("2026-11-16T00:00:00Z"))).toEqual({ currency: 3, float: 3 });
  });
});

describe("amount in words", () => {
  it("uses lakh and crore for INR", () => {
    expect(moneyInWords(2001326, INR)).toBe("INR Twenty Lakh, One Thousand, Three Hundred And Twenty Six only.");
    expect(moneyInWords(123456789, INR)).toBe(
      "INR Twelve Crore, Thirty Four Lakh, Fifty Six Thousand, Seven Hundred And Eighty Nine only.",
    );
    expect(moneyInWords(100, INR)).toBe("INR One Hundred only.");
  });

  it("uses million for other currencies and names the fraction", () => {
    expect(moneyInWords(1234.5, USD)).toBe("USD One Thousand, Two Hundred And Thirty Four and Fifty Cent only.");
    expect(moneyInWords(1000000, USD)).toBe("USD One Million only.");
  });

  it("handles zero, fractions only and negatives as Frappe does", () => {
    expect(moneyInWords(0, INR)).toBe("INR Zero only.");
    expect(moneyInWords(0.5, INR)).toBe("Fifty Paisa only.");
    expect(moneyInWords(-5, INR)).toBe("");
    expect(inWords(101, false)).toBe("one hundred and one");
  });
});

describe("totals and taxes (ERPNext 14)", () => {
  const inState = po({
    items: [item("A", 10, 99.99), item("B", 3, 250.5)],
    taxes: [tax("CGST", "On Net Total", 9, { gstTaxType: "cgst" }), tax("SGST", "On Net Total", 9, { gstTaxType: "sgst" })],
  });

  it("adds tax rows on the net total and rounds the grand total to whole rupees", () => {
    const r = calculatePurchaseOrder(inState);
    expect(r.items.map((i) => i.amount)).toEqual([999.9, 751.5]);
    expect(r.netTotal).toBe(1751.4);
    expect(r.taxes.map((t) => [t.taxAmount, t.total])).toEqual([[157.626, 1909.026], [157.626, 2066.652]]);
    expect([r.totalTaxesAndCharges, r.taxesAndChargesAdded]).toEqual([315.252, 315.252]);
    expect([r.grandTotal, r.roundedTotal, r.roundingAdjustment]).toEqual([2066.652, 2067, 0.348]);
    expect(r.inWords).toBe("INR Two Thousand And Sixty Seven only.");
    expect(r.taxes[0].itemWiseTaxDetail.A[0]).toBe(9);
    expect(r.taxes[0].itemWiseTaxDetail.A[1]).toBeCloseTo(89.991, 9);
  });

  it("spreads a Grand Total discount over the items, not over fixed charges", () => {
    const r = calculatePurchaseOrder(
      po({
        additionalDiscountPercentage: 10,
        items: [item("A", 1, 1000)],
        taxes: [tax("IGST", "On Net Total", 18, { gstTaxType: "igst" }), tax("Freight", "Actual", 0, { taxAmount: 100 })],
      }),
    );
    expect(r.discountAmount).toBe(128); // 10% of 1,280
    expect(r.netTotal).toBe(891.525); // 1,000 − 128 × 1,000 / 1,180
    expect(r.taxes.map((t) => t.taxAmountAfterDiscountAmount)).toEqual([160.475, 100]);
    expect(r.grandTotal).toBe(1152); // 1,280 − 128
    expect(r.totalTaxesAndCharges).toBe(260.475);
  });

  it("converts to the company currency and rounds USD to the cent", () => {
    const r = calculatePurchaseOrder(po({ currency: USD, conversionRate: 83.5, taxCategory: null, items: [item("A", 3, 33.333)] }));
    expect(r.grandTotal).toBe(99.999);
    expect([r.roundedTotal, r.roundingAdjustment]).toEqual([100, 0.001]);
    expect([r.baseNetTotal, r.baseGrandTotal, r.baseRoundedTotal]).toEqual([8349.917, 8349.917, 8350]);
    expect(r.inWords).toBe("USD One Hundred only.");
    expect(r.baseInWords).toBe("INR Eight Thousand, Three Hundred And Fifty only.");
  });
});

describe("Cost Overheads (add-on)", () => {
  it("count in the Grand Total and, with tax rows, in Total Taxes and Charges", () => {
    const r = calculatePurchaseOrder(
      po({ items: [item("A", 1, 1000)], taxes: [tax("IGST", "On Net Total", 18, { gstTaxType: "igst" })], costOverheadCharges: [50, 25.5] }),
    );
    expect([r.costOverheadCharges, r.taxesAndChargesAdded, r.totalTaxesAndCharges]).toEqual([75.5, 180, 255.5]);
    expect([r.grandTotal, r.roundedTotal, r.roundingAdjustment]).toEqual([1255.5, 1256, 0.5]);
  });

  it("stay in the company-currency Grand Total when the PO has no tax rows", () => {
    const r = calculatePurchaseOrder(po({ items: [item("A", 1, 1000)], costOverheadCharges: [50, 25.5] }));
    expect([r.totalTaxesAndCharges, r.grandTotal, r.baseGrandTotal]).toEqual([0, 1075.5, 1075.5]);
  });

  it("are counted once when the Grand Total is discounted", () => {
    const r = calculatePurchaseOrder(
      po({
        additionalDiscountPercentage: 10,
        items: [item("A", 1, 1000)],
        taxes: [tax("IGST", "On Net Total", 18, { gstTaxType: "igst" }), tax("Freight", "Actual", 0, { taxAmount: 100 })],
        costOverheadCharges: [20],
      }),
    );
    expect(r.discountAmount).toBe(130); // 10% of 1,300
    expect(r.grandTotal).toBe(1170); // 1,300 − 130
    expect(r.totalTaxesAndCharges).toBe(280.17);
  });
});

describe("old-site mode (golden check only)", () => {
  const base = po({
    items: [item("A", 10, 99.99), item("B", 3, 250.5)],
    taxes: [tax("CGST", "On Net Total", 9, { gstTaxType: "cgst" }), tax("SGST", "On Net Total", 9, { gstTaxType: "sgst" })],
  });

  it("dates the old site's code periods", () => {
    expect(oldSiteEraAt(new Date("2024-06-01T00:00:00Z"))).toBe("2024-03");
    expect(oldSiteEraAt(new Date("2025-12-03T08:00:00Z"))).toBe("2024-10");
    expect(oldSiteEraAt(new Date("2025-12-03T08:10:00Z"))).toBe("2025-12");
    expect(oldSiteEraAt(new Date("2026-11-16T00:00:00Z"))).toBe("2026-04");
  });

  it("from 03-12-2025 the Grand Total carried the rounding adjustment the form held", () => {
    const r = calculatePurchaseOrder({ ...base, oldSite: { era: "2025-12", roundingAdjustmentIn: 0.348 } });
    expect([r.grandTotal, r.roundingAdjustment, r.roundedTotal, r.totalTaxesAndCharges]).toEqual([2067, 0, 2067, 315.252]);
    const before = calculatePurchaseOrder({ ...base, oldSite: { era: "2024-10", roundingAdjustmentIn: 0.348 } });
    expect([before.grandTotal, before.roundingAdjustment]).toEqual([2066.652, 0.348]);
  });

  it("before that, a Grand Total discount counted the overheads twice", () => {
    const r = calculatePurchaseOrder(
      po({
        additionalDiscountPercentage: 10,
        items: [item("A", 1, 1000)],
        taxes: [tax("IGST", "On Net Total", 18, { gstTaxType: "igst" }), tax("Freight", "Actual", 0, { taxAmount: 100 })],
        costOverheadCharges: [20],
        oldSite: { era: "2024-10" },
      }),
    );
    expect(r.grandTotal).toBe(1190); // 1,300 − 130 + 20 again
  });
});

describe("GST per row (India Compliance) and the add-on's GST columns", () => {
  it("adds charges that GST is levied on to the taxable value", () => {
    const items = [
      { itemCode: "A", itemName: "A", qty: 1, baseNetAmount: 1000, itemTaxTemplate: null, gstTreatment: null },
      { itemCode: "B", itemName: "B", qty: 1, baseNetAmount: 3000, itemTaxTemplate: null, gstTreatment: null },
    ];
    const taxes = [
      { chargeType: "Actual", rowId: null, rate: 0, accountHead: "Freight", addDeductTax: "Add", gstTaxType: null, baseTaxAmountAfterDiscountAmount: 400, baseTotal: 4400, itemWiseTaxDetail: { A: [0, 100], B: [0, 300] } as Record<string, [number, number]> },
      { chargeType: "On Previous Row Total", rowId: 1, rate: 18, accountHead: "IGST", addDeductTax: "Add", gstTaxType: "igst", baseTaxAmountAfterDiscountAmount: 792, baseTotal: 5192, itemWiseTaxDetail: { A: [18, 198], B: [18, 594] } as Record<string, [number, number]> },
    ];
    const taxable = taxableValues(items, taxes, { baseNetTotal: 4000, totalQty: 2 });
    expect(taxable).toEqual([1100, 3300]);
    const details = itemGstDetails(items, taxes, taxable);
    expect(details.map((d) => [d.igst_rate, d.igst_amount])).toEqual([[18, 198], [18, 594]]);
  });

  it("fills the add-on columns from the row's template: In-State CGST/SGST, Out-State IGST", () => {
    expect(addonGstColumns(1000, [9, 9, 18], "In-State")).toEqual({ igst: 0, igstAmt: 0, cgst: 9, cgstAmt: 90, sgst: 9, sgstAmt: 90 });
    expect(addonGstColumns(1000, [9, 9, 18], "Out-State")).toMatchObject({ igst: 18, igstAmt: 180, cgst: 0 });
    expect(addonGstColumns(1000, [9, 9, 18], null)).toMatchObject({ igst: 0, cgst: 0, sgst: 0 });
    expect(addonGstColumns(1000, null, "In-State")).toMatchObject({ igst: 0, cgst: 0, sgst: 0 });
  });
});

describe("status and payment schedule", () => {
  it("sets the PO status from receipts, bills and user actions", () => {
    const s = (docStatus: 0 | 1 | 2, perReceived: number, perBilled: number, status = "Draft" as const) =>
      purchaseOrderStatus({ docStatus, status, perReceived, perBilled });
    expect(s(0, 0, 0)).toBe("Draft");
    expect(s(1, 0, 0)).toBe("To Receive and Bill");
    expect(s(1, 100, 0)).toBe("To Bill");
    expect(s(1, 40, 100)).toBe("To Receive");
    expect(s(1, 100, 100)).toBe("Completed");
    expect(s(2, 0, 0)).toBe("Cancelled");
    expect(purchaseOrderStatus({ docStatus: 1, status: "Closed", perReceived: 0, perBilled: 0 })).toBe("Closed");
    expect(purchaseOrderStatus({ docStatus: 1, status: "On Hold", perReceived: 100, perBilled: 100 })).toBe("On Hold");
  });

  it("splits the Rounded Total by portion and dates the terms", () => {
    const t = { grandTotal: 1000.4, baseGrandTotal: 1000.4, roundedTotal: 1000, baseRoundedTotal: 1000, conversionRate: 1 };
    expect(scheduleAmounts([{ invoicePortion: 30, paymentAmount: 0, outstanding: 0 }, { invoicePortion: 70, paymentAmount: 0, outstanding: 0 }], t)
      .map((s) => s.paymentAmount)).toEqual([300, 700]);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(lastDayOfMonth("2024-02-10")).toBe("2024-02-29");
    const term = { paymentTermName: null, description: null, invoicePortion: 100, modeOfPayment: null, creditDays: 30, creditMonths: 1, discountType: null, discount: 0, discountValidityBasedOn: null, discountValidity: 0 };
    expect(scheduleFromTerms([{ ...term, dueDateBasedOn: "Day(s) after invoice date" }], "2026-11-16")[0].dueDate).toBe("2026-12-16");
    expect(scheduleFromTerms([{ ...term, dueDateBasedOn: "Month(s) after the end of the invoice month" }], "2026-11-16")[0].dueDate).toBe("2026-12-31");
  });
});
