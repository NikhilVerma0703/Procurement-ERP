// Which layout, triggers and quick entry each master screen draws with. On
// the client: layouts and triggers are functions (conditions, fetches), which
// cannot cross from a server page; a page names its master and passes data.
import { quickSaveSupplierAction, supplierAddressFetchAction, supplierContactFetchAction } from "@/app/purchase/suppliers/actions";
import { addressSpec } from "@/lib/purchase/masters/address/spec";
import { contactSpec } from "@/lib/purchase/masters/contact/spec";
import { itemSpec } from "@/lib/purchase/masters/item/spec";
import { paymentTermSpec, paymentTermsTemplateSpec, taxTemplateSpec, termsSpec } from "@/lib/purchase/masters/templates/spec";
import { paymentTermDetailsAction } from "@/app/purchase/payment-terms-templates/actions";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import type { MasterSpec, Row, Value, Values } from "@/lib/purchase/masters/spec";
import { newSupplierQuickValues, supplierGstinPatch, supplierPrefillParams, supplierQuickSpec, supplierSpec } from "@/lib/purchase/masters/supplier/spec";
import type { MasterKey } from "@/lib/purchase/routes";

export type Trigger = (name: string, value: Value | Row[], values: Values, before: Values) => Promise<Partial<Values> | null> | Partial<Values> | null;

export interface QuickEntry {
  spec: MasterSpec;
  initial: () => Values;
  trigger?: Trigger;
  save: (values: Values) => Promise<ActionResult<{ id: string; notices?: string[] }>>;
  /** "Edit Full Form": what the full form takes over, as query parameters. */
  prefill: (values: Values) => Record<string, string>;
}

export interface Screen {
  spec: MasterSpec;
  trigger?: Trigger;
  /** The list's New opens this dialog (Frappe's quick entry) instead of the full form. */
  quick?: QuickEntry;
  /** Rename also offers the title field, where the doctype has one apart from its name. */
  renameTitle?: { key: string; label: string };
}

const supplierTrigger =
  (quick: boolean): Trigger =>
  async (name, value, v) => {
    if (name === "gstin" || (quick && name === "country")) return supplierGstinPatch(v, quick);
    if (quick) return null;
    // supplier.js: the primary contact's Mobile No and Email Id (fetch_from), the address's text.
    if (name === "supplier_primary_contact") {
      if (!value) return { mobile_no: null, email_id: null };
      const r = await supplierContactFetchAction(String(value));
      return r.ok ? r.value : null;
    }
    if (name === "supplier_primary_address") {
      if (!value) return { primary_address: null };
      const r = await supplierAddressFetchAction(String(value));
      return r.ok ? r.value : null;
    }
    return null;
  };

/**
 * A Payment Terms Template row's Payment Term picked → the term's fields (fetch_from
 * payment_term.*): its Description always, the others only where the row has none.
 */
const paymentTermsTrigger: Trigger = async (name, value, _v, before) => {
  if (name !== "terms" || !Array.isArray(value)) return null;
  const prev = Array.isArray(before.terms) ? (before.terms as Row[]) : [];
  const i = value.findIndex((r) => r.payment_term && r.payment_term !== prev.find((p) => p._key === r._key)?.payment_term);
  if (i < 0) return null;
  const r = await paymentTermDetailsAction(String(value[i].payment_term));
  if (!r.ok || !r.value) return null;
  const d = r.value;
  const row = value[i];
  const empty = (x: Value | undefined) => x === null || x === undefined || x === "" || x === 0;
  const next: Row = {
    ...row,
    description: d.description,
    invoice_portion: empty(row.invoice_portion) ? d.invoice_portion : row.invoice_portion,
    due_date_based_on: empty(row.due_date_based_on) ? d.due_date_based_on : row.due_date_based_on,
    credit_days: empty(row.credit_days) ? d.credit_days : row.credit_days,
    credit_months: empty(row.credit_months) ? d.credit_months : row.credit_months,
  };
  return { terms: value.map((x, j) => (j === i ? next : x)) };
};

export const SCREENS: Partial<Record<MasterKey, Screen>> = {
  taxTemplates: { spec: taxTemplateSpec, renameTitle: { key: "title", label: "Title" } },
  paymentTermsTemplates: { spec: paymentTermsTemplateSpec, trigger: paymentTermsTrigger },
  paymentTerms: { spec: paymentTermSpec },
  terms: { spec: termsSpec },
  items: { spec: itemSpec, renameTitle: { key: "item_name", label: "Item Name" } },
  addresses: { spec: addressSpec },
  contacts: { spec: contactSpec },
  suppliers: {
    spec: supplierSpec,
    trigger: supplierTrigger(false),
    quick: {
      spec: supplierQuickSpec,
      initial: newSupplierQuickValues,
      trigger: supplierTrigger(true),
      save: quickSaveSupplierAction,
      prefill: supplierPrefillParams,
    },
  },
};

export function screenOf(master: MasterKey): Screen {
  const s = SCREENS[master];
  if (!s) throw new Error(`No screen for ${master}`);
  return s;
}
