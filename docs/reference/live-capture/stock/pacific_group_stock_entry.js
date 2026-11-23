// CAPTURED FROM THE LIVE SITE — 21-11-2026, before the NestorHawk shutdown (Phase II).
// Source: https://pacificengineeredsurfaces.nestorhawk.com/assets/pacific_group/js/stock_entry.js
// (apps/pacific_group/pacific_group/public/js/stock_entry.js): the custom add-on's client-side logic
// on the Stock Entry form, added through the add-on's doctype_js hook. Its server methods
// (pacific_group.customisations.*) are NOT in the backup; their rules must be derived
// from the historical data and confirmed. Kept verbatim (including its quirks).




frappe.ui.form.on('Stock Entry', {
    setup(frm) {
        frm.set_query('batch_no', 'items', function(doc, cdt, cdn) {
			var item = locals[cdt][cdn];
            if (item.custom_supplier ){
			if(!item.s_warehouse) {
				frappe.throw(__("Please enter source warehouse to get Batch Number"));
			} else {
                var filters = {
                    'warehouse':item.s_warehouse,
                    'item_code':item.item_code,
                    'supplier':item.custom_supplier
                }

				return {
					query : "pacific_group.customisations.stock_entry.get_supplier",
					filters: filters
				}
			}
        }
        else{
            if(!item.item_code) {
				frappe.throw(__("Please enter Item Code to get Batch Number"));
			} else {
				if (in_list(["Material Transfer for Manufacture", "Manufacture", "Repack", "Send to Subcontractor"], doc.purpose)) {
					var filters = {
						'item_code': item.item_code,
						'posting_date': frm.doc.posting_date || frappe.datetime.nowdate()
					}
				} else {
					var filters = {
						'item_code': item.item_code
					}
				}

				// User could want to select a manually created empty batch (no warehouse)
				// or a pre-existing batch
				if (frm.doc.purpose != "Material Receipt") {
					filters["warehouse"] = item.s_warehouse || item.t_warehouse;
				}

				return {
					query : "erpnext.controllers.queries.get_batch_no",
					filters: filters
				}
			}
        }
		})
        frm.set_query('custom_supplier', 'items', function(doc, cdt, cdn) {
            var item = locals[cdt][cdn];
            if (item.item_code){
                return {
					query : "pacific_group.customisations.stock_entry.get_supplier_list",
					filters: {'item_code': item.item_code}
				} 
            }
        })
        frm.set_query('custom_material_transfer', function(doc, cdt, cdn) {
            return {
                filters: {
                    work_order: frm.doc.work_order
                }
            }
        })    
	},

    onload(frm){
        if (frm.doc.work_order && frm.doc.docstatus===0){
       
        frappe.call({
            method: 'pacific_group.whitelisted_func.stock_entry.get_serial_no_data',
            args: {
                work_order: frm.doc.work_order,
            },
            callback: r => {
               
                let scrap_serial_no=""
                let fineshed_serial_no=""
                let finesh_qty=0
                let scrap_qty=0
                for (let item_data of  frm.doc.items){
                    if(item_data.is_finished_item && r.message.finesh_items){
                        finesh_qty=item_data.qty
                    }
                    else if (item_data.is_scrap_item && r.message.scrap_items){
                        scrap_qty=item_data.qty
                    }
                }
                for(let serial_no_data in r.message.scrap_items){
                    if (serial_no_data<=scrap_qty){
       
                    scrap_serial_no+=r.message.scrap_items[serial_no_data].slab_no + "\n"
                    if ((r.message.scrap_items).length===serial_no_data){
                        scrap_serial_no = scrap_serial_no.slice(0, -1);
                       var batch_no_1=r.message.scrap_items[serial_no_data].batch_no
                    }
                }
            
                }
                for(let serial_no_finesh in r.message.finesh_items){
                    if (serial_no_finesh <=finesh_qty){
       
                    fineshed_serial_no+=r.message.finesh_items[serial_no_finesh].slab_no + "\n"
                    if ((r.message.finesh_items).length===serial_no_finesh){
                        fineshed_serial_no = fineshed_serial_no.slice(0, -1);
                       var batch_no_1=r.message.finesh_items[serial_no_finesh].batch_no
                    }
                }
            
                }

                for (let item_data of  frm.doc.items){
                    if(item_data.is_finished_item && r.message.finesh_items){
                        frappe.model.set_value(item_data.doctype, item_data.name, "serial_no", fineshed_serial_no);
                        frappe.model.set_value(item_data.doctype, item_data.name, "batch_no", r.message.finesh_items[0].batch_no);
                        frappe.model.set_value(item_data.doctype, item_data.name, "qty", r.message.finesh_items.length);
                    }
                    if(item_data.is_scrap_item){
                        if(scrap_serial_no){
                            frappe.model.set_value(item_data.doctype, item_data.name, "serial_no", scrap_serial_no);
                            frappe.model.set_value(item_data.doctype, item_data.name, "batch_no", r.message.scrap_items[0].batch_no);
                            frappe.model.set_value(item_data.doctype, item_data.name, "qty", r.message.scrap_items.length);  
                        }
                        else{
                        frappe.model.set_value(item_data.doctype, item_data.name, "batch_no", r.message.finesh_items[0].batch_no);
                        frappe.model.set_value(item_data.doctype, item_data.name, "qty", 1);
                        }
                    }
                }

            }
        })
    }
    },

    refresh(frm){
        if (frm.doc.stock_entry_type ==="Manufacture" &&  frm.doc.work_order){
            ["custom_material_transfer"].map(element => frm.set_df_property(element,"hidden",0))
        }

    },
    
/// new cod apne
    scan_barcode(frm) {
        if (frm.doc.scan_barcode !== "") {
            update_items(frm);
        }
    },
    custom_material_transfer(frm) {
        let filtered_item=frm.doc.items.filter(item => item.t_warehouse)
        frm.set_value("items",[])
        if (frm.doc.custom_material_transfer){
            frappe.call({
                method : "pacific_group.customisations.stock_entry.get_transfer_items",
                args : {
                    transfer_entry : frm.doc.custom_material_transfer,
                    filtered_item:filtered_item
                },
                callback :r => {
                    if (r){
                        for (let item_data of r.message.transfer_items){
                            let row = frm.add_child("items")
                            if (item_data.is_t_warehouse===0){
                                row.custom_supplier=item_data.custom_supplier
                                row.s_warehouse=item_data.t_warehouse
                            }
                            else{
                                row.is_finished_item = item_data.is_finished_item;
                                row.is_scrap_item = item_data.is_scrap_item;
                                row.t_warehouse=item_data.t_warehouse
                                row.serial_no=item_data.serial_no
                                }
                                row.batch_no=item_data.batch_no
                                row.item_code=item_data.item_code
                                row.qty=item_data.qty
                                row.basic_rate=item_data.basic_rate
                                row.stock_uom = item_data.stock_uom;
                                row.uom = item_data.uom;
                                row.valuation_rate = item_data.valuation_rate;
                                row.conversion_factor = item_data.conversion_factor;
                                row.custom_wo_qty = item_data.custom_wo_qty;
                                row.item_name = item_data.item_name;
                                row.item_group = item_data.item_group;
                                row.description = item_data.description;
                                row.has_batch_no = item_data.has_batch_no
                                row.has_serial_no = item_data.has_serial_no
                                row.actual_qty = item_data.actual_qty
                                row.cost_center = item_data.cost_center
                                row.expense_account =item_data.expense_account
                                row.transfer_qty = item_data.transfer_qty

                        }
                    }
                    frm.set_value("set_posting_time",1)
                    frm.set_value("posting_date",r.message.posting_date)
                    frm.refresh_fields(["items","set_posting_time","posting_date"])
                }
            })
        }
    }
});

function update_items(frm) {
    const inputString = frm.doc.scan_barcode;

    // Extracting and removing PUR-ORD-2023-00055
    const orderNumberMatch = inputString.match(/PUR-ORD-\d{4}-\d{5}/);
    const orderNumber = orderNumberMatch[0];
    const remainingStringAfterOrderNumber = inputString.replace(orderNumber, "");

    // Extracting and removing supplier name
    const supplierNameMatch = remainingStringAfterOrderNumber.match(/-None-(.*?)-/);
    const supplierName = supplierNameMatch[1];
    const remainingStringAfterSupplier = remainingStringAfterOrderNumber.replace(`-None-${supplierName}-`, "");

    // Extracting batch number and bag number
    const batchAndBagNumberMatch = remainingStringAfterSupplier.match(/-(\d+)-(\d+)$/);
    const batchNumber = batchAndBagNumberMatch[1];
    const bagNumber = batchAndBagNumberMatch[2];
    const itemCode = remainingStringAfterSupplier.replace(`-${batchNumber}-${bagNumber}`, "");

    let order_doc = {
        "order_number": orderNumber,
        "supplier_name": supplierName,
        "batch_number": batchNumber,
        "bag_number": bagNumber,
        "item_code": itemCode
    }
    frappe.call({
        method: 'pacific_group.customisations.stock_entry.get_order_info',
        args: {
            doc: order_doc
        },
        callback: function (r) {
            if (!r.exc) {
                const qty = r.message
                const newItem = {
                    item_code: itemCode,
                    description: itemCode,
                    qty: qty,
                    transfer_qty: qty,
                    batch_no: batchNumber,
                    parentfield: "items",
                    parenttype: "Stock Entry",
                    doctype: "Stock Entry Detail"
                };
                if (frm.doc.items.length > 0 && !frm.doc.items[0].item_code) {
                    const childTableObj = frm.doc.items[0]
                    for (const field in newItem) {
                        childTableObj[field] = newItem[field];
                    }
                }
                else {
                    let itemFound = false;

                    // Check if the item already exists in the items array
                    for (let i = 0; i < frm.doc.items.length; i++) {
                        if (frm.doc.items[i].item_code === itemCode) {
                            itemFound = true;
                            frm.doc.items[i].qty += qty; // Update the quantity
                            break;
                        }
                    }

                    if (!itemFound) {
                        const childTableObj = frappe.model.add_child(frm.doc, "Stock Entry Detail", "items");
                        for (const field in newItem) {
                            childTableObj[field] = newItem[field];
                        }
                    }
                }
                frm.refresh_field("items"); // Refresh the items field

            }
        }
    })

    frm.set_value("scan_barcode", "");
    refresh_field("scan_barcode");
}

frappe.ui.form.on('Stock Entry Detail', {
    fetch_serial_no(frm,cdt,cdn){
        var item_data = locals[cdt][cdn];
        if (item_data.batch_no && item_data.item_code){
            update_batch_serial_no_items(item_data)
        }
        else{
            frappe.throw("Please check item or batch no")
        }
       

    }
})



function update_batch_serial_no_items(item_data) {
    if(item_data.batch_no) {
        let filters={'batch_no': ["in", [item_data.batch_no]],'item_code':["in",[item_data.item_code]]}
        if (!item_data.is_finished_item && !item_data.is_scrap_item){
            filters['warehouse']= ["in",[item_data.s_warehouse]]
            filters['status']=["in",["Active"]]
        }
        else{
            filters['status']=["in",["Inactive"]]
            filters['warehouse']= ["in",[""]]
        }

        frappe.db.get_list("Serial No", {
            filters: filters,
            fields: ["batch_no", "name"],
            limit: item_data.qty 
        }).then((r) => {
            if(r){
                let fineshed_serial_no=""
                for(let serial_no_data in r){
       
                    fineshed_serial_no+=r[serial_no_data].name + "\n"
                    if (r.length===serial_no_data){
                        fineshed_serial_no = fineshed_serial_no.slice(0, -1);
                    }
            
                }
                frappe.model.set_value(item_data.doctype, item_data.name, "serial_no", fineshed_serial_no);
                frappe.model.set_value(item_data.doctype, item_data.name, "qty", r.length);
            }

        })
    }
}