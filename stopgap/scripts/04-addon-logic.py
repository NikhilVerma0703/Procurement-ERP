"""ERPNext stopgap, optional step 4 — bring back the pacific_group add-on's
behaviour on the Purchase Order form, without its code.

Run inside WSL as the `frappe` user, from the bench's sites folder, with the
bench's own Python (restore-site has to have run first):

    cd ~/frappe-bench/sites && ../env/bin/python "<repo>/stopgap/scripts/04-addon-logic.py" pacific.localhost "<repo>"

What it installs (all ordinary ERPNext records, removable in the UI):
  * the add-on's own PO form script, verbatim, as a Client Script
    (docs/reference/live-capture/pacific_group_purchase_order.js);
  * four API Server Scripts answering under the add-on's method names, with the
    rules confirmed on the live site and against all 3,199 historical POs
    (docs/reference/live-capture/addon-server-probe-2026-11-16.md):
      item_tax / get_doc      per-item IGST, or CGST+SGST, % and amount from the
                              item's Item Tax Template (highest / lowest rate)
      get_account_head        the service item's default expense account
      services_charges        GST on a Cost Overhead charge, at the service
                              item's own GST rate
NOT installed: the add-on's save-time folding of Cost Overhead charges into
Total Taxes and Charges / Grand Total (see stopgap/README.md).
Safe to run again: existing records are updated in place.
"""
import os
import sys

import frappe

SITE, REPO = sys.argv[1], sys.argv[2]
PREFIX = "pacific_group.customisations.custom_purchase_invoice."

# Shared by the scripts below (Server Scripts cannot import each other).
TEMPLATE_RATES = '''
def template_of(item_code, row_template, tax_category):
    if row_template:
        return row_template
    taxes = frappe.get_all("Item Tax", filters={"parent": item_code, "parenttype": "Item"},
                           fields=["item_tax_template", "tax_category"], order_by="idx asc")
    same = [t for t in taxes if (t.tax_category or "") == (tax_category or "")]
    blank = [t for t in taxes if not t.tax_category]
    pick = same or blank or taxes
    return pick[0].item_tax_template if pick else None

def gst_of(item_row, tax_category):
    template = template_of(item_row.get("item_code"), item_row.get("item_tax_template"), tax_category)
    if not template:
        return None
    rates = [frappe.utils.flt(r.tax_rate) for r in frappe.get_all(
        "Item Tax Template Detail", filters={"parent": template}, fields=["tax_rate"])]
    if not rates:
        return None
    amount = frappe.utils.flt(item_row.get("amount")) or frappe.utils.flt(item_row.get("qty")) * frappe.utils.flt(item_row.get("rate"))
    hi = max(rates)  # one name per line: Frappe's restricted Python has no tuple unpacking
    lo = min(rates)
    return {"max_per": hi, "max_amt": frappe.utils.flt(amount * hi / 100, 3),
            "min_per": lo, "min_amt": frappe.utils.flt(amount * lo / 100, 3)}

def parsed(value, default):
    if isinstance(value, str):
        return json.loads(value) if value else default
    return value or default
'''

SCRIPTS = {
    "item_tax": TEMPLATE_RATES + '''
row = parsed(frappe.form_dict.get("item_row"), {})
frappe.response["message"] = gst_of(row, frappe.form_dict.get("tax_category"))
''',
    "get_doc": TEMPLATE_RATES + '''
doc = parsed(frappe.form_dict.get("doc"), {})
out = {}
for row in doc.get("items") or []:
    if row.get("item_code"):
        out[row.get("item_code")] = gst_of(row, doc.get("tax_category")) or {"max_per": 0, "max_amt": 0, "min_per": 0, "min_amt": 0}
frappe.response["message"] = out
''',
    "get_account_head": TEMPLATE_RATES + '''
row = parsed(frappe.form_dict.get("row"), {})
frappe.response["message"] = frappe.db.get_value(
    "Item Default", {"parent": row.get("service_item"), "company": frappe.form_dict.get("company")}, "expense_account")
''',
    "services_charges": TEMPLATE_RATES + '''
rows = parsed(frappe.form_dict.get("row"), [])
tax = 0
account = None
for r in rows:
    account = account or r.get("account_head")
    template = template_of(r.get("service_item"), None, None)
    rates = [frappe.utils.flt(x.tax_rate) for x in frappe.get_all(
        "Item Tax Template Detail", filters={"parent": template}, fields=["tax_rate"])] if template else []
    rate = max(rates) if rates else 18
    tax = tax + frappe.utils.flt(r.get("service_charges")) * rate / 100
frappe.response["message"] = [frappe.utils.flt(tax, 3), account] if rows else None
''',
}


def upsert(doctype, name, values):
    if frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        doc.update(values)
        doc.save(ignore_permissions=True)
        return "updated"
    doc = frappe.get_doc({"doctype": doctype, "name": name, **values})
    doc.insert(ignore_permissions=True, set_name=name)
    return "created"


def main():
    os.chdir(os.path.join(os.path.expanduser("~"), "frappe-bench", "sites"))
    frappe.init(site=SITE, sites_path=".")
    frappe.connect()
    try:
        # Frappe 14 runs Server Scripts only when the site allows them.
        from frappe.installer import update_site_config
        update_site_config("server_script_enabled", 1)
        print("server scripts enabled for", SITE)
        for method, body in SCRIPTS.items():
            name = f"pacific_group {method} (restored)"
            print(name, upsert("Server Script", name, {
                "script_type": "API", "api_method": PREFIX + method, "allow_guest": 0,
                "disabled": 0, "script": body.strip() + "\n",
            }))
        js_path = os.path.join(REPO, "docs", "reference", "live-capture", "pacific_group_purchase_order.js")
        with open(js_path, encoding="utf-8") as fh:
            js = fh.read()
        name = "Purchase Order - pacific_group (restored)"
        print(name, upsert("Client Script", name, {"dt": "Purchase Order", "view": "Form", "enabled": 1, "script": js}))
        frappe.db.commit()
    finally:
        frappe.destroy()


main()
