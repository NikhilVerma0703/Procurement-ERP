import { describe, expect, it } from "vitest";
import { canParse, dependsOn } from "@/lib/purchase/doc/depends-on";
import { structure } from "@/lib/purchase/doc/layout";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import { transactionLabels } from "@/lib/purchase/doc/transaction";
import { typedDoc } from "@/lib/purchase/doc/values";
import { gridColumns, visibleForm } from "@/lib/purchase/doc/visible";
import { receiptIndicator } from "@/lib/purchase/stock/receipt-status";

// Phase II (owner, 21-11-2026): the Stock forms are drawn from the old site's own form definitions
// (captured 21-11-2026), with Frappe's read-only rules. The receipt below is made up.

describe("the forms' show/hide conditions", () => {
  it("understands every condition the captured forms use", () => {
    const all = new Set<string>();
    for (const l of Object.values(LAYOUTS)) for (const f of l.fields) for (const e of [f.dependsOn, f.collapsibleDependsOn]) if (e) all.add(e);
    expect(all.size).toBeGreaterThan(150);
    expect([...all].filter((e) => !canParse(e))).toEqual([]);
  });

  it("evaluates them as Frappe did, against the document and a row's parent", () => {
    const doc = { is_return: 0, purpose: "Material Issue", items: [{ item_code: "" }], supplier: "Acme", docstatus: 1 };
    expect(dependsOn("eval:doc.is_return", { doc })).toBe(false);
    expect(dependsOn("eval:!doc.is_return", { doc })).toBe(true);
    expect(dependsOn("eval:['Material Transfer', 'Material Issue'].includes(doc.purpose)", { doc })).toBe(true);
    expect(dependsOn("eval:in_list(['Receipt'], doc.purpose)", { doc })).toBe(false);
    expect(dependsOn("eval:doc.items.length==1 && !doc.items[0].item_code", { doc })).toBe(true);
    expect(dependsOn("eval:parent.doctype == 'Purchase Order'", { doc, parent: { doctype: "Purchase Order" } })).toBe(true);
    expect(dependsOn("eval:doc.docstatus===1;", { doc })).toBe(true);
    expect(dependsOn("supplier", { doc })).toBe(true);
    expect(dependsOn("customer", { doc })).toBe(false);
    expect(dependsOn("eval:this is not javascript (", { doc })).toBe(true); // unparseable: shown
  });
});

describe("the Purchase Receipt's form, as the old site laid it out", () => {
  const layout = LAYOUTS["Purchase Receipt"];

  it("has the old tabs, in order", () => {
    expect(structure(layout).map((t) => t.label)).toEqual(["Details", "Address & Contact", "Terms", "More Info", "Connections"]);
  });

  it("shows the item grid's columns the old grid showed (Frappe's width budget)", () => {
    expect(gridColumns(LAYOUTS["Purchase Receipt Item"].fields).map((f) => f.fieldname)).toEqual(["item_code", "qty", "rejected_qty", "rate", "amount"]);
  });

  it("draws a saved receipt as the old read-only form did", () => {
    const raw = {
      name: "PR-TEST-1", naming_series: "PR-.YY.-", supplier: "Acme Supplies", supplier_name: "Acme Supplies", posting_date: "2026-01-05",
      posting_time: "10:00:00", company: "Test Co", currency: "INR", is_return: "0", apply_putaway_rule: "0", total_qty: "5",
      total: "500", net_total: "500", grand_total: "590", discount_amount: "0", docstatus: "1", supplier_delivery_note: "",
    };
    const doc = { ...typedDoc(layout, raw), items: [], taxes: [] };
    const tabs = visibleForm(layout, doc, transactionLabels(doc, "INR"), LAYOUTS);
    const details = tabs[0].sections.flatMap((s) => s.columns.flat().map((f) => f.label));
    expect(details).toContain("Supplier");
    expect(details).toContain("Is Return"); // a checkbox shows even unticked
    expect(details).not.toContain("Series"); // hidden once saved (naming series)
    expect(details).not.toContain("Supplier Name"); // equal to the supplier (buying.js)
    expect(details).not.toContain("Supplier Delivery Note"); // empty on a read-only form
    expect(details).not.toContain("Net Total (INR)"); // no discount, no inclusive tax
    expect(details).toContain("Grand Total (INR)");
    expect(tabs[0].sections.find((s) => s.label === "Currency and Price List")?.open).toBe(false);
  });
});

describe("a receipt's status pill", () => {
  const base = { docStatus: "SUBMITTED" as const, status: "To Bill", isReturn: false, grandTotal: 590, perBilled: 0, perReturned: 0 };
  it("follows the old list's rules, in order", () => {
    expect(receiptIndicator({ ...base, docStatus: "DRAFT" })).toEqual({ label: "Draft", colour: "red" });
    expect(receiptIndicator({ ...base, docStatus: "CANCELLED" })).toEqual({ label: "Cancelled", colour: "red" });
    expect(receiptIndicator({ ...base, isReturn: true })).toEqual({ label: "Return", colour: "gray" });
    expect(receiptIndicator({ ...base, status: "Closed" })).toEqual({ label: "Closed", colour: "green" });
    expect(receiptIndicator({ ...base, perReturned: 100 })).toEqual({ label: "Return Issued", colour: "gray" });
    expect(receiptIndicator(base)).toEqual({ label: "To Bill", colour: "orange" });
    expect(receiptIndicator({ ...base, perBilled: 40 })).toEqual({ label: "Partly Billed", colour: "yellow" });
    expect(receiptIndicator({ ...base, perBilled: 100 })).toEqual({ label: "Completed", colour: "green" });
    expect(receiptIndicator({ ...base, grandTotal: 0 })).toEqual({ label: "Completed", colour: "green" });
  });
});
