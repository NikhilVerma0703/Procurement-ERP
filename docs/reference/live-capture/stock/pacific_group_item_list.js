// CAPTURED FROM THE LIVE SITE — 21-11-2026, before the NestorHawk shutdown (Phase II).
// Source: https://pacificengineeredsurfaces.nestorhawk.com/assets/pacific_group/js/item_list.js
// (apps/pacific_group/pacific_group/public/js/item_list.js): the custom add-on's client-side logic
// on the Item list view, added through the add-on's doctype_js hook. Its server methods
// (pacific_group.customisations.*) are NOT in the backup; their rules must be derived
// from the historical data and confirmed. Kept verbatim (including its quirks).

frappe.listview_settings["Item"] = {
onload : function (listview) {
    listview.page.add_actions_menu_item(__("Send Mail"), async function(){
        const docnames = listview.get_checked_items(true).map(docname => docname.toString())
        let attachment_list = await frappe.db.get_list("File",{filters:{"attached_to_name":["in",docnames]},fields :["file_name", "file_url","is_private","name"]})
        let files_data = attachment_list.map(file => ({
            ...file,
            file_url: file.file_url.startsWith('http://') || file.file_url.startsWith('https://') ? file.file_url : `${window.origin}${file.file_url}`
        }));
        let communication = new frappe.views.CommunicationComposer();
        communication.attachments = files_data
        communication.setup_attach()
    }
    )
}

}
