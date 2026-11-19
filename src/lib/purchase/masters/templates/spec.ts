// The layouts of the templates a PO fills itself from: Purchase Taxes and Charges Template,
// Payment Terms Template (and the Payment Term its rows pick), and Terms and Conditions, as
// ERPNext 14 drew them, in their order and labels. Pure, client-safe.
//
// Left out, as none of the old site's records used them: a payment term's Mode of Payment and its
// Discount Settings (0 of 206 terms, 0 of 221 template rows), a tax row's Cost Center and
// "Considered In Paid Amount" (payments are not kept here), and Terms and Conditions' help text.
import type { MasterSpec, Values } from "../spec";

export const CHARGE_TYPES = ["", "Actual", "On Net Total", "On Previous Row Amount", "On Previous Row Total", "On Item Quantity"] as const;
export const TAX_CATEGORIES = ["Valuation and Total", "Valuation", "Total"] as const;
export const ADD_DEDUCT = ["Add", "Deduct"] as const;
export const DUE_DATE_BASES = ["Day(s) after invoice date", "Day(s) after the end of the invoice month", "Month(s) after the end of the invoice month"] as const;

const previousRow = (v: Values) => v.charge_type === "On Previous Row Amount" || v.charge_type === "On Previous Row Total";

export const taxTemplateSpec: MasterSpec = {
  doctype: "Purchase Taxes and Charges Template",
  fields: {
    title: { label: "Title", kind: "data", required: true },
    is_default: { label: "Default", kind: "check" },
    disabled: { label: "Disabled", kind: "check" },
    company: { label: "Company", kind: "link", link: "company", required: true },
    tax_category: { label: "Tax Category", kind: "link", link: "taxCategory" },
  },
  tables: {
    taxes: {
      label: "Purchase Taxes and Charges",
      columns: [
        { name: "category", label: "Consider Tax or Charge for", kind: "select", options: TAX_CATEGORIES, required: true, width: "w-44" },
        { name: "add_deduct_tax", label: "Add or Deduct", kind: "select", options: ADD_DEDUCT, required: true, width: "w-28" },
        { name: "charge_type", label: "Type", kind: "select", options: CHARGE_TYPES, required: true, width: "w-48" },
        { name: "row_id", label: "Reference Row #", kind: "int", readOnly: (v) => !previousRow(v), width: "w-24" },
        { name: "account_head", label: "Account Head", kind: "link", link: "taxAccount", linkParams: (v) => ({ company: typeof v.company === "string" ? v.company : null }), required: true, width: "min-w-[220px]" },
        { name: "description", label: "Description", kind: "data", required: true, width: "min-w-[180px]" },
        { name: "rate", label: "Tax Rate", kind: "float", readOnly: (v) => v.charge_type === "Actual", width: "w-24" },
        { name: "tax_amount", label: "Amount", kind: "currency", readOnly: (v) => v.charge_type !== "Actual", width: "w-32" },
        { name: "included_in_print_rate", label: "Is this Tax included in Basic Rate?", kind: "check", width: "w-28" },
      ],
      newRow: () => ({ category: "Total", add_deduct_tax: "Add", charge_type: "On Net Total", row_id: null, account_head: null, description: null, rate: 0, tax_amount: 0, included_in_print_rate: false }),
    },
  },
  tabs: [
    {
      label: "Details",
      sections: [
        { columns: [["title", "is_default", "disabled"], ["company", "tax_category"]] },
        { columns: [["taxes"]] },
      ],
    },
  ],
};

export const paymentTermsTemplateSpec: MasterSpec = {
  doctype: "Payment Terms Template",
  fields: {
    template_name: { label: "Template Name", kind: "data", required: true, readOnly: (_v, isNew) => !isNew },
    allocate_payment_based_on_payment_terms: {
      label: "Allocate Payment Based On Payment Terms",
      kind: "check",
      description: "If this checkbox is checked, paid amount will be splitted and allocated as per the amounts in payment schedule against each payment term",
    },
  },
  tables: {
    terms: {
      label: "Payment Terms",
      columns: [
        { name: "payment_term", label: "Payment Term", kind: "link", link: "paymentTerm", width: "min-w-[200px]" },
        { name: "description", label: "Description", kind: "data", width: "min-w-[180px]" },
        { name: "invoice_portion", label: "Invoice Portion (%)", kind: "float", required: true, width: "w-32" },
        { name: "due_date_based_on", label: "Due Date Based On", kind: "select", options: DUE_DATE_BASES, required: true, width: "w-64" },
        { name: "credit_days", label: "Credit Days", kind: "int", width: "w-24" },
        { name: "credit_months", label: "Credit Months", kind: "int", width: "w-24" },
      ],
      newRow: () => ({ payment_term: null, description: null, invoice_portion: null, due_date_based_on: "Day(s) after invoice date", credit_days: 0, credit_months: 0 }),
    },
  },
  tabs: [{ label: "Details", sections: [{ columns: [["template_name", "allocate_payment_based_on_payment_terms", "terms"]] }] }],
};

export const paymentTermSpec: MasterSpec = {
  doctype: "Payment Term",
  fields: {
    payment_term_name: { label: "Payment Term Name", kind: "data", required: true, bold: true, readOnly: (_v, isNew) => !isNew },
    invoice_portion: { label: "Invoice Portion (%)", kind: "float", bold: true },
    due_date_based_on: { label: "Due Date Based On", kind: "select", options: ["", ...DUE_DATE_BASES], bold: true },
    credit_days: { label: "Credit Days", kind: "int", bold: true, showIf: (v) => v.due_date_based_on === DUE_DATE_BASES[0] || v.due_date_based_on === DUE_DATE_BASES[1] },
    credit_months: { label: "Credit Months", kind: "int", showIf: (v) => v.due_date_based_on === DUE_DATE_BASES[2] },
    description: { label: "Description", kind: "text", bold: true },
  },
  tabs: [{ label: "Details", sections: [{ columns: [["payment_term_name", "invoice_portion", "due_date_based_on", "credit_days", "credit_months"]] }, { columns: [["description"]] }] }],
};

export const termsSpec: MasterSpec = {
  doctype: "Terms and Conditions",
  fields: {
    title: { label: "Title", kind: "data", required: true, readOnly: (_v, isNew) => !isNew },
    disabled: { label: "Disabled", kind: "check" },
    selling: { label: "Selling", kind: "check" },
    buying: { label: "Buying", kind: "check" },
    terms: { label: "Terms and Conditions", kind: "editor" },
  },
  tabs: [{ label: "Details", sections: [{ columns: [["title", "disabled"]] }, { label: "Applicable Modules", columns: [["selling"], ["buying"]] }, { columns: [["terms"]] }] }],
};

export const newTaxTemplateValues = (): Values => ({ title: null, is_default: false, disabled: false, company: null, tax_category: null, taxes: [] });
export const newPaymentTermsTemplateValues = (): Values => ({ template_name: null, allocate_payment_based_on_payment_terms: false, terms: [] });
export const newPaymentTermValues = (): Values => ({ payment_term_name: null, invoice_portion: null, due_date_based_on: null, credit_days: 0, credit_months: 0, description: null });
export const newTermsValues = (): Values => ({ title: null, disabled: false, selling: true, buying: true, terms: null });

/** Frappe's indicator for a doctype with a Disabled field. */
export const enabledIndicator = (r: { disabled: boolean }) => (r.disabled ? ({ label: "Disabled", colour: "gray" } as const) : ({ label: "Enabled", colour: "blue" } as const));
