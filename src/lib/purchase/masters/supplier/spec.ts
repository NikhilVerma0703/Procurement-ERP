// The Supplier screen's layout: ERPNext 14's Supplier form (buying/doctype/supplier/supplier.json)
// with India Compliance's Tax Details, in their field order and labels. Pure, client-safe.
//
// Left out, as nothing on the old site used them (counts over its 625 suppliers, 18-11-2026):
//   Series (hidden there too: Buying Settings named suppliers by Supplier Name), Image, Default
//   Company Bank Account (0), Internal Supplier section (0), More Information (Supplier Details 0,
//   Website 0, Print Language always "en"), GST Transporter ID (0, and no supplier is a
//   transporter), Reverse Charge Applicable (0), the Accounting tab (Party Accounts; no
//   accounting here), and the Settings tab's two purchase-invoice checks (no invoices here).
// The Dashboard tab shows the supplier's Purchase Orders (the one connection this module has).
import { GST_CATEGORIES, guessGstCategory, INDIAN_STATES, PAN_NUMBER } from "../../gstin";
import type { MasterSpec, Values } from "../spec";

export const SUPPLIER_TYPES = ["Company", "Individual", "Partnership"] as const;
export const HOLD_TYPES = ["", "All", "Invoices", "Payments"] as const;

export const supplierSpec: MasterSpec = {
  doctype: "Supplier",
  fields: {
    supplier_name: { label: "Supplier Name", kind: "data", required: true, bold: true },
    country: { label: "Country", kind: "link", link: "country" },
    supplier_group: { label: "Supplier Group", kind: "link", link: "supplierGroup", required: true },
    supplier_type: { label: "Supplier Type", kind: "select", options: SUPPLIER_TYPES, required: true },
    is_transporter: { label: "Is Transporter", kind: "check" },

    default_currency: { label: "Billing Currency", kind: "link", link: "currency" },
    default_price_list: { label: "Price List", kind: "link", link: "priceList" },
    payment_terms: { label: "Default Payment Terms Template", kind: "link", link: "paymentTermsTemplate" },

    tax_id: { label: "Tax ID", kind: "data" },
    tax_category: { label: "Tax Category", kind: "link", link: "taxCategory" },
    tax_withholding_category: { label: "Tax Withholding Category", kind: "link", link: "taxWithholdingCategory" },
    gstin: { label: "GSTIN / UIN", kind: "data" },
    pan: { label: "PAN", kind: "data" },
    gst_category: { label: "GST Category", kind: "select", options: GST_CATEGORIES, required: true },

    // supplier.js: the primary contact and address are the supplier's own (set_query on doc.name).
    supplier_primary_contact: { label: "Supplier Primary Contact", kind: "link", link: "supplierContact", linkParams: (v) => ({ supplier: typeof v._name === "string" ? v._name : "" }) },
    mobile_no: { label: "Mobile No", kind: "readonly" },
    email_id: { label: "Email Id", kind: "readonly" },
    supplier_primary_address: { label: "Supplier Primary Address", kind: "link", link: "supplierAddress", linkParams: (v) => ({ supplier: typeof v._name === "string" ? v._name : "" }) },
    primary_address: { label: "Primary Address", kind: "readonly" },

    is_frozen: { label: "Is Frozen", kind: "check" },
    disabled: { label: "Disabled", kind: "check", bold: true },
    on_hold: { label: "Block Supplier", kind: "check" },
    hold_type: { label: "Hold Type", kind: "select", options: HOLD_TYPES, showIf: (v) => v.on_hold === true },
    release_date: { label: "Release Date", kind: "date", showIf: (v) => v.on_hold === true },
  },
  tabs: [
    {
      label: "Details",
      sections: [
        { columns: [["supplier_name", "country"], ["supplier_group", "supplier_type", "is_transporter"]] },
        { label: "Defaults", columns: [["default_currency"], ["default_price_list", "payment_terms"]] },
      ],
    },
    { label: "Dashboard", showIf: (_v, isNew) => !isNew, sections: [{ slot: "dashboard", columns: [] }] },
    {
      label: "Tax",
      sections: [
        { columns: [["tax_id"], ["tax_category", "tax_withholding_category"]] },
        { label: "Tax Details", columns: [["gstin", "pan"], ["gst_category"]] },
      ],
    },
    {
      label: "Address & Contact",
      sections: [
        { label: "Address and Contacts", showIf: (_v, isNew) => !isNew, slot: "addresses", columns: [] },
        { label: "Primary Address and Contact", columns: [["supplier_primary_contact", "mobile_no", "email_id"], ["supplier_primary_address", "primary_address"]] },
      ],
    },
    {
      label: "Settings",
      sections: [
        { columns: [["is_frozen", "disabled"]] },
        { label: "Block Supplier", columns: [["on_hold", "hold_type"], ["release_date"]] },
      ],
    },
  ],
};

/** A new supplier's values (the doctype's defaults; India Compliance's default GST Category). */
export function newSupplierValues(): Record<string, string | boolean | null> {
  return {
    supplier_name: null, country: null, supplier_group: null, supplier_type: "Company", is_transporter: false,
    default_currency: null, default_price_list: null, payment_terms: null,
    tax_id: null, tax_category: null, tax_withholding_category: null, gstin: null, pan: null, gst_category: "Unregistered",
    supplier_primary_contact: null, mobile_no: null, email_id: null, supplier_primary_address: null, primary_address: null,
    is_frozen: false, disabled: false, on_hold: false, hold_type: null, release_date: null,
  };
}

/**
 * The indicator in the list and on the form: On Hold in red (supplier_list.js), else Frappe's
 * own for a doctype with a Disabled field — Disabled in grey, Enabled in blue.
 */
export const supplierIndicator = (s: { onHold: boolean; disabled: boolean }) =>
  s.onHold
    ? ({ label: "On Hold", colour: "red" } as const)
    : s.disabled
      ? ({ label: "Disabled", colour: "gray" } as const)
      : ({ label: "Enabled", colour: "blue" } as const);

/**
 * "Add Supplier" on the old list opened India Compliance's quick entry (PartyQuickEntryForm), and
 * nearly every supplier was made there: 545 of the 561 with a primary address got it in the same
 * second as the supplier. Its fields, in its order: GSTIN, the supplier's mandatory fields, then
 * Primary Contact Details and Primary Address Details, which become the supplier's primary
 * contact and address. Its Country is the supplier's own Country field as well as the address's.
 */
export const supplierQuickSpec: MasterSpec = {
  doctype: "Supplier",
  fields: {
    gstin: supplierSpec.fields.gstin,
    supplier_name: supplierSpec.fields.supplier_name,
    supplier_group: supplierSpec.fields.supplier_group,
    supplier_type: supplierSpec.fields.supplier_type,
    gst_category: supplierSpec.fields.gst_category,
    qe_email_id: { label: "Email ID", kind: "data", format: "Email" },
    qe_mobile_no: { label: "Mobile Number", kind: "data", format: "Phone" },
    qe_is_primary_address: { label: "Preferred Billing Address", kind: "check" },
    qe_pincode: { label: "Postal Code", kind: "data" },
    qe_address_line1: { label: "Address Line 1", kind: "data" },
    qe_address_line2: { label: "Address Line 2", kind: "data" },
    qe_is_shipping_address: { label: "Preferred Shipping Address", kind: "check" },
    qe_city: { label: "City/Town", kind: "data" },
    qe_state: { label: "State/Province", kind: "autocomplete", suggestions: (v) => (v.country === "India" ? INDIAN_STATES : []) },
    country: supplierSpec.fields.country,
  },
  tabs: [
    {
      label: "Details",
      sections: [
        { columns: [["gstin", "supplier_name", "supplier_group", "supplier_type", "gst_category"]] },
        { label: "Primary Contact Details", columns: [["qe_email_id"], ["qe_mobile_no"]] },
        {
          label: "Primary Address Details",
          columns: [
            ["qe_is_primary_address", "qe_pincode", "qe_address_line1", "qe_address_line2"],
            ["qe_is_shipping_address", "qe_city", "qe_state", "country"],
          ],
        },
      ],
    },
  ],
};

/** The quick entry's values: the doctype's defaults, Country the site default (India). */
export function newSupplierQuickValues(): Record<string, string | boolean | null> {
  return {
    gstin: null, supplier_name: null, supplier_group: null, supplier_type: "Company", gst_category: "Unregistered",
    qe_email_id: null, qe_mobile_no: null, qe_is_primary_address: false, qe_pincode: null, qe_address_line1: null,
    qe_address_line2: null, qe_is_shipping_address: false, qe_city: null, qe_state: null, country: "India",
  };
}

/** The 6th character of a GSTIN (the PAN's 4th) tells a firm from a company (quick_entry.js). */
const PARTY_TYPE_BY_PAN: Record<string, string> = { F: "Partnership", C: "Company" };

/**
 * GSTIN typed in full → what India Compliance's form set from it: GST Category guessed from its
 * format (and Country), PAN taken from it, and in the quick entry the Supplier Type.
 */
export function supplierGstinPatch(v: Values, quick: boolean): Partial<Values> | null {
  const gstin = typeof v.gstin === "string" ? v.gstin.trim().toUpperCase() : "";
  if (gstin.length !== 15) return null;
  const patch: Partial<Values> = {
    gst_category: guessGstCategory(gstin, typeof v.country === "string" ? v.country : null, typeof v.gst_category === "string" ? v.gst_category : null),
  };
  if (!quick) {
    const pan = gstin.slice(2, 12);
    if (PAN_NUMBER.test(pan)) patch.pan = pan;
  } else {
    patch.supplier_type = PARTY_TYPE_BY_PAN[gstin[5]] ?? "Individual";
  }
  return patch;
}

/** "Edit Full Form": the quick entry's values the full form has, as query parameters. */
export function supplierPrefillParams(v: Values): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["gstin", "supplier_name", "supplier_group", "supplier_type", "gst_category", "country"]) {
    if (typeof v[k] === "string" && v[k]) out[k] = v[k] as string;
  }
  return out;
}

/** The full form's new values, with what "Edit Full Form" carried over. */
export function supplierPrefill(params: Record<string, string | string[] | undefined>): Record<string, string | boolean | null> {
  const v = newSupplierValues();
  for (const k of ["gstin", "supplier_name", "supplier_group", "supplier_type", "gst_category", "country"]) {
    const x = params[k];
    const s = (Array.isArray(x) ? x[0] : x)?.trim().slice(0, 140);
    if (s) v[k] = s;
  }
  return v;
}
