// CAPTURED FROM THE LIVE SITE — 21-11-2026, before the NestorHawk shutdown (Phase II).
// Source: https://pacificengineeredsurfaces.nestorhawk.com/assets/pacific_group/js/qc.js
// (apps/pacific_group/pacific_group/public/js/qc.js): the custom add-on's client-side logic
// on the Quality Inspection form, added through the add-on's doctype_js hook. Its server methods
// (pacific_group.customisations.*) are NOT in the backup; their rules must be derived
// from the historical data and confirmed. Kept verbatim (including its quirks).

frappe.ui.form.on('Quality Inspection', {
    // refresh : frm => {
    // },
})

frappe.ui.form.on("Quality Inspection Reading", {
    item_status (frm, cdt, cdn) {
        quality_qty(frm, cdt, cdn)
    },
    bag_weight (frm, cdt, cdn) {
        quality_qty(frm, cdt, cdn)
    },
})

let quality_qty = async (frm, cdt, cdn) => {
    if (frm.doc.reference_name) {
        let child_val = frappe.model.get_doc(cdt, cdn);
        var sum = 0.0
        var sub = 0.0
        if (child_val.item_status === 'Yes') {
            frm.doc.readings.map(r=>{
                sum += r.bag_weight
            })
            frm.set_value('sample_size' , sum)
        }
        else {
            sub = frm.doc.sample_size - child_val.bag_weight
            frm.set_value('sample_size' , sub)
        }
    }
}