// The Address screen's layout: Frappe 14's Address form (contacts/doctype/address/address.json)
// with ERPNext's Tax Category and Is Your Company Address and India Compliance's Tax Details, in
// their order and labels. Pure, client-safe.
//
// All its fields are kept: the old site's 1,225 addresses used every one but Disabled.
import { GST_CATEGORIES, INDIAN_STATES } from "../../gstin";
import { linksTable } from "../party-links";
import type { MasterSpec, Values } from "../spec";

export const ADDRESS_TYPES = ["Billing", "Shipping", "Office", "Personal", "Plant", "Postal", "Shop", "Subsidiary", "Warehouse", "Current", "Permanent", "Other"] as const;

export const addressSpec: MasterSpec = {
  doctype: "Address",
  fields: {
    address_title: { label: "Address Title", kind: "data" },
    address_type: { label: "Address Type", kind: "select", options: ADDRESS_TYPES, required: true },
    address_line1: { label: "Address Line 1", kind: "data", required: true },
    address_line2: { label: "Address Line 2", kind: "data" },
    city: { label: "City/Town", kind: "data", required: true },
    county: { label: "County", kind: "data" },
    // India Compliance offers India's states for an Indian address (set_state_options).
    state: { label: "State/Province", kind: "autocomplete", suggestions: (v) => (v.country === "India" ? INDIAN_STATES : []) },
    country: { label: "Country", kind: "link", link: "country", required: true },
    pincode: { label: "Postal Code", kind: "data" },
    email_id: { label: "Email Address", kind: "data", format: "Email" },
    phone: { label: "Phone", kind: "data" },
    fax: { label: "Fax", kind: "data" },
    tax_category: { label: "Tax Category", kind: "link", link: "taxCategory" },
    is_primary_address: { label: "Preferred Billing Address", kind: "check" },
    is_shipping_address: { label: "Preferred Shipping Address", kind: "check" },
    disabled: { label: "Disabled", kind: "check" },
    gstin: { label: "GSTIN / UIN", kind: "data" },
    gst_state: { label: "GST State", kind: "readonly" },
    gst_category: { label: "GST Category", kind: "select", options: GST_CATEGORIES, required: true },
    gst_state_number: { label: "GST State Number", kind: "readonly" },
    is_your_company_address: { label: "Is Your Company Address", kind: "check" },
  },
  tables: { links: linksTable },
  tabs: [
    {
      label: "Details",
      sections: [
        {
          columns: [
            ["address_title", "address_type", "address_line1", "address_line2", "city", "county", "state", "country", "pincode"],
            ["email_id", "phone", "fax", "tax_category", "is_primary_address", "is_shipping_address", "disabled"],
          ],
        },
        { label: "Tax Details", columns: [["gstin", "gst_state"], ["gst_category", "gst_state_number"]] },
        { label: "Reference", columns: [["is_your_company_address", "links"]] },
      ],
    },
  ],
};

/**
 * A new address's values: Address Type's first option (Frappe's default for a Select), India
 * (the site's country), India Compliance's default GST Category, and the party it was made from.
 */
export function newAddressValues(link?: { doctype: string; name: string } | null): Values {
  return {
    address_title: null, address_type: "Billing", address_line1: null, address_line2: null, city: null, county: null, state: null,
    country: "India", pincode: null, email_id: null, phone: null, fax: null, tax_category: null, is_primary_address: false,
    is_shipping_address: false, disabled: false, gstin: null, gst_state: null, gst_category: "Unregistered", gst_state_number: null,
    is_your_company_address: false,
    links: link ? [{ _key: "new-link", link_doctype: link.doctype, link_name: link.name, link_title: null }] : [],
  };
}

/** The list's indicator: Frappe's for a doctype with a Disabled field. */
export const addressIndicator = (a: { disabled: boolean }) => (a.disabled ? ({ label: "Disabled", colour: "gray" } as const) : ({ label: "Enabled", colour: "blue" } as const));
