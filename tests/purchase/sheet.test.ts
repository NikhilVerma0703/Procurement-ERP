// Step 7: the PO sheet's rules that need no database or font files — values
// printed the way the old Jinja templates printed them, the terms' paragraphs,
// the old browser's table widths and line breaks, and what each layout prints.
// (How the sheets compare with the old site's PDFs: scripts/check-sheets.ts.)
import { describe, expect, it } from "vitest";
import { cssTableWidths, maxWidth, minWidth, spreadPercent, wrapLines, type Measure } from "@/lib/purchase/pdf/layouts/css-table";
import { DEFAULT_PO_LAYOUT, PO_LAYOUTS, isPoLayout, type PoLayout } from "@/lib/purchase/pdf/layouts/index";
import { itemTexts, itemWidths, lh, raise, tenPerPage, W } from "@/lib/purchase/pdf/layouts/parts";
import { dmy, jinja, pyFixed, pyStr } from "@/lib/purchase/pdf/pyfmt";
import { termsBlocks, type PoSheet, type SheetItem } from "@/lib/purchase/pdf/sheet";

/** A stand-in for the font: every character 3pt wide (3.5pt bold). */
const measure: Measure = (text, bold) => text.length * (bold ? 3.5 : 3);

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

function item(idx: number, o: Partial<SheetItem> = {}): SheetItem {
  return {
    idx,
    itemCode: `QZ-${idx}`,
    itemName: `QUARTZ GRITS 0.6-1.2MM PREMIUM ${idx}`,
    description: null,
    hsn: "25061010",
    uom: "Tonne",
    qty: 6,
    rate: 11900,
    rateShown: "₹ 11,900.00",
    discountPercentage: 0,
    amount: 71400,
    netAmount: 71400,
    cgst: 0,
    cgstAmt: 0,
    sgst: 0,
    sgstAmt: 0,
    igst: 5,
    igstAmt: 3570,
    scheduleDate: date("2026-11-07"),
    ...o,
  };
}

function sheet(o: Partial<PoSheet> = {}): PoSheet {
  return {
    number: "PUR-ORD/25-26/02510",
    docStatus: "Submitted",
    status: "To Receive and Bill",
    supplier: "Sample Minerals",
    supplierName: "Sample Minerals",
    supplierAddress: "Sample Minerals-Billing",
    addressDisplay: "Plot 1, Sample Road<br>Telangana, State Code: 36<br>India<br>",
    supplierGstin: "36AAAAA0000A1Z5",
    transactionDate: date("2026-11-07"),
    scheduleDate: date("2026-11-08"),
    currency: "INR",
    tcName: "Immediate",
    terms: [{ text: "", paragraph: true }],
    shippingAddress: "Sample Works-Billing",
    shippingAddressDisplay: "Plot 2, Works Road<br>Krishnagiri<br>",
    billingAddressDisplay: null,
    companyGstin: "33AAAAA0000A1Z5",
    modeOfTransport: "Road",
    shipmentType: "Domestic",
    purposeOfPurchase: "General",
    paymentTermsTemplate: "30 DAYS CREDIT",
    schedule: [{ paymentTerm: "30 DAYS CREDIT", description: null, dueDate: date("2026-12-07"), invoicePortion: 100, paymentAmount: 415800 }],
    items: [item(1)],
    services: [],
    taxes: [{ accountHead: "Input Tax IGST - PESPL", description: null, rate: 5, taxAmount: 19800, total: 415799.5 }],
    total: 396000,
    netTotal: 396000,
    discountAmount: 0,
    taxesAndChargesAdded: 19800,
    totalTaxesAndCharges: 19800,
    grandTotal: 415799.5,
    roundingAdjustment: 0.5,
    roundedTotal: 415800,
    inWords: "INR Four Lakh, Fifteen Thousand, Eight Hundred only.",
    money: { symbol: "₹", fractionUnits: 100 },
    ...o,
  };
}

/** Every text a layout puts on the page, in order. */
function texts(layout: PoLayout, s: PoSheet): string[] {
  const doc = PO_LAYOUTS[layout](s, { logo: null, measure }) as { content: unknown[] };
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === "string") out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      const node = n as Record<string, unknown>;
      for (const k of ["text", "stack", "columns", "ul", "table", "body"]) if (k in node) walk(node[k]);
    }
  };
  walk(doc.content);
  return out;
}
const printed = (layout: PoLayout, s: PoSheet) => texts(layout, s).join("\n");

describe("values as the old Jinja templates printed them", () => {
  it("floats as Python's str(float)", () => {
    expect(pyStr(6)).toBe("6.0");
    expect(pyStr(415799.5)).toBe("415799.5");
    expect(pyStr(0)).toBe("0.0");
    expect(pyStr(-2.5)).toBe("-2.5");
    expect(pyStr(0.0001)).toBe("0.0001");
    expect(pyStr(0.00001)).toBe("1e-05");
    expect(pyStr(1e16)).toBe("1e+16");
    expect(pyStr(44692.02)).toBe("44692.02");
  });

  it("empty fields as None, dates as ISO in Jinja and dd-mm-yyyy through formatdate", () => {
    expect(jinja(null)).toBe("None");
    expect(jinja(undefined)).toBe("None");
    expect(jinja(date("2026-11-07"))).toBe("2026-11-07");
    expect(jinja("Road")).toBe("Road");
    expect(dmy(date("2026-11-07"))).toBe("07-11-2026");
    expect(dmy(null)).toBe("");
  });

  it("'%0.2f' rounds the exact binary value, ties to even", () => {
    expect(pyFixed(71400)).toBe("71400.00");
    expect(pyFixed(0.125)).toBe("0.12");
    expect(pyFixed(0.375)).toBe("0.38");
    expect(pyFixed(1.005)).toBe("1.00");
  });
});

describe("the terms as printed", () => {
  it("an empty editor still prints one empty paragraph", () => {
    expect(termsBlocks('<div class="ql-editor read-mode"><p><br></p></div>')).toEqual([{ text: "", paragraph: true }]);
  });

  it("paragraphs one by one, line breaks kept, loose text apart", () => {
    expect(termsBlocks('<div class="ql-editor read-mode"><p>AS/QO/26-27/155</p><p>Warranty - 12 months</p></div>')).toEqual([
      { text: "AS/QO/26-27/155", paragraph: true },
      { text: "Warranty - 12 months", paragraph: true },
    ]);
    expect(termsBlocks("<p>a<br>b</p>")).toEqual([{ text: "a\nb", paragraph: true }]);
    expect(termsBlocks("Plain terms")).toEqual([{ text: "Plain terms", paragraph: false }]);
  });
});

describe("the old browser's tables (WebKit auto layout)", () => {
  it("breaks lines at spaces and after a hyphen inside a word, never after a leading minus", () => {
    expect(wrapLines("QUARTZ GRITS 0.6-1.2MM PREMIUM", 60, measure)).toEqual(["QUARTZ GRITS 0.6-", "1.2MM PREMIUM"]);
    expect(wrapLines("-5.0", 3, measure)).toEqual(["-5.0"]);
    expect(wrapLines("PRODUCT CODE AND DESCRIPTION", 60, measure)).toEqual(["PRODUCT CODE AND", "DESCRIPTION"]);
  });

  it("a cell's narrowest and widest widths", () => {
    expect(minWidth("QUARTZ GRITS 0.6-1.2MM", measure)).toBe(18);
    expect(maxWidth("QUARTZ GRITS", measure)).toBe(36);
    expect(minWidth("₹ 11,900.00", measure)).toBe(27);
  });

  it("raises percentage columns to their share, then shares the rest by percentage", () => {
    expect(cssTableWidths([{ min: 20, max: 40, percent: 8 }, { min: 30, max: 60, percent: 4 }], 200)).toEqual([120, 80]);
    // A column's minimum wins over a smaller percentage share.
    expect(cssTableWidths([{ min: 50, max: 50, percent: 1 }, { min: 10, max: 10, percent: 1 }], 100)).toEqual([70, 30]);
  });

  it("shares the space by content width among columns without a percentage", () => {
    expect(cssTableWidths([{ min: 10, max: 30 }, { min: 10, max: 10 }], 100)).toEqual([75, 25]);
  });

  it("shrinks every column alike when even the minimums do not fit", () => {
    expect(cssTableWidths([{ min: 60, max: 60 }, { min: 60, max: 60 }], 100)).toEqual([50, 50]);
  });

  it("a spanning heading's percentage goes to its columns by content width", () => {
    const cols = [{ min: 5, max: 10 }, { min: 5, max: 30 }] as { min: number; max: number; percent?: number }[];
    spreadPercent(cols, 0, 2, 4);
    expect(cols.map((c) => c.percent)).toEqual([1, 3]);
  });

  it("the items table fills the page width", () => {
    const rows = [item(1), item(2, { qty: 675, rateShown: "₹ 188.00" })].map((r) => itemTexts(r, "itemName"));
    const widths = itemWidths(rows, measure);
    expect(widths).toHaveLength(15);
    // The page width less the outer border and each column's border and 1px padding either side.
    expect(widths.reduce((a, x) => a + x, 0)).toBeCloseTo(W - 0.75 - 15 * 2.25, 6);
  });
});

describe("the sheets' type", () => {
  it("lines 10.5pt apart (9pt after the items on the later layouts), text lowered to the browser's baseline", () => {
    expect(lh(10.5) * 1.171875 * 6.75).toBeCloseTo(10.5, 6);
    expect(lh(9) * 1.171875 * 6.75).toBeCloseTo(9, 6);
    expect(raise()).toBeCloseTo(1.13, 2);
  });

  it("ten items to a page, and a page for a PO without items", () => {
    expect(tenPerPage([]).map((p) => p.length)).toEqual([0]);
    expect(tenPerPage(Array.from({ length: 25 }, (_, i) => i)).map((p) => p.length)).toEqual([10, 10, 5]);
  });
});

describe("the layouts", () => {
  it("are the old site's Print Formats with reference PDFs, PDF PO the default", () => {
    expect(Object.keys(PO_LAYOUTS)).toEqual(["PDF PO", "Import PO", "PO print format", "Purchase Order 2025", "PURCHASE ORDER TEMPLATE"]);
    expect(DEFAULT_PO_LAYOUT).toBe("PDF PO");
    expect(isPoLayout("PDF PO")).toBe(true);
    expect(isPoLayout("Standard")).toBe(false);
    expect(isPoLayout("toString")).toBe(false);
    expect(isPoLayout(null)).toBe(false);
  });

  it("PDF PO: item codes, ISO dates, BY ROAD and DAP whatever the PO says", () => {
    const t = printed("PDF PO", sheet({ modeOfTransport: "Ship" }));
    expect(t).toContain("QZ-1");
    expect(t).not.toContain("QUARTZ GRITS");
    expect(t).toContain("PO DATE: 2026-11-07");
    expect(t).toContain("DELIVERY DATE: 2026-11-08");
    expect(t).toContain("SHIPPING METHOD : BY ROAD");
    expect(t).toContain("DAP");
    expect(t).toContain("PACIFIC ENGINEERED SURFACES PRIVATE lIMITED");
  });

  it("PDF PO: TAXABLE VALUES is the amount minus the discount percentage, Total Amount adds the GST", () => {
    const t = texts("PDF PO", sheet({ items: [item(1, { discountPercentage: 10, amount: 64260, igstAmt: 3213 })] }));
    expect(t).toContain("64250.0");
    expect(t).toContain("67473.00");
  });

  it("an empty Terms template and no terms print None", () => {
    expect(printed("PDF PO", sheet({ tcName: null, terms: null }))).toContain("None None");
    const lined = texts("PO print format", sheet({ tcName: null, terms: null }));
    expect(lined.filter((x) => x === "None")).toHaveLength(2);
  });

  it("the later layouts print item names and dd-mm-yyyy dates", () => {
    for (const layout of ["Import PO", "PO print format", "Purchase Order 2025", "PURCHASE ORDER TEMPLATE"] as const) {
      const t = printed(layout, sheet());
      expect(t).toContain("QUARTZ GRITS 0.6-");
      expect(t).not.toContain("QZ-1");
      expect(t).toContain("PO DATE: 07-11-2026");
    }
  });

  it("each later layout's transport lines and closing", () => {
    const s = sheet({ modeOfTransport: "Ship", shipmentType: "Import", purposeOfPurchase: null });
    const imp = printed("Import PO", s);
    expect(imp).toContain("SHIPPING METHOD :Ship");
    expect(imp).toContain("This is an electronically generated report, hence does not require a signature");
    expect(imp).not.toContain("DAP");

    const pf = printed("PO print format", s);
    expect(pf).toContain("MODE OF TRANSPORT: Ship");
    expect(pf).toContain("SHIPMENT TYPE: Import");
    expect(pf).toContain("PURPOSE: None");
    for (const sign of ["REQUESTED BY", "PREPARED BY", "APPROVED BY"]) expect(pf).toContain(sign);

    const y25 = printed("Purchase Order 2025", s);
    expect(y25).toContain("Mode of Transport: Ship");
    expect(y25).toContain("Shipment Type: Import");
    expect(y25).not.toContain("PURPOSE");
    expect(y25).toContain("AUTHORISED SIGNATORY");

    const tpl = printed("PURCHASE ORDER TEMPLATE", s);
    expect(tpl).toContain("TERMS & CONDITIONS:");
    expect(tpl).toContain("AND TERMS & CONDITIONS MENTIONED");
    expect(tpl).toContain("PACIFIC ENGINEERED SURFACES PRIVATE LIMITED");
    expect(tpl).not.toContain("lIMITED");
  });

  it("the heading box starts every page of ten items", () => {
    const doc = PO_LAYOUTS["PDF PO"](sheet({ items: Array.from({ length: 21 }, (_, i) => item(i + 1)) }), { logo: null, measure }) as { content: Record<string, unknown>[] };
    expect(doc.content.filter((n) => n.pageBreak === "before")).toHaveLength(2);
    const tables = doc.content.filter((n) => (n.table as { headerRows?: number } | undefined)?.headerRows === 2);
    expect(tables.map((t) => (t.table as { body: unknown[] }).body.length - 2)).toEqual([10, 10, 1]);
  });

  it("tax rows and Cost Overheads print only when they add up to more than nothing", () => {
    const taxes = [
      { accountHead: "Input Tax CGST - PESPL", description: null, rate: 9, taxAmount: 0, total: 0 },
      { accountHead: "Input Tax SGST - PESPL", description: null, rate: 9, taxAmount: 450, total: 0 },
    ];
    const t = texts("PDF PO", sheet({ taxes, services: [{ serviceItem: "Insurance", serviceCharges: 1200, chargesText: "1200" }] }));
    expect(t).toContain("Input Tax SGST - PESPL");
    expect(t).not.toContain("Input Tax CGST - PESPL");
    expect(t).toContain("SERVICE ITEMS");
    expect(t).toContain("Insurance");
    const none = texts("PDF PO", sheet({ taxes: [{ ...taxes[1], taxAmount: -450 }], services: [{ serviceItem: "Discount", serviceCharges: 0, chargesText: "0" }] }));
    expect(none).not.toContain("ACCOUNT HEAD");
    expect(none).not.toContain("SERVICE ITEMS");
  });
});
