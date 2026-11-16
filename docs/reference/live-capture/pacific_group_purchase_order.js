// CAPTURED FROM THE LIVE SITE — 16-11-2026, before the NestorHawk shutdown.
// Source: https://pacificengineeredsurfaces.nestorhawk.com, form bundle of DocType
// "Purchase Order" (frappe.desk.form.load.getdoctype → __js), the segment marked
// "/* Adding apps/pacific_group/pacific_group/public/js/purchase_order.js */".
// This is the custom add-on's client-side logic on the PO form. Its four server
// methods (pacific_group.customisations.custom_purchase_invoice.{get_doc,
// services_charges, get_account_head, item_tax}) are NOT in the backup; their
// rules must be derived from the historical data and confirmed.
// Kept verbatim (including its quirks) as the reference for the replica.



frappe.ui.form.on("Purchase Order", {
    setup(frm) {
		frm.set_query('service_item', 'services_items', () => {
			return {
				filters: {
					service_item: 1
				}
			}
		})
	},
    // onload (frm) {
    //     if (frm.doc.__islocal) {
    //         frappe.db.get_list('Item',{filters: {"service_item": 1}}).then(records => {
    //             records.map(item => {
    //                 let row = frm.add_child('services_items',{})
    //                 frappe.model.set_value(row.doctype, row.name, 'service_item', item.name)
    //             })
    //             refresh_field('items')
    //         })
    //     }

    // },

    refresh : frm => {
        if (frm.doc.__islocal && frm.doc.items.length >0 && frm.doc.items[0].item_code) {
            frm.call({
                method : 'pacific_group.customisations.custom_purchase_invoice.get_doc',
                args : {
                    doc : frm.doc
                },
                callback : function (data) {
                    // frappe.model.set_value(cdt, cdn, 'schedule_date', frm.doc.schedule_date)
                    frm.doc.items.map(item => {
                        if (frm.doc.tax_category === 'Out-State') {
                            frappe.model.set_value(item.doctype, item.name, 'igst', data.message[""+item['item_code']]["max_per"])
                            frappe.model.set_value(item.doctype, item.name, 'igst_amt', data.message[""+item['item_code']]["max_amt"])
                        }
                        else if (frm.doc.tax_category === 'In-State') {
                            frappe.model.set_value(item.doctype, item.name, 'sgst', data.message[""+item['item_code']]["min_per"])
                            frappe.model.set_value(item.doctype, item.name, 'sgst_amt', data.message[""+item['item_code']]["min_amt"])
                            frappe.model.set_value(item.doctype, item.name, 'cgst', data.message[""+item['item_code']]["min_per"])
                            frappe.model.set_value(item.doctype, item.name, 'cgst_amt', data.message[""+item['item_code']]["min_amt"])
                        }
                    })
                }
            })
        }
    }
})

frappe.ui.form.on("Services Items", {
    service_charges (frm, cdt, cdn) {
        var row = frappe.model.get_doc(cdt, cdn)
        let all_items_data=frm.doc.services_items.filter(item => item.account_head === row.account_head)
        frappe.call({
            method : 'pacific_group.customisations.custom_purchase_invoice.services_charges',
            args : {
                "row" : all_items_data,
                "item" : frm.doc.items,
            },
            callback : function(r) {
                if (r.message) {
                    if (row.account_head){
                        for (var item in frm.doc.taxes){
                            if ((frm.doc.taxes[item].account_head===row.account_head)&& (frm.doc.taxes[item].charge_type===row.charge_type)){
                                cur_frm.get_field("taxes").grid.grid_rows[item].remove()
                            }
                        }
                        var taxes_table = frm.add_child('taxes');
                        frappe.model.set_value(taxes_table.doctype, taxes_table.name, 'tax_amount', r.message[0]);
                        frappe.model.set_value(taxes_table.doctype, taxes_table.name, 'charge_type', 'Actual');
                        frappe.model.set_value(taxes_table.doctype, taxes_table.name, 'account_head', r.message[1]);
                        // frappe.model.set_value(taxes_table.doctype, taxes_table.name, 'service_item', row.service_item);
                        frappe.model.set_value(taxes_table.doctype, taxes_table.name, 'service_price', row.service_charges);
                        refresh_field('taxes');
                    }
                }
            }
        // }
        })
    },
    service_item(frm,cdt,cdn){
        var row = frappe.model.get_doc(cdt, cdn)
        frappe.call({
            method:"pacific_group.customisations.custom_purchase_invoice.get_account_head",
            args:{
                row:row,
                company:frm.doc.company
            },
            callback : function(r){
                if (r.message){
                    frappe.model.set_value(cdt, cdn, 'account_head',r.message)
                }
            }
        })

        let filtered_item=frm.doc.services_items.filter(item => item.idx!=row.idx)
        for (var item in filtered_item){
            if (frm.doc.services_items[item].service_item===row.service_item){
                cur_frm.get_field("services_items").grid.grid_rows[row.idx-1].remove()
                refresh_field("services_items")
                // frappe.throw("You can't enter dupicate service item")
            }
        }
    }
})

frappe.ui.form.on("Purchase Order Item", {
    item_code (frm, cdt, cdn) {
		get_tax_amount(frm, cdt, cdn)
    },
    qty(frm, cdt, cdn) {
		get_tax_amount(frm, cdt, cdn)
	},
    rate(frm, cdt, cdn) {
		get_tax_amount(frm, cdt, cdn)
	},
})

let get_tax_amount = async (frm, cdt, cdn) => {
	let item_row = frappe.model.get_doc(cdt, cdn);
    setTimeout(()=> {
        frappe.call({
            method : 'pacific_group.customisations.custom_purchase_invoice.item_tax',
            args : {
                'item_row' : item_row,
                'tax_category': frm.doc.tax_category
            },
            callback : function(r) {
                frappe.model.set_value(cdt, cdn, 'schedule_date', frm.doc.schedule_date)

                if (frm.doc.tax_category === 'Out-State' && frm.doc.taxes_and_charges !== '') {
                    frappe.model.set_value(cdt, cdn, 'igst', r.message['max_per'])
                    frappe.model.set_value(cdt, cdn, 'igst_amt', r.message['max_amt'])
                }
                else if (frm.doc.tax_category === 'In-State' && frm.doc.taxes_and_charges !== '') {
                    frappe.model.set_value(cdt, cdn, 'sgst', r.message['min_per'])
                    frappe.model.set_value(cdt, cdn, 'sgst_amt', r.message['min_amt'])
                    frappe.model.set_value(cdt, cdn, 'cgst', r.message['min_per'])
                    frappe.model.set_value(cdt, cdn, 'cgst_amt', r.message['min_amt'])
                }
            }
        })
    }, 2000);
}

//# sourceURL=purchase_order__js
