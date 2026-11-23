// CAPTURED FROM THE LIVE SITE — 21-11-2026, before the NestorHawk shutdown (Phase II).
// Source: https://pacificengineeredsurfaces.nestorhawk.com/assets/pacific_group/js/paking_slip.js
// (apps/pacific_group/pacific_group/public/js/paking_slip.js): the custom add-on's client-side logic
// on the Packing Slip form, added through the add-on's doctype_js hook. Its server methods
// (pacific_group.customisations.*) are NOT in the backup; their rules must be derived
// from the historical data and confirmed. Kept verbatim (including its quirks).

frappe.ui.form.on("Packing Slip", {
	onload :frm => {
		if(frm.doc.__islocal && frm.doc.delivery_note){
			frm.save()
		}
	},
    refresh : frm => {
		frm.fields_dict['items'].grid.cannot_add_rows=true
		$('.btn.btn-xs.btn-danger.grid-remove-rows').hide()
        frm.fields_dict.items.grid.add_custom_button(__('Add Item In Crate'), () =>{
			let set_rows = []
			frm.fields_dict.items.$wrapper.find('.grid-row-check').each((idx,row) => {
				if(row.checked && idx !== 0){
					set_rows.push(frm.doc.items[idx-1])
				}
			})
			if(set_rows && set_rows.length > 0){
				let d = new frappe.ui.Dialog({
					title: 'Enter details',
					fields: [
								{
									fieldname: "crate",
									label: "Crate/Box/Container",
									fieldtype: "Data",
									options: "Packing Slip",
									reqd: 1
						
								},
                                {
									fieldname: "crate_dimension",
									label: "Crate Dimension (MM)",
									fieldtype: "Data",
									options: "Packing Slip",
									reqd: 1
						
								}
						    ],
					primary_action_label: 'Submit',
					primary_action(values) {
						let crate = d.get_values().crate;
						let crate_dimension = d.get_values().crate_dimension;
						set_rows.map(row =>{
							frappe.model.set_value(row.doctype, row.name, 'crate', crate)
							frappe.model.set_value(row.doctype, row.name, 'crate_dimension', crate_dimension)
						})
						d.hide()
						frm.save()
					}
				});
				d.show()
	
			}else {
				frappe.throw("Please select atleast one row")
			}
		}).addClass('btn-secondary').removeClass('btn-default').css('background-color', '#0089ff').css('color', 'White');
    },
})


frappe.ui.form.on('Packing Slip Item', {
	form_render(frm, cdt, cdn){
		frm.fields_dict['items'].grid.wrapper.find('.grid-delete-row').addClass('hide');
		frm.fields_dict['items'].grid.wrapper.find('.grid-move-row').addClass('hide'); 
	}
})