// Step 6: the PO form's rules that need no database — which actions a PO's
// state and the user's role allow, the change history in ERPNext's Version
// shape, India Compliance's GST checks, the row pricing rule, empty rows, the
// form schema's messages and the numbering.
import { describe, expect, it } from "vitest";
import { emptyItemRow, emptyTaxRow, dropEmptyRows, pricedRate } from "@/components/purchase/form/rows";
import { calculatePurchaseOrder } from "@/lib/purchase/calc/index";
import { engineInput, type EngineMasters } from "@/lib/purchase/orders/engine-input";
import { orderFormSchema, fieldErrorsOf, type OrderFormValues } from "@/lib/purchase/orders/form-schema";
import { derivePlaceOfSupply, gstIssue, type GstContext } from "@/lib/purchase/orders/gst-rules";
import { amendedNumber, seriesNumber } from "@/lib/purchase/orders/numbering";
import type { Snapshot } from "@/lib/purchase/orders/record";
import { versionDiff } from "@/lib/purchase/orders/version";
import { allowedActions, canDo, stateAllows, type PoState } from "@/lib/purchase/orders/workflow";

const draft: PoState = { docStatus: "Draft", workflowState: "Created", status: "Draft", perReceived: 0, perBilled: 0 };
const open: PoState = { docStatus: "Submitted", workflowState: "Approved", status: "To Receive and Bill", perReceived: 0, perBilled: 0 };
const toBill: PoState = { ...open, status: "To Bill", perReceived: 100 };
const onHold: PoState = { ...open, status: "On Hold" };
const closed: PoState = { ...open, status: "Closed" };
const completed: PoState = { ...open, status: "Completed", perReceived: 100, perBilled: 100 };
const cancelled: PoState = { ...open, docStatus: "Cancelled", status: "Cancelled" };

describe("workflow: what a PO's state allows (old workflow + ERPNext buttons)", () => {
  it("a Created draft is saved, deleted, approved or rejected", () => {
    for (const a of ["save", "delete", "approve", "reject", "duplicate"] as const) expect(stateAllows(draft, a)).toBe(true);
    for (const a of ["cancel", "amend", "close", "hold", "update", "updateItems"] as const) expect(stateAllows(draft, a)).toBe(false);
  });

  it("a submitted PO is cancelled (whatever its status), held, closed, updated", () => {
    expect(stateAllows(open, "cancel")).toBe(true);
    expect(stateAllows(closed, "cancel")).toBe(true);
    expect(stateAllows(open, "hold")).toBe(true);
    expect(stateAllows(open, "close")).toBe(true);
    expect(stateAllows(open, "updateItems")).toBe(true);
    expect(stateAllows(open, "save")).toBe(false);
    expect(stateAllows(open, "approve")).toBe(false);
  });

  it("On Hold offers Resume and Close; Closed offers Re-open; Completed offers neither", () => {
    expect(stateAllows(onHold, "resume")).toBe(true);
    expect(stateAllows(onHold, "close")).toBe(true);
    expect(stateAllows(onHold, "hold")).toBe(false);
    expect(stateAllows(closed, "reopen")).toBe(true);
    expect(stateAllows(closed, "close")).toBe(false);
    expect(stateAllows(completed, "hold")).toBe(false);
    expect(stateAllows(completed, "close")).toBe(false);
  });

  it("Update Items only while nothing is fully received or billed", () => {
    expect(stateAllows(toBill, "updateItems")).toBe(false);
    expect(stateAllows(toBill, "hold")).toBe(true);
  });

  it("a cancelled PO is amended once", () => {
    expect(stateAllows(cancelled, "amend")).toBe(true);
    expect(stateAllows({ ...cancelled, amended: true }, "amend")).toBe(false);
    expect(stateAllows(cancelled, "cancel")).toBe(false);
  });

  it("roles: PURCHASE edits drafts, APPROVER approves and manages, ADMIN does both", () => {
    const purchase = { role: "PURCHASE" };
    const approver = { role: "APPROVER" };
    const admin = { role: "ADMIN" };
    expect(canDo(purchase, null, "save")).toBe(true);
    expect(canDo(approver, null, "save")).toBe(false);
    expect(canDo(purchase, draft, "approve")).toBe(false);
    expect(canDo(approver, draft, "approve")).toBe(true);
    expect(canDo(approver, open, "cancel")).toBe(true);
    expect(canDo(purchase, open, "cancel")).toBe(false);
    expect([...allowedActions(admin, draft)].sort()).toEqual(["approve", "delete", "duplicate", "reject", "save"]);
    expect(canDo(null, draft, "save")).toBe(false);
  });
});

const cell = (raw: string | number | null, shown: string | number | null = raw) => ({ raw, shown });
function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    number: "PUR-ORD/25-26/02530",
    docStatus: 0,
    header: { total_qty: cell(6, "6"), grand_total: cell(84252, "₹ 84,252.00"), status: cell("Draft") },
    tables: { items: { doctype: "Purchase Order Item", rows: [{ name: "r1", idx: 1, values: { qty: cell(6, "6"), schedule_date: cell("2026-11-25", "25-11-2026") } }] } },
    ...over,
  };
}

describe("change history in ERPNext's Version shape", () => {
  it("records nothing when nothing changed", () => {
    expect(versionDiff(snap(), snap())).toBeNull();
  });

  it("lists changed fields with their shown values, docstatus last", () => {
    const after = snap({ docStatus: 1, header: { total_qty: cell(7, "7"), grand_total: cell(98294, "₹ 98,294.00"), status: cell("To Receive and Bill") } });
    const d = versionDiff(snap(), after)!;
    expect(d.changed).toEqual([
      ["total_qty", "6", "7"],
      ["grand_total", "₹ 84,252.00", "₹ 98,294.00"],
      ["status", "Draft", "To Receive and Bill"],
      ["docstatus", 0, 1],
    ]);
  });

  it("skips a change that does not show (same formatted value)", () => {
    const after = snap({ header: { total_qty: cell(6.0000001, "6"), grand_total: cell(84252, "₹ 84,252.00"), status: cell("Draft") } });
    expect(versionDiff(snap(), after)).toBeNull();
  });

  it("matches rows by name: changed, added, removed", () => {
    const after = snap({
      tables: {
        items: {
          doctype: "Purchase Order Item",
          rows: [
            { name: "r1", idx: 1, values: { qty: cell(6, "6"), schedule_date: cell("2026-11-28", "28-11-2026") } },
            { name: "r2", idx: 2, values: { qty: cell(1, "1"), schedule_date: cell(null) } },
          ],
        },
      },
    });
    const d = versionDiff(snap(), after)!;
    expect(d.row_changed).toEqual([["items", 0, "r1", [["schedule_date", "25-11-2026", "28-11-2026"]]]]);
    expect(d.added[0][0]).toBe("items");
    expect(d.added[0][1]).toMatchObject({ name: "r2", idx: 2, doctype: "Purchase Order Item", parent: "PUR-ORD/25-26/02530", qty: 1 });
    const removed = versionDiff(after, snap())!;
    expect(removed.removed[0][1]).toMatchObject({ name: "r2" });
  });
});

const INR = { code: "INR", smallestFraction: 0, fraction: "Paisa", numberFormat: "#,###.###" };
const masters: EngineMasters = {
  currencies: { INR },
  companyCurrency: "INR",
  itemTaxTemplates: { "GST 18%": { rates: { "Input Tax IGST - X": 18, "Input Tax CGST - X": 9, "Input Tax SGST - X": 9 }, gstTreatment: "Taxable" } },
  gstAccountTypes: { "Input Tax IGST - X": "igst", "Input Tax CGST - X": "cgst", "Input Tax SGST - X": "sgst", "Input Tax IGST RCM - X": "igst_rcm" },
};

function values(taxes: OrderFormValues["taxes"], over: Partial<OrderFormValues> = {}): OrderFormValues {
  return {
    supplier: "S", transactionDate: "2026-11-18", scheduleDate: null, company: "C", shipmentType: null, modeOfTransport: null,
    purposeOfPurchase: null, currency: "INR", conversionRate: 1, items: [{ ...emptyItemRow("2026-11-25"), itemCode: "I", itemName: "I", qty: 2, uom: "Nos", rate: 100, itemTaxTemplate: "GST 18%" }],
    taxes, ...over,
  };
}
const row = (accountHead: string, rate: number, over: Partial<ReturnType<typeof emptyTaxRow>> = {}) => ({ ...emptyTaxRow(), accountHead, rate, ...over });
const parse = (v: OrderFormValues) => orderFormSchema.parse(v);
const ctx = (over: Partial<GstContext> = {}): GstContext => ({
  companyGstin: "33AAAAA0000A1Z5", companyIsIndianRegistered: true, billingAddress: "Billing", billingAddressGstCategory: "Registered Regular",
  supplierAddress: "Supplier", supplierGstin: "24PQRST5678K1Z2", supplierStateNumber: "24", gstCategory: "Registered Regular",
  placeOfSupply: "33-Tamil Nadu", isReverseCharge: false, ...over,
});
function issue(v: OrderFormValues, c: GstContext) {
  const d = parse(v);
  return gstIssue(d, calculatePurchaseOrder(engineInput(d, masters)), c);
}

describe("India Compliance GST checks on save", () => {
  it("accepts IGST on an inter-state purchase", () => {
    expect(issue(values([row("Input Tax IGST - X", 18)]), ctx())).toBeNull();
  });

  it("refuses CGST/SGST on an inter-state purchase and IGST on an intra-state one", () => {
    expect(issue(values([row("Input Tax CGST - X", 9), row("Input Tax SGST - X", 9)]), ctx())?.message).toBe("Row #1: Cannot charge CGST/SGST for inter-state supplies");
    const intra = ctx({ supplierGstin: "33ABCDE1234F1Z5", supplierStateNumber: "33" });
    expect(issue(values([row("Input Tax IGST - X", 18)]), intra)?.message).toBe("Row #1: Cannot charge IGST for intra-state supplies");
    expect(issue(values([row("Input Tax CGST - X", 9)]), intra)?.message).toBe("Cannot use only one of CGST or SGST account for intra-state supplies");
    expect(issue(values([row("Input Tax CGST - X", 9), row("Input Tax SGST - X", 9)]), intra)).toBeNull();
  });

  it("refuses GST from a supplier without GSTIN, from the company's own GSTIN, and RCM accounts without reverse charge", () => {
    expect(issue(values([row("Input Tax IGST - X", 18)]), ctx({ supplierGstin: null, gstCategory: "Unregistered", supplierStateNumber: "24" }))?.message).toBe(
      "Cannot charge GST in Row #1 since purchase is from a Supplier without GSTIN",
    );
    expect(issue(values([row("Input Tax IGST - X", 18)]), ctx({ supplierGstin: "33AAAAA0000A1Z5" }))?.message).toBe(
      "Cannot charge GST in Row #1 since Company GSTIN and Party GSTIN are same",
    );
    expect(issue(values([row("Input Tax IGST RCM - X", 18)]), ctx())?.message).toBe("Cannot use Reverse Charge Account in Row #1 since transaction is without Reverse Charge");
  });

  it("checks the GST Category against the GSTIN", () => {
    expect(issue(values([]), ctx({ gstCategory: "Unregistered" }))?.message).toBe("GST Category cannot be Unregistered for party with GSTIN");
    expect(issue(values([]), ctx({ supplierGstin: null, gstCategory: "Registered Regular" }))?.message).toBe("GST Category should be one of Unregistered or Overseas");
  });

  it("needs the company billing address and a valid Place of Supply", () => {
    expect(issue(values([]), ctx({ billingAddress: null }))?.message).toBe("Please set Company Billing Address to ensure Company GSTIN is fetched in the transaction.");
    expect(issue(values([]), ctx({ placeOfSupply: "99-Nowhere" }))?.message).toBe('"99-Nowhere" is not a valid Place of Supply. Please choose from available options.');
  });

  it("finds the Place of Supply from the company GSTIN", () => {
    expect(derivePlaceOfSupply("33AAAAA0000A1Z5", null)).toBe("33-Tamil Nadu");
    expect(derivePlaceOfSupply(null, "24PQRST5678K1Z2")).toBe("24-Gujarat");
    expect(derivePlaceOfSupply(null, null)).toBeNull();
  });
});

describe("form rows and schema", () => {
  it("prices a row from its price list rate, margin and discount (apply_pricing_rule_on_item)", () => {
    expect(pricedRate({ priceListRate: 1000, marginType: null, marginRateOrAmount: 0, discountPercentage: 10, discountAmount: 0 })).toEqual({ rate: 900, discountAmount: 100, discountPercentage: 10 });
    expect(pricedRate({ priceListRate: 1000, marginType: "Percentage", marginRateOrAmount: 5, discountPercentage: 0, discountAmount: 50 })).toEqual({ rate: 1000, discountAmount: 50, discountPercentage: (100 * 50) / 1050 });
  });

  it("drops rows left empty, as Frappe did before a save", () => {
    const v = values([emptyTaxRow()], { items: [emptyItemRow(), { ...emptyItemRow("2026-11-25"), itemCode: "I" }] });
    const out = dropEmptyRows({ ...v, items: v.items, taxes: v.taxes ?? [] });
    expect(out.items).toHaveLength(1);
    expect(out.taxes).toHaveLength(0);
  });

  it("refuses a retired option of a Select field with Frappe's message", () => {
    const r = orderFormSchema.safeParse(values([], { modeOfTransport: "Air / Ship" as never }));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsOf(r.error).modeOfTransport).toBe('Mode Of Transport cannot be "Air / Ship". It should be one of "", "Road", "Air", "Rail", "Ship"');
  });

  it("numbers POs in the series and amendments after the cancelled PO", () => {
    expect(seriesNumber("PUR-ORD/25-26/", 2530)).toBe("PUR-ORD/25-26/02530");
    expect(amendedNumber("PUR-ORD/25-26/02530", false)).toBe("PUR-ORD/25-26/02530-1");
    expect(amendedNumber("PUR-ORD/25-26/02530-1", true)).toBe("PUR-ORD/25-26/02530-2");
  });
});
