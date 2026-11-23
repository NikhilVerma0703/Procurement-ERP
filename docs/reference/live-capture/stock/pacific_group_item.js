// CAPTURED FROM THE LIVE SITE — 21-11-2026, before the NestorHawk shutdown (Phase II).
// Source: https://pacificengineeredsurfaces.nestorhawk.com/assets/pacific_group/js/item.js
// (apps/pacific_group/pacific_group/public/js/item.js): the custom add-on's client-side logic
// on the Item form, added through the add-on's doctype_js hook. Its server methods
// (pacific_group.customisations.*) are NOT in the backup; their rules must be derived
// from the historical data and confirmed. Kept verbatim (including its quirks).

frappe.ui.form.on("Item", {
    refresh: frm => {
        frm.set_df_property('tax_type', 'hidden', 0);
    },

    tax_type:frm =>{
        if (frm.doc.tax_type === "Dynamic Tax") {
            frm.set_df_property('tax_rule', 'hidden', 0);
        }
        else {
            frm.set_df_property('tax_rule', 'hidden', 1);
        }
    },
    service_item : frm => {
        frm.set_df_property('tax_type', 'hidden', 0);
    }
})