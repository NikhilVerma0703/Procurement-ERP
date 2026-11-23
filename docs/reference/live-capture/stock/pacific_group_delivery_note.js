// CAPTURED FROM THE LIVE SITE — 21-11-2026, before the NestorHawk shutdown (Phase II).
// Source: https://pacificengineeredsurfaces.nestorhawk.com/assets/pacific_group/js/delivery_note.js
// (apps/pacific_group/pacific_group/public/js/delivery_note.js): the custom add-on's client-side logic
// on the Delivery Note form, added through the add-on's doctype_js hook. Its server methods
// (pacific_group.customisations.*) are NOT in the backup; their rules must be derived
// from the historical data and confirmed. Kept verbatim (including its quirks).

frappe.ui.form.on("Delivery Note", {
    refresh(frm){
        if(frm.doc.docstatus===1){
            let hidden_buttons = ["Shipment", "Installation Note", "Sales Return", "Subscription"];
            setTimeout(()=>{
                hidden_buttons.map(button_name => {
                    frm.remove_custom_button(button_name,'Create');
                });
            },1500)
        }
        else if(frm.doc.docstatus===0){
            setTimeout(()=>{
                hidden_buttons.map(button_name => {
                    frm.remove_custom_button(button_name,'Create');
                });
                $("[data-label='Get%20Items%20From']").hide()
            },500)
        }
        if (! frappe.user.has_role("Admin") || (! frappe.user.has_role("Sales Master Manager")) && frappe.session.user!="Administrator"){
            let hidden_field = ['section_break1']
            hidden_field.map(field => {
                frm.set_df_property(field, 'hidden', 1)
            })            
        }
    }
})