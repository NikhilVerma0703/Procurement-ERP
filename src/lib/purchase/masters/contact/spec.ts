// The Contact screen's layout: Frappe 14's Contact form (contacts/doctype/contact/contact.json), in
// its order and labels. Pure, client-safe.
//
// Left out, as none of the old site's 375 contacts used them: Address (the contact's own address
// link), Sync with Google Contacts and its section, and More Information (Department,
// Unsubscribed). Salutation and Gender offer the old site's own lists (tabSalutation, tabGender).
import { linksTable } from "../party-links";
import type { MasterSpec, Values } from "../spec";

export const CONTACT_STATUSES = ["Passive", "Open", "Replied"] as const;
export const SALUTATIONS = ["", "Dr", "Madam", "Master", "Miss", "Mr", "Mrs", "Ms", "Mx", "Prof"] as const;
export const GENDERS = ["", "Female", "Genderqueer", "Male", "Non-Conforming", "Other", "Prefer not to say", "Transgender"] as const;

export const contactSpec: MasterSpec = {
  doctype: "Contact",
  fields: {
    first_name: { label: "First Name", kind: "data", required: true },
    middle_name: { label: "Middle Name", kind: "data" },
    last_name: { label: "Last Name", kind: "data", bold: true },
    email_id: { label: "Email Address", kind: "readonly", bold: true },
    user: { label: "User Id", kind: "link", link: "user" },
    status: { label: "Status", kind: "select", options: CONTACT_STATUSES },
    salutation: { label: "Salutation", kind: "select", options: SALUTATIONS },
    designation: { label: "Designation", kind: "data" },
    gender: { label: "Gender", kind: "select", options: GENDERS },
    phone: { label: "Phone", kind: "readonly", bold: true },
    mobile_no: { label: "Mobile No", kind: "readonly" },
    company_name: { label: "Company Name", kind: "data" },
    is_primary_contact: { label: "Is Primary Contact", kind: "check" },
  },
  tables: {
    email_ids: {
      label: "Email IDs",
      columns: [
        { name: "email_id", label: "Email ID", kind: "data", format: "Email", required: true },
        { name: "is_primary", label: "Is Primary", kind: "check", width: "w-24" },
      ],
      newRow: () => ({ email_id: null, is_primary: false }),
    },
    phone_nos: {
      label: "Contact Numbers",
      columns: [
        { name: "phone", label: "Number", kind: "data", format: "Phone", required: true },
        { name: "is_primary_phone", label: "Is Primary Phone", kind: "check", width: "w-32" },
        { name: "is_primary_mobile_no", label: "Is Primary Mobile", kind: "check", width: "w-32" },
      ],
      newRow: () => ({ phone: null, is_primary_phone: false, is_primary_mobile_no: false }),
    },
    links: linksTable,
  },
  tabs: [
    {
      label: "Details",
      sections: [
        {
          columns: [
            ["first_name", "middle_name", "last_name", "email_id", "user"],
            ["status", "salutation", "designation", "gender", "phone", "mobile_no", "company_name"],
          ],
        },
        { label: "Contact Details", columns: [["email_ids", "phone_nos"]] },
        { label: "Reference", columns: [["links", "is_primary_contact"]] },
      ],
    },
  ],
};

/** A new contact's values (Status Passive), linked to the party it was made from. */
export function newContactValues(link?: { doctype: string; name: string } | null): Values {
  return {
    first_name: null, middle_name: null, last_name: null, email_id: null, user: null, status: "Passive", salutation: null,
    designation: null, gender: null, phone: null, mobile_no: null, company_name: null, is_primary_contact: false,
    email_ids: [], phone_nos: [],
    links: link ? [{ _key: "new-link", link_doctype: link.doctype, link_name: link.name, link_title: null }] : [],
  };
}
