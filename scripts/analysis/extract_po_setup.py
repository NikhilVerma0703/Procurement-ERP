"""Save the Purchase Order setup from an ERPNext backup as readable files.

Writes, into <output folder>:
  print_formats/<name>.html   - every Purchase Order print layout (Jinja HTML + CSS)
  po_setup.json               - custom fields, property setters, approval workflow,
                                email notifications, letter heads, terms templates,
                                tax templates and payment terms
Usage:
    python -I extract_po_setup.py <database.sql.gz> <output folder>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_po_excel import read_dump  # noqa: E402  (same folder, our own code)

PO_DOCTYPES = {"Purchase Order", "Purchase Order Item", "Purchase Taxes and Charges",
               "Services Items", "Payment Schedule"}
TABLES = [
    "tabPrint Format", "tabCustom Field", "tabProperty Setter", "tabWorkflow",
    "tabWorkflow Document State", "tabWorkflow Transition", "tabNotification",
    "tabNotification Recipient", "tabLetter Head", "tabTerms and Conditions",
    "tabPurchase Taxes and Charges Template", "tabPurchase Taxes and Charges",
    "tabPayment Terms Template", "tabPayment Terms Template Detail",
]


def rows_as_dicts(cols, raw, table):
    names = [c for c, _ in cols[table]]
    return [dict(zip(names, r)) for r in raw.get(table, [])]


def pick(d, keys):
    return {k: d.get(k) for k in keys if d.get(k) not in (None, "", "0")}


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    dump, out_dir = sys.argv[1], sys.argv[2]
    cols, raw = read_dump(dump, set(TABLES))
    t = {name: rows_as_dicts(cols, raw, name) for name in TABLES if name in cols}

    os.makedirs(os.path.join(out_dir, "print_formats"), exist_ok=True)
    default_pf = next((p["value"] for p in t["tabProperty Setter"]
                       if p["doc_type"] == "Purchase Order" and p["property"] == "default_print_format"), None)
    pf_list = []
    for pf in t["tabPrint Format"]:
        if pf["doc_type"] != "Purchase Order":
            continue
        safe = re.sub(r"[^A-Za-z0-9 _.-]", "_", pf["name"]).strip()
        path = os.path.join(out_dir, "print_formats", f"{safe}.html")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(f"<!-- ERPNext Print Format: {pf['name']} | type: {pf['print_format_type']} "
                     f"| standard: {pf['standard']} | disabled: {pf['disabled']} "
                     f"| default for PO: {pf['name'] == default_pf} | last modified: {pf['modified']} -->\n")
            if pf.get("css"):
                fh.write("<style>\n" + pf["css"] + "\n</style>\n")
            fh.write(pf.get("html") or "")
        pf_list.append({"name": pf["name"], "file": f"print_formats/{safe}.html",
                        "default": pf["name"] == default_pf, "disabled": pf["disabled"],
                        "modified": pf["modified"],
                        "margins_mm": pick(pf, ["margin_top", "margin_bottom", "margin_left", "margin_right"]),
                        "font_size": pf.get("font_size"), "page_number": pf.get("page_number")})

    wf = [w for w in t["tabWorkflow"] if w["document_type"] == "Purchase Order"]
    wf_names = {w["name"] for w in wf}
    notifications = []
    for n in t["tabNotification"]:
        if n["document_type"] not in PO_DOCTYPES:
            continue
        recips = [pick(r, ["receiver_by_document_field", "receiver_by_role", "cc", "bcc", "condition"])
                  for r in t["tabNotification Recipient"] if r["parent"] == n["name"]]
        notifications.append({**pick(n, ["name", "enabled", "event", "channel", "subject",
                                          "condition", "message", "attach_print", "print_format",
                                          "send_to_all_assignees", "value_changed",
                                          "days_in_advance", "date_changed"]),
                              "recipients": recips})

    tax_templates = []
    for tpl in t["tabPurchase Taxes and Charges Template"]:
        rows = [pick(r, ["idx", "category", "add_deduct_tax", "charge_type", "account_head",
                         "description", "rate", "included_in_print_rate"])
                for r in t["tabPurchase Taxes and Charges"]
                if r["parenttype"] == "Purchase Taxes and Charges Template" and r["parent"] == tpl["name"]]
        tax_templates.append({**pick(tpl, ["name", "title", "company", "is_default", "disabled",
                                            "tax_category"]),
                              "rows": sorted(rows, key=lambda r: int(r.get("idx") or 0))})

    payment_terms = []
    for p in t["tabPayment Terms Template"]:
        rows = [pick(r, ["idx", "payment_term", "description", "invoice_portion", "due_date_based_on",
                         "credit_days", "credit_months"])
                for r in t["tabPayment Terms Template Detail"] if r["parent"] == p["name"]]
        payment_terms.append({"name": p["name"], "rows": rows})

    setup = {
        "default_print_format": default_pf,
        "print_formats": pf_list,
        "custom_fields": [pick(c, ["dt", "fieldname", "label", "fieldtype", "options", "insert_after",
                                   "reqd", "hidden", "read_only", "default", "fetch_from",
                                   "depends_on", "in_list_view", "allow_on_submit", "print_hide",
                                   "description", "module"])
                          for c in t["tabCustom Field"] if c["dt"] in PO_DOCTYPES],
        "property_setters": [pick(p, ["doc_type", "field_name", "property", "value"])
                             for p in t["tabProperty Setter"] if p["doc_type"] in PO_DOCTYPES],
        "workflow": [{**pick(w, ["name", "document_type", "is_active", "workflow_state_field",
                                 "send_email_alert", "override_status"]),
                      "states": [pick(s, ["idx", "state", "doc_status", "allow_edit", "update_field",
                                          "update_value", "message"])
                                 for s in t["tabWorkflow Document State"] if s["parent"] in wf_names],
                      "transitions": [pick(x, ["idx", "state", "action", "next_state", "allowed",
                                               "allow_self_approval", "condition"])
                                      for x in t["tabWorkflow Transition"] if x["parent"] in wf_names]}
                     for w in wf],
        "notifications": notifications,
        "letter_heads": [pick(l, ["name", "is_default", "disabled", "source", "image", "content",
                                  "footer"]) for l in t["tabLetter Head"]],
        "terms_and_conditions": [pick(x, ["name", "title", "disabled", "buying", "terms"])
                                 for x in t["tabTerms and Conditions"]],
        "purchase_tax_templates": tax_templates,
        "payment_terms_templates": payment_terms,
    }
    with open(os.path.join(out_dir, "po_setup.json"), "w", encoding="utf-8") as fh:
        json.dump(setup, fh, indent=2, ensure_ascii=False, default=str)

    print(f"print formats: {len(pf_list)} (default: {default_pf})")
    for k in ["custom_fields", "property_setters", "workflow", "notifications", "letter_heads",
              "terms_and_conditions", "purchase_tax_templates", "payment_terms_templates"]:
        print(f"{k}: {len(setup[k])}")


if __name__ == "__main__":
    main()
