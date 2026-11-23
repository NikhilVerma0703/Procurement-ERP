// What ERPNext's transaction form script did to a buying or selling document's labels and fields
// (erpnext/public/js/controllers/transaction.js change_form_labels / change_grid_labels /
// toggle_item_grid_columns, 14.92): amounts are labelled with their currency — "Grand Total (INR)",
// the company-currency ones "(company currency)" — and the company-currency duplicates (base_*,
// the conversion rate) are hidden while the document is in the company's own currency. Phase II,
// owner 21-11-2026. Pure.

import type { LayoutField } from "./layout";

const BASE_FORM = ["base_total", "base_net_total", "base_total_taxes_and_charges", "base_discount_amount", "base_grand_total",
  "base_rounded_total", "base_in_words", "base_taxes_and_charges_added", "base_taxes_and_charges_deducted", "total_amount_to_pay",
  "base_paid_amount", "base_write_off_amount", "base_change_amount", "base_operating_cost", "base_raw_material_cost",
  "base_total_cost", "base_scrap_material_cost", "base_rounding_adjustment"];
const DOC_FORM = ["total", "net_total", "total_taxes_and_charges", "discount_amount", "grand_total", "taxes_and_charges_added",
  "taxes_and_charges_deducted", "tax_withholding_net_total", "rounded_total", "in_words", "paid_amount", "write_off_amount",
  "operating_cost", "scrap_material_cost", "rounding_adjustment", "raw_material_cost", "total_cost"];
const TOGGLED_FORM = ["conversion_rate", "base_total", "base_net_total", "base_total_taxes_and_charges", "base_taxes_and_charges_added",
  "base_taxes_and_charges_deducted", "base_grand_total", "base_rounded_total", "base_in_words", "base_discount_amount",
  "base_paid_amount", "base_write_off_amount", "base_operating_cost", "base_raw_material_cost", "base_total_cost",
  "base_scrap_material_cost", "base_rounding_adjustment"];
const ITEM_BASE = ["base_rate", "base_net_rate", "base_price_list_rate", "base_amount", "base_net_amount", "base_rate_with_margin"];
const ITEM_DOC = ["rate", "net_rate", "price_list_rate", "amount", "net_amount", "stock_uom_rate", "rate_with_margin"];
const ITEM_TOGGLED = ["base_rate", "base_price_list_rate", "base_amount", "base_rate_with_margin"];
const TAX_DOC = ["tax_amount", "total", "tax_amount_after_discount"];
const TAX_BASE = ["base_tax_amount", "base_total", "base_tax_amount_after_discount"];

/** Frappe's set_currency_labels: the label without any "(…)", then " (CUR)". */
const withCurrency = (f: LayoutField, currency: string) => `${(f.label ?? f.fieldname).replace(/\([^)]*\)/g, "").trim()} (${currency})`;

export function transactionLabels(doc: Record<string, unknown>, companyCurrency: string) {
  const currency = String(doc.currency || companyCurrency);
  const foreign = currency !== companyCurrency;
  const plcForeign = !!doc.price_list_currency && doc.price_list_currency !== companyCurrency;
  // Net Total only when it can differ from Total: a discount, or a tax included in the rate.
  const taxes = Array.isArray(doc.taxes) ? (doc.taxes as Record<string, unknown>[]) : [];
  const showNet = !!Math.trunc(Number(doc.discount_amount ?? 0)) || taxes.some((t) => Number(t.included_in_print_rate) === 1);
  return {
    label(table: string | null, f: LayoutField): string | undefined {
      if (table === null) {
        if (BASE_FORM.includes(f.fieldname)) return withCurrency(f, companyCurrency);
        if (DOC_FORM.includes(f.fieldname)) return withCurrency(f, currency);
        return undefined;
      }
      if (table === "items") {
        if (ITEM_BASE.includes(f.fieldname)) return withCurrency(f, companyCurrency);
        if (ITEM_DOC.includes(f.fieldname)) return withCurrency(f, currency);
      }
      if (table === "taxes") {
        if (TAX_BASE.includes(f.fieldname)) return withCurrency(f, companyCurrency);
        if (TAX_DOC.includes(f.fieldname)) return withCurrency(f, currency);
      }
      return undefined;
    },
    hidden(table: string | null, f: LayoutField): boolean {
      if (table === null) {
        // buying.js / selling.js refresh: the party's name only when it differs from the party.
        if (f.fieldname === "supplier_name") return !(doc.supplier_name && doc.supplier_name !== doc.supplier);
        if (f.fieldname === "customer_name") return !(doc.customer_name && doc.customer_name !== doc.customer);
        if (f.fieldname === "net_total") return !showNet;
        if (f.fieldname === "base_net_total") return !(showNet && foreign);
        if (TOGGLED_FORM.includes(f.fieldname)) return !foreign;
        if (f.fieldname === "plc_conversion_rate" || f.fieldname === "price_list_currency") return !plcForeign;
        return false;
      }
      if (table === "items" && ITEM_TOGGLED.includes(f.fieldname)) return !foreign;
      return false;
    },
  };
}
