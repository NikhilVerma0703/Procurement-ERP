// Step 8: the masters screens — the rules that need no database: India
// Compliance's GSTIN, PAN, GST Category, state and postal-code checks; the
// checks every master save makes on its form (selects, lengths, emails,
// phones, dates, mandatory fields, new names); the quick entry's GSTIN
// trigger; the indicators; variant names; and the list and prefill
// parameters. All data is made up.
import { describe, expect, it } from "vitest";
import { addressGst, checkGstin, gstinCheckDigitOk, guessGstCategory, partyGst } from "@/lib/purchase/gstin";
import { isCountry } from "@/lib/purchase/countries";
import { itemIndicator, variantNames } from "@/lib/purchase/masters/item/spec";
import { partyPrefill } from "@/lib/purchase/masters/prefill";
import { missingFields, type MasterSpec } from "@/lib/purchase/masters/spec";
import { supplierGstinPatch, supplierIndicator, supplierPrefill, supplierPrefillParams } from "@/lib/purchase/masters/supplier/spec";
import { checkNewName, cleanValues, mandatoryErrors, parseFullName } from "@/lib/purchase/masters/values";
import { purchaseCan } from "@/lib/purchase/access";
import { masterNewPath, masterPath, PURCHASE_NAV, PURCHASE_PATHS } from "@/lib/purchase/routes";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** A made-up GSTIN: the first 14 characters and the check digit that makes it valid. */
const gstin = (first14: string) => first14 + [...CHARS].find((c) => gstinCheckDigitOk(first14 + c))!;

describe("GSTIN and party GST (India Compliance)", () => {
  const tn = gstin("33ZZZPQ9876C1Z");

  it("checks the length and the check digit", () => {
    expect(checkGstin(tn)).toEqual({ gstin: tn });
    expect(checkGstin(` ${tn.toLowerCase()} `)).toEqual({ gstin: tn });
    expect(checkGstin("33ZZZPQ9876C1Z")).toEqual({ problem: "GSTIN 33ZZZPQ9876C1Z must have 15 characters" });
    const wrong = tn.slice(0, 14) + (tn.endsWith("A") ? "B" : "A");
    expect(checkGstin(wrong)).toHaveProperty("problem");
  });

  it("guesses the GST Category from the GSTIN, else from the country", () => {
    expect(guessGstCategory(tn, "India", "Unregistered")).toBe("Registered Regular");
    expect(guessGstCategory(tn, "India", "SEZ")).toBe("SEZ");
    expect(guessGstCategory("", "Italy", null)).toBe("Overseas");
    expect(guessGstCategory("", "India", "Registered Regular")).toBe("Unregistered");
  });

  it("takes the PAN from the GSTIN and refuses a bad PAN typed alone", () => {
    expect(partyGst({ gstin: tn, gstCategory: "Unregistered", pan: null, country: "India" })).toEqual({ gstin: tn, gstCategory: "Registered Regular", pan: "ZZZPQ9876C", problems: [] });
    expect(partyGst({ gstin: null, gstCategory: "Unregistered", pan: "abcde1234f", country: "India" }).pan).toBe("ABCDE1234F");
    expect(partyGst({ gstin: null, gstCategory: "Unregistered", pan: "NOTAPAN", country: "India" }).problems).toEqual([{ field: "pan", message: "Invalid PAN format" }]);
    expect(partyGst({ gstin: null, gstCategory: "Registered Regular", pan: null, country: "India" }).gstCategory).toBe("Unregistered");
  });

  it("checks an Indian address's state, its number in the GSTIN, and the postal code", () => {
    const ok = addressGst({ gstin: tn, gstCategory: "Registered Regular", country: "India", state: "Tamil Nadu", pincode: "600001" });
    expect(ok).toMatchObject({ gstState: "Tamil Nadu", gstStateNumber: "33", problems: [] });
    expect(addressGst({ gstin: null, gstCategory: "Unregistered", country: "India", state: null, pincode: null }).problems).toEqual([{ field: "state", message: "State is a required field for Indian Address" }]);
    expect(addressGst({ gstin: tn, gstCategory: "Registered Regular", country: "India", state: "Karnataka", pincode: null }).problems[0]).toEqual({ field: "gstin", message: "First 2 digits of GSTIN should match with State Number for Karnataka (29)" });
    expect(addressGst({ gstin: null, gstCategory: "Unregistered", country: "India", state: "Karnataka", pincode: "635002" }).problems[0].message).toMatch(/^Postal Code 635002 is not associated with Karnataka/);
    expect(addressGst({ gstin: null, gstCategory: "Unregistered", country: "India", state: "Karnataka", pincode: "05600" }).problems[0].message).toBe("Postal Code must be a 6-digit number and cannot start with 0");
    expect(addressGst({ gstin: null, gstCategory: "Unregistered", country: "Italy", state: null, pincode: null }).gstCategory).toBe("Overseas");
  });

  it("knows the old site's country names", () => {
    expect(isCountry("India")).toBe(true);
    expect(isCountry("Palestinian Territory, Occupied")).toBe(true);
    expect(isCountry("Atlantis")).toBe(false);
  });
});

const spec: MasterSpec = {
  doctype: "Thing",
  fields: {
    name: { label: "Name", kind: "data", required: true },
    kind: { label: "Kind", kind: "select", options: ["", "A", "B"] },
    hidden: { label: "Hidden", kind: "data", required: true, showIf: (v) => v.kind === "B" },
    email: { label: "Email", kind: "data", format: "Email" },
    phone: { label: "Phone", kind: "data", format: "Phone" },
    when: { label: "When", kind: "date" },
    qty: { label: "Qty", kind: "float" },
    on: { label: "On", kind: "check" },
  },
  tables: { rows: { label: "Rows", columns: [{ name: "uom", label: "UOM", kind: "data", required: true }], newRow: () => ({ uom: null }) } },
  tabs: [{ label: "Details", sections: [{ columns: [["name", "kind", "hidden", "email", "phone", "when", "qty", "on", "rows"]] }] }],
};

describe("a master form's values, checked as Frappe checked any save", () => {
  it("keeps only the layout's fields, trimmed and typed", () => {
    const c = cleanValues(spec, { name: "  Widget  ", qty: "1,250.5", on: 1, junk: "x", rows: [{ _key: "a", uom: " Nos ", extra: 1 }] });
    expect("values" in c && c.values).toMatchObject({ name: "Widget", qty: 1250.5, on: true, rows: [{ _key: "a", uom: "Nos" }] });
    expect("values" in c && "junk" in c.values).toBe(false);
  });

  it("refuses a select outside its options, a long Data field, a bad email, phone or date", () => {
    const c = cleanValues(spec, { name: "x".repeat(141), kind: "C", email: "nobody@", phone: "call me", when: "2026-02-30" });
    expect("errors" in c && c.errors).toEqual({
      name: "Name will get truncated, as max characters allowed is 140",
      kind: 'Kind cannot be "C". It should be one of "A", "B"',
      email: "nobody@ is not a valid Email Address",
      phone: "call me is not a valid Phone Number",
      when: "When: 2026-02-30 is not a valid date",
    });
  });

  it("lists the mandatory fields left empty, hidden ones not counted, rows by number", () => {
    const v = { name: "", kind: "A", hidden: null, rows: [{ _key: "a", uom: "" }] };
    expect(missingFields(spec, v, true).map((m) => m.label)).toEqual(["Name", "Row #1: UOM (Rows)"]);
    expect(mandatoryErrors(spec, v, true)).toEqual({
      errors: { name: "Name is required", "rows.0.uom": "UOM is required" },
      message: "Mandatory fields required in Thing: Name, Row #1: UOM (Rows)",
    });
    expect(missingFields(spec, { ...v, kind: "B" }, true).map((m) => m.label)).toContain("Hidden");
  });

  it("checks a new record's name as Frappe's validate_name did", () => {
    expect(checkNewName("Supplier", "  Acme Traders ")).toEqual({ name: "Acme Traders" });
    expect(checkNewName("Supplier", "Supplier")).toEqual({ problem: "Name of Supplier cannot be Supplier" });
    expect(checkNewName("Supplier", "A <b>")).toEqual({ problem: "Name cannot contain special characters like '<', '>'" });
    expect(checkNewName("Supplier", " ")).toEqual({ problem: "No Name Specified for Supplier" });
  });

  it("splits a person's name as ERPNext's make_contact did", () => {
    expect(parseFullName("Asha  Rani Devi Rao")).toEqual({ first: "Asha", middle: "Rani Devi", last: "Rao" });
    expect(parseFullName("Asha Rao")).toEqual({ first: "Asha", middle: null, last: "Rao" });
    expect(parseFullName("Asha")).toEqual({ first: "Asha", middle: null, last: null });
  });
});

describe("the Supplier screen", () => {
  // The PAN's 4th character (the GSTIN's 6th) is the holder: F a firm, C a company, P a person.
  const firm = gstin("33ZZZFA9876C1Z");
  const company = gstin("33ZZZCA9876C1Z");
  const person = gstin("33ZZZPA9876C1Z");

  it("sets the Supplier Type from a GSTIN in the quick entry, the PAN in the full form", () => {
    expect(supplierGstinPatch({ gstin: firm, country: "India", gst_category: "Unregistered" }, true)).toEqual({ gst_category: "Registered Regular", supplier_type: "Partnership" });
    expect(supplierGstinPatch({ gstin: company, country: "India", gst_category: null }, true)).toMatchObject({ supplier_type: "Company" });
    expect(supplierGstinPatch({ gstin: person, country: "India", gst_category: null }, true)).toMatchObject({ supplier_type: "Individual" });
    expect(supplierGstinPatch({ gstin: person, country: "India", gst_category: null }, false)).toEqual({ gst_category: "Registered Regular", pan: "ZZZPA9876C" });
    expect(supplierGstinPatch({ gstin: "33ZZZ", country: "India" }, true)).toBeNull();
  });

  it("shows On Hold, Disabled or Enabled", () => {
    expect(supplierIndicator({ onHold: true, disabled: true })).toEqual({ label: "On Hold", colour: "red" });
    expect(supplierIndicator({ onHold: false, disabled: true })).toEqual({ label: "Disabled", colour: "gray" });
    expect(supplierIndicator({ onHold: false, disabled: false })).toEqual({ label: "Enabled", colour: "blue" });
  });

  it("carries the quick entry's fields to the full form (Edit Full Form)", () => {
    const params = supplierPrefillParams({ supplier_name: "Acme Traders", supplier_group: "Raw Material", qe_email_id: "a@example.com", country: "India" });
    expect(params).toEqual({ supplier_name: "Acme Traders", supplier_group: "Raw Material", country: "India" });
    expect(supplierPrefill(params)).toMatchObject({ supplier_name: "Acme Traders", supplier_type: "Company", gst_category: "Unregistered" });
  });
});

describe("the Item screen", () => {
  it("shows Disabled, Expired, Template, Variant, else Enabled (item_list.js)", () => {
    const base = { disabled: false, endOfLife: "2099-12-31", hasVariants: false, variantOf: null };
    expect(itemIndicator({ ...base, disabled: true, hasVariants: true }, "2026-11-19").label).toBe("Disabled");
    expect(itemIndicator({ ...base, endOfLife: "2026-01-01", hasVariants: true }, "2026-11-19").label).toBe("Expired");
    expect(itemIndicator({ ...base, hasVariants: true }, "2026-11-19")).toEqual({ label: "Template", colour: "orange" });
    expect(itemIndicator({ ...base, variantOf: "T1" }, "2026-11-19")).toEqual({ label: "Variant", colour: "green" });
    expect(itemIndicator(base, "2026-11-19")).toEqual({ label: "Enabled", colour: "blue" });
  });

  it("names a variant from its template and the values' abbreviations", () => {
    expect(variantNames("TPL01", "MARBLE", ["Polish", "Super Jumbo", "30mm", "Premium"])).toEqual({ code: "TPL01-Polish-Super Jumbo-30mm-Premium", name: "MARBLE-Polish-Super Jumbo-30mm-Premium" });
    expect(variantNames("TPL01", "MARBLE", [])).toBeNull();
  });
});

describe("master links and access", () => {
  it("links a new address or contact to its party and returns only within the module", () => {
    expect(partyPrefill({ link_doctype: "Supplier", link_name: "Acme Traders", return: "/purchase/suppliers/abc" })).toEqual({ link: { doctype: "Supplier", name: "Acme Traders" }, returnTo: "/purchase/suppliers/abc" });
    expect(partyPrefill({ link_doctype: "User", link_name: "x", return: "//evil.example.com" })).toEqual({ link: null, returnTo: null });
    expect(partyPrefill({ return: "https://evil.example.com/purchase/" }).returnTo).toBeNull();
  });

  it("routes every master under /purchase, with a sidebar row each", () => {
    expect(masterPath("suppliers", "a b")).toBe("/purchase/suppliers/a%20b");
    expect(masterNewPath("addresses", { link_doctype: "Supplier" })).toBe("/purchase/addresses/new?link_doctype=Supplier");
    for (const p of [PURCHASE_PATHS.suppliers, PURCHASE_PATHS.items, PURCHASE_PATHS.addresses, PURCHASE_PATHS.contacts, PURCHASE_PATHS.taxTemplates, PURCHASE_PATHS.paymentTermsTemplates, PURCHASE_PATHS.paymentTerms, PURCHASE_PATHS.terms]) {
      expect(PURCHASE_NAV.some((n) => n.href === p)).toBe(true);
    }
  });

  it("lets the purchase team and admins edit masters, approvers only view them", () => {
    expect(purchaseCan({ role: "PURCHASE" }, "masters")).toBe(true);
    expect(purchaseCan({ role: "ADMIN" }, "masters")).toBe(true);
    expect(purchaseCan({ role: "APPROVER" }, "masters")).toBe(false);
    expect(purchaseCan({ role: "APPROVER" }, "view")).toBe(true);
  });
});
