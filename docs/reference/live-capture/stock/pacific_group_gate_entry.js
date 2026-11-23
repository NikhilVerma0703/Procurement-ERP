// CAPTURED FROM THE LIVE SITE — 21-11-2026, before the NestorHawk shutdown (Phase II).
// Source: https://pacificengineeredsurfaces.nestorhawk.com, form bundle of the DocType
// (frappe.desk.form.load.getdoctype → __js), the segment "/* Adding apps/pacific_group/pacific_group/pacific_group/doctype/gate_entry/gate_entry.js */":
// the Gate Entry form (the add-on's own DocType)'s client-side logic. Not a public asset and not in the backup — this capture
// is the only copy. Its server methods (e.g. gate_entry.po_items) are not obtainable; their rules
// must be derived from the historical data and confirmed. Kept verbatim (including its quirks).

// Copyright (c) 2023, Nestorbird and contributors
// For license information, please see license.txt

frappe.ui.form.on('Gate Entry', {
	setup: function(frm){
		frm.get_field('items').grid.cannot_add_rows = true;
		refresh_field('items')
		frm.set_query("po_no", function() {
			return {
                filters: {
                    per_received: ['<', 99],
                    status: ['!=', 'Closed'],
                    docstatus: 1
                }
			};
		});

	},
	refresh : function(frm){
		if (frm.doc.__islocal) {
			frm.set_value('gate_entry_date', frappe.datetime.get_today())
		}
		if ((frm.doc.docstatus===1)&&(!frm.doc.inward_no)){
			frm.add_custom_button(__('Purchase Receipt'), function () {
				frappe.call({
					method:"pacific_group.pacific_group.doctype.gate_entry.gate_entry.create_purchase_receipt",
					args:{
						source_name:frm.doc.po_no,
						ge:frm.doc.name
					},
					callback(r){
						if (r.message){
					const doc = frappe.model.sync(r.message);
					frappe.set_route("Form", doc[0].doctype, doc[0].name);
					setTimeout(()=>{
						cur_frm.set_value("gate_entry",frm.doc.name)
						cur_frm.set_value("bill_no",frm.doc.invoice_no)
						cur_frm.set_value("bill_date",frm.doc.invoice_date)
						},1500
						)
						}
					}
				})
}, __('Create'));
		}
	},

	po_no: function(frm) {
		frappe.call({
			method:"pacific_group.pacific_group.doctype.gate_entry.gate_entry.po_items",
			args:{
				po_no:frm.doc.po_no
			},
			callback(r){
				if (r.message){
					let items=r.message
					frm.doc.items=[]
					if (frm.doc.__islocal){
					for (var item in items)
					{
						if(items[item].qty){
					frm.add_child("items",{"po_no":frm.doc.po_no,"item_code":items[item].item_code,"item_description":items[item].description,"uom":items[item].uom,"po_qty":items[item].qty,"bal_qty":items[item].qty,"po_item_name":items[item].name})
					refresh_field("items");
					}
				}
				}
				}
			}   
		})
	},
});

frappe.ui.form.on('Gate Entry Item', {
	item_qty(frm, cdt, cdn) {
		let row = frappe.model.get_doc(cdt, cdn);
        frappe.model.set_value(cdt,cdn, 'bal_qty',row.po_qty - row.item_qty)
		refresh_field("item_qty")
	},
})
