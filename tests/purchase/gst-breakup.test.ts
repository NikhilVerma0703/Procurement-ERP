import { describe, expect, it } from "vitest";
import { gstBreakup, gstBreakupHtml, isInterStateSupply } from "@/lib/purchase/doc/gst-breakup";
import { sanitizeHtml } from "@/lib/purchase/html";

// Phase II (owner, 21-11-2026): the GST Breakup a receipt's form showed, built as India Compliance
// 14.34.6 built it on every load. Made-up documents.

const opts = { hsnWise: true, precision: 3 };
const item = (o: Record<string, unknown>) => ({ item_code: "X", gst_hsn_code: "3907", taxable_value: 0, cgst_rate: 0, sgst_rate: 0, igst_rate: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, ...o });
const inState = { place_of_supply: "33-Tamil Nadu", company_gstin: "33AAAAA0000A1Z5", supplier_gstin: "33BBBBB1111B1Z5", gst_category: "Registered Regular" };

describe("the GST Breakup", () => {
  it("splits an in-state supply into CGST and SGST, an inter-state one into IGST", () => {
    expect(isInterStateSupply(inState, opts)).toBe(false);
    expect(isInterStateSupply({ ...inState, supplier_gstin: "29CCCCC2222C1Z5" }, opts)).toBe(true);
    expect(isInterStateSupply({ ...inState, gst_category: "SEZ" }, opts)).toBe(true);
    expect(isInterStateSupply({ ...inState, gst_category: "Overseas", place_of_supply: "96-Other Countries" }, opts)).toBe(false);
  });

  it("groups by HSN/SAC and rate, summing the rounded taxable values and taxes", () => {
    const b = gstBreakup({
      ...inState,
      items: [
        item({ item_code: "A", taxable_value: 100, cgst_rate: 9, sgst_rate: 9, cgst_amount: 9, sgst_amount: 9 }),
        item({ item_code: "B", taxable_value: 50.0004, cgst_rate: 9, sgst_rate: 9, cgst_amount: 4.5, sgst_amount: 4.5 }),
        item({ item_code: "C", taxable_value: 10, cgst_rate: 2.5, sgst_rate: 2.5, cgst_amount: 0.25, sgst_amount: 0.25 }),
      ],
    }, opts)!;
    expect(b.taxHeaders).toEqual(["CGST", "SGST"]);
    expect(b.rows.map((r) => [r.key, r.taxableAmount, r.taxes.CGST.taxRate, r.taxes.CGST.taxAmount])).toEqual([
      ["3907", 150, 9, 13.5],
      ["3907", 10, 2.5, 0.25],
    ]);
  });

  it("prints as India Compliance's template did", () => {
    const html = gstBreakupHtml({ ...inState, items: [item({ taxable_value: 187500, cgst_rate: 9, sgst_rate: 9, cgst_amount: 16875, sgst_amount: 16875 })] }, opts)!;
    expect(html).toContain('<th class="text-left">HSN/SAC</th><th class="text-right">Taxable Amount</th><th class="text-right">CGST</th><th class="text-right">SGST</th>');
    expect(html).toContain('<td class="text-left">3907</td><td class="text-right">₹ 187,500.00</td><td class="text-right">(9.0%)&nbsp;₹ 16,875.00</td>');
  });

  it("shows a return's amounts without their minus, and nothing without a place of supply", () => {
    const html = gstBreakupHtml({ ...inState, is_return: 1, items: [item({ taxable_value: -100, cgst_rate: 9, sgst_rate: 9, cgst_amount: -9, sgst_amount: -9 })] }, opts)!;
    expect(html).toContain("₹ 100.00");
    expect(html).not.toMatch(/₹ -/);
    expect(gstBreakupHtml({ ...inState, place_of_supply: "", items: [item({})] }, opts)).toBeNull();
  });
});

describe("rich text with tables", () => {
  it("keeps table structure and plain class names only when asked, and never anything that runs", () => {
    const dirty = '<div class="tax-break-up" style="x" onclick="alert(1)"><table class="table" border="1"><tr><td colspan="2" onmouseover="x()">1</td></tr></table><script>alert(1)</script></div>';
    expect(sanitizeHtml(dirty, { tables: true })).toBe('<div class="tax-break-up"><table class="table"><tr><td colspan="2">1</td></tr></table></div>');
    expect(sanitizeHtml(dirty)).toBe("<div>1</div>");
  });
});
