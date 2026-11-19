// The Item screen's layout: ERPNext 14's Item form (stock/doctype/item/item.json) with India
// Compliance's HSN/SAC and Input Tax Credit fields and the add-on's Service Item, in their order
// and labels, kept to what a purchase uses and the old site's 7,331 items hold. Pure, client-safe.
//
// Left out: stock (Opening Stock, Valuation Rate and Method, reorder levels, barcodes, shelf
// life, warranty, negative stock: the Store module keeps stock), selling (the Sales tab, Standard
// Selling Rate, Customer Items), assets (Is Fixed Asset and its fields: 0 items), Quality and
// Manufacturing tabs, deferred accounting, Brand (0 items), Item Color (1 item), Supplier Items
// (none came across), and the add-on's Tax Type and Tax Rule, which the old form kept hidden.
import type { MasterSpec, Values } from "../spec";

const isStock = (v: Values) => v.is_stock_item === true;

export const itemSpec: MasterSpec = {
  doctype: "Item",
  fields: {
    item_code: { label: "Item Code", kind: "data", required: true, bold: true, readOnly: (_v, isNew) => !isNew },
    item_name: { label: "Item Name", kind: "data", bold: true },
    item_group: { label: "Item Group", kind: "link", link: "itemGroup", required: true },
    gst_hsn_code: { label: "HSN/SAC", kind: "link", link: "hsnCode", description: "You can search code by the description of the category." },
    stock_uom: { label: "Default Unit of Measure", kind: "link", link: "uom", required: true },
    disabled: { label: "Disabled", kind: "check" },
    is_stock_item: { label: "Maintain Stock", kind: "check", bold: true },
    has_variants: { label: "Has Variants", kind: "check", showIf: (v) => !v.variant_of },
    description: { label: "Description", kind: "editor" },

    end_of_life: { label: "End of Life", kind: "date", showIf: isStock },
    weight_per_unit: { label: "Weight Per Unit", kind: "float", showIf: isStock },
    weight_uom: { label: "Weight UOM", kind: "link", link: "uom", showIf: isStock },
    has_batch_no: { label: "Has Batch No", kind: "check", showIf: isStock },
    has_serial_no: { label: "Has Serial No", kind: "check", showIf: isStock },

    variant_of: { label: "Variant Of", kind: "readonly", showIf: (v) => !!v.variant_of },
    variant_based_on: { label: "Variant Based On", kind: "readonly", showIf: (v) => v.has_variants === true },

    purchase_uom: { label: "Default Purchase Unit of Measure", kind: "link", link: "uom" },
    min_order_qty: { label: "Minimum Order Qty", kind: "float", showIf: isStock },
    safety_stock: { label: "Safety Stock", kind: "float" },
    is_purchase_item: { label: "Allow Purchase", kind: "check" },
    lead_time_days: { label: "Lead Time in days", kind: "int" },
    last_purchase_rate: { label: "Last Purchase Rate", kind: "readonly" },
    country_of_origin: { label: "Country of Origin", kind: "link", link: "country" },

    is_ineligible_for_itc: { label: "Is Ineligible for Input Tax Credit", kind: "check" },
    service_item: { label: "Service Item", kind: "check" },
  },
  tables: {
    uoms: {
      label: "UOMs",
      columns: [
        { name: "uom", label: "UOM", kind: "link", link: "uom", required: true },
        { name: "conversion_factor", label: "Conversion Factor", kind: "float", required: true, decimals: 9 },
      ],
      newRow: () => ({ uom: null, conversion_factor: null }),
    },
    attributes: {
      label: "Variant Attributes",
      columns: [
        { name: "attribute", label: "Attribute", kind: "link", link: "itemAttribute", required: true },
        // A variant's value for the attribute; a template lists only the attributes.
        {
          name: "attribute_value",
          label: "Attribute Value",
          kind: "link",
          link: "itemAttributeValue",
          linkParams: (v) => ({ attribute: typeof v.attribute === "string" ? v.attribute : null }),
          readOnly: (v) => v.has_variants === true,
          required: (v) => !!v.variant_of,
        },
      ],
      newRow: () => ({ attribute: null, attribute_value: null }),
      showIf: (v) => v.has_variants === true || !!v.variant_of,
    },
    item_defaults: {
      label: "Item Defaults",
      columns: [
        { name: "company", label: "Company", kind: "link", link: "company", required: true },
        { name: "default_warehouse", label: "Default Warehouse", kind: "link", link: "warehouse", linkParams: (v) => ({ company: typeof v.company === "string" ? v.company : null }) },
        { name: "default_price_list", label: "Default Price List", kind: "link", link: "priceList" },
        { name: "buying_cost_center", label: "Default Buying Cost Center", kind: "link", link: "costCenter", linkParams: (v) => ({ company: typeof v.company === "string" ? v.company : null }) },
        { name: "default_supplier", label: "Default Supplier", kind: "link", link: "supplier" },
        { name: "expense_account", label: "Default Expense Account", kind: "link", link: "expenseAccount", linkParams: (v) => ({ company: typeof v.company === "string" ? v.company : null }) },
      ],
      newRow: () => ({ company: null, default_warehouse: null, default_price_list: null, buying_cost_center: null, default_supplier: null, expense_account: null }),
    },
    taxes: {
      label: "Taxes",
      columns: [
        { name: "item_tax_template", label: "Item Tax Template", kind: "link", link: "itemTaxTemplate", required: true },
        { name: "tax_category", label: "Tax Category", kind: "link", link: "taxCategory" },
        { name: "valid_from", label: "Valid From", kind: "date" },
        { name: "minimum_net_rate", label: "Minimum Net Rate", kind: "float" },
        { name: "maximum_net_rate", label: "Maximum Net Rate", kind: "float" },
      ],
      newRow: () => ({ item_tax_template: null, tax_category: null, valid_from: null, minimum_net_rate: 0, maximum_net_rate: 0 }),
    },
  },
  tabs: [
    {
      label: "Details",
      sections: [
        { columns: [["item_code", "item_name", "item_group", "gst_hsn_code", "stock_uom"], ["disabled", "is_stock_item", "has_variants"]] },
        { label: "Description", collapsible: true, columns: [["description"]] },
      ],
    },
    { label: "Dashboard", showIf: (_v, isNew) => !isNew, sections: [{ slot: "dashboard", columns: [] }] },
    {
      label: "Inventory",
      sections: [
        { label: "Inventory Settings", columns: [["end_of_life"], ["weight_per_unit", "weight_uom"]] },
        { label: "Units of Measure", collapsible: true, columns: [["uoms"]] },
        { label: "Serial Nos and Batches", collapsible: true, showIf: isStock, columns: [["has_batch_no"], ["has_serial_no"]] },
      ],
    },
    {
      label: "Variants",
      showIf: (v) => v.has_variants === true || !!v.variant_of,
      sections: [{ columns: [["variant_of", "variant_based_on", "attributes"]] }],
    },
    { label: "Accounting", sections: [{ columns: [["item_defaults"]] }] },
    {
      label: "Purchasing",
      sections: [
        { columns: [["purchase_uom", "min_order_qty", "safety_stock"], ["is_purchase_item", "lead_time_days", "last_purchase_rate"]] },
        { label: "Foreign Trade Details", collapsible: true, columns: [["country_of_origin"]] },
      ],
    },
    { label: "Tax", sections: [{ columns: [["is_ineligible_for_itc", "service_item", "taxes"]] }] },
  ],
};

/** A new item's values: the doctype's defaults (Maintain Stock, Allow Purchase, End of Life 2099-12-31). */
export function newItemValues(): Values {
  return {
    item_code: null, item_name: null, item_group: null, gst_hsn_code: null, stock_uom: null, disabled: false, is_stock_item: true,
    has_variants: false, description: null, end_of_life: "2099-12-31", weight_per_unit: 0, weight_uom: null, has_batch_no: false,
    has_serial_no: false, variant_of: null, variant_based_on: "Item Attribute", purchase_uom: null, min_order_qty: 0, safety_stock: 0,
    is_purchase_item: true, lead_time_days: 0, last_purchase_rate: null, country_of_origin: null, is_ineligible_for_itc: false,
    service_item: false, uoms: [], attributes: [], item_defaults: [], taxes: [],
  };
}

/**
 * The list's and form's indicator (item_list.js): Disabled, Expired (End of Life passed),
 * Template (has variants), Variant; else Frappe's Enabled.
 */
export function itemIndicator(i: { disabled: boolean; endOfLife: string | null; hasVariants: boolean; variantOf: string | null }, today: string) {
  if (i.disabled) return { label: "Disabled", colour: "gray" } as const;
  if (i.endOfLife && i.endOfLife < today) return { label: "Expired", colour: "gray" } as const;
  if (i.hasVariants) return { label: "Template", colour: "orange" } as const;
  if (i.variantOf) return { label: "Variant", colour: "green" } as const;
  return { label: "Enabled", colour: "blue" } as const;
}

/**
 * make_variant_item_code: a variant's Item Code and Item Name are the template's, then the
 * abbreviation of each attribute's value (a numeric attribute's value itself), in the order of
 * the template's attributes, joined by "-".
 */
export function variantNames(templateCode: string, templateName: string, abbreviations: string[]): { code: string; name: string } | null {
  if (!abbreviations.length) return null;
  const tail = abbreviations.join("-");
  return { code: `${templateCode}-${tail}`, name: `${templateName}-${tail}` };
}

/**
 * Item Variant Settings on the old site: the fields a new variant takes from its template, and
 * that saving the template copies to its variants again (do_not_update_variants was off).
 */
export const VARIANT_FIELDS = [
  "item_group", "gst_hsn_code", "stock_uom", "is_stock_item", "end_of_life", "has_serial_no", "has_batch_no", "weight_per_unit", "weight_uom",
  "disabled", "is_purchase_item", "purchase_uom", "min_order_qty", "safety_stock", "lead_time_days", "country_of_origin", "service_item",
  "is_ineligible_for_itc", "uoms", "item_defaults", "taxes",
] as const;
