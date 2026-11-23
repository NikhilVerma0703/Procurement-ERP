"""Save the Buying + Stock setup (Phase II) from an ERPNext backup as readable files.

The old site shuts down soon (owner, 21-11-2026). Its database holds every screen's definition,
so this keeps, for each DocType the Buying and Stock screens use (and their child tables):
the DocType's own settings, every field in form order (standard fields, then the add-on's
custom fields and property changes), the role permissions, print formats, notifications,
workflows, custom reports, naming-series counters, and the small lookup tables (warehouses,
stock entry types, price lists, item groups).

Writes, into <output folder>:
  stock_setup.json                 - everything above, one entry per DocType
  print_formats/<doctype>/<name>.html
Usage:
    python -I extract_stock_setup.py <database.sql.gz> <output folder>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dump_reader import read_dump  # noqa: E402  (same folder, our own code)

# The 9 Buying sections, the 23 Stock › Masters & Reports sections, and what their forms link
# to or create (Gate Entry, Quality Inspection, Serial No / Batch, Landed Cost, Packing Slip…).
PARENTS = [
    "Purchase Order", "Supplier", "Item", "Address", "Contact", "Purchase Taxes and Charges Template",
    "Payment Terms Template", "Payment Term", "Terms and Conditions",
    "Item Group", "Product Bundle", "Price List", "Item Price", "Shipping Rule", "Pricing Rule",
    "Item Alternative", "Item Manufacturer", "Customs Tariff Number",
    "Material Request", "Stock Entry", "Delivery Note", "Purchase Receipt", "Pick List", "Delivery Trip",
    "Gate Entry", "Defects", "Quality Inspection", "Quality Inspection Template", "Serial No", "Batch",
    "Stock Reconciliation", "Landed Cost Voucher", "Packing Slip", "Warehouse", "Warehouse Type",
    "Stock Entry Type", "Bin", "Stock Ledger Entry", "UOM", "Brand", "Manufacturer", "Stock Settings",
    "Buying Settings", "Repost Item Valuation",
]
TABLES = [
    "tabDocType", "tabDocField", "tabDocPerm", "tabCustom DocPerm", "tabCustom Field", "tabProperty Setter",
    "tabPrint Format", "tabNotification", "tabNotification Recipient", "tabWorkflow",
    "tabWorkflow Document State", "tabWorkflow Transition", "tabReport", "tabSeries",
    "tabWarehouse", "tabStock Entry Type", "tabPrice List", "tabItem Group", "tabSingles",
    "tabServer Script", "tabClient Script",
]
FIELD_KEYS = ["idx", "fieldname", "label", "fieldtype", "options", "reqd", "hidden", "read_only",
              "default", "depends_on", "mandatory_depends_on", "read_only_depends_on", "fetch_from",
              "fetch_if_empty", "in_list_view", "in_standard_filter", "in_global_search", "bold",
              "collapsible", "collapsible_depends_on", "allow_on_submit", "no_copy", "print_hide",
              "precision", "columns", "permlevel", "description", "unique", "set_only_once",
              "non_negative", "search_index", "allow_bulk_edit", "is_virtual", "length"]
DOCTYPE_KEYS = ["module", "custom", "istable", "issingle", "is_submittable", "is_tree", "autoname",
                "naming_rule", "title_field", "search_fields", "show_title_field_in_link", "sort_field",
                "sort_order", "track_changes", "track_seen", "allow_import", "allow_rename",
                "quick_entry", "image_field", "default_print_format", "document_type",
                "show_preview_popup", "editable_grid", "max_attachments", "description"]


def dicts(cols, raw, table):
    names = [c for c, _ in cols.get(table, [])]
    return [dict(zip(names, r)) for r in raw.get(table, [])]


def pick(d, keys):
    return {k: d.get(k) for k in keys if d.get(k) not in (None, "", "0", 0)}


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    dump, out_dir = sys.argv[1], sys.argv[2]
    cols, raw = read_dump(dump, set(TABLES))
    t = {name: dicts(cols, raw, name) for name in TABLES}

    by_name = {d["name"]: d for d in t["tabDocType"]}
    # Every child table reachable from the parents (Table / Table MultiSelect fields), standard or custom.
    wanted, queue = set(), list(PARENTS)
    while queue:
        dt = queue.pop()
        if dt in wanted or dt not in by_name:
            continue
        wanted.add(dt)
        for f in t["tabDocField"] + [dict(c, parent=c["dt"]) for c in t["tabCustom Field"]]:
            if f.get("parent") == dt and f.get("fieldtype") in ("Table", "Table MultiSelect") and f.get("options"):
                queue.append(f["options"])

    out = {"source": os.path.basename(dump), "doctypes": {}}
    for dt in sorted(wanted):
        fields = sorted((f for f in t["tabDocField"] if f["parent"] == dt), key=lambda f: int(f["idx"] or 0))
        out["doctypes"][dt] = {
            "doctype": pick(by_name[dt], DOCTYPE_KEYS),
            "fields": [pick(f, FIELD_KEYS) for f in fields],
            "custom_fields": [pick(c, FIELD_KEYS + ["insert_after", "modified", "owner"])
                              for c in t["tabCustom Field"] if c["dt"] == dt],
            "property_setters": [pick(p, ["field_name", "property", "value", "property_type", "doctype_or_field"])
                                 for p in t["tabProperty Setter"] if p["doc_type"] == dt],
            "permissions": [pick(p, ["role", "permlevel", "read", "write", "create", "delete", "submit", "cancel",
                                     "amend", "report", "export", "import", "print", "email", "share",
                                     "if_owner", "select"]) | {"custom": tbl == "tabCustom DocPerm"}
                            for tbl in ("tabDocPerm", "tabCustom DocPerm") for p in t[tbl] if p["parent"] == dt],
            "notifications": [pick(n, ["name", "enabled", "event", "method", "subject", "condition", "channel",
                                       "value_changed", "send_to_all_assignees", "message"])
                              for n in t["tabNotification"] if n["document_type"] == dt],
            "workflows": [w["name"] for w in t["tabWorkflow"] if w["document_type"] == dt],
            "reports": [pick(r, ["name", "report_type", "is_standard", "module", "disabled", "owner", "query"])
                        for r in t["tabReport"] if r["ref_doctype"] == dt],
            "server_scripts": [pick(s, ["name", "script_type", "doctype_event", "disabled", "script"])
                               for s in t["tabServer Script"] if s.get("reference_doctype") == dt],
            "client_scripts": [pick(s, ["name", "view", "enabled", "script"])
                               for s in t["tabClient Script"] if s.get("dt") == dt],
        }

    os.makedirs(os.path.join(out_dir, "print_formats"), exist_ok=True)
    pfs = []
    for pf in t["tabPrint Format"]:
        if pf["doc_type"] not in wanted or pf["doc_type"] == "Purchase Order":
            continue  # the PO's are kept by extract_po_setup.py
        folder = os.path.join(out_dir, "print_formats", re.sub(r"[^A-Za-z0-9 _.-]", "_", pf["doc_type"]))
        os.makedirs(folder, exist_ok=True)
        safe = re.sub(r"[^A-Za-z0-9 _.-]", "_", pf["name"]).strip()
        with open(os.path.join(folder, f"{safe}.html"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(f"<!-- ERPNext Print Format: {pf['name']} | DocType: {pf['doc_type']} | type: "
                     f"{pf['print_format_type']} | standard: {pf['standard']} | disabled: {pf['disabled']} "
                     f"| last modified: {pf['modified']} -->\n")
            if pf.get("css"):
                fh.write("<style>\n" + pf["css"] + "\n</style>\n")
            fh.write(pf.get("html") or "")
            if pf.get("format_data"):
                fh.write("\n<!-- format_data (print designer layout):\n" + pf["format_data"] + "\n-->\n")
        pfs.append(pick(pf, ["name", "doc_type", "print_format_type", "standard", "disabled", "modified"]))
    out["print_formats"] = pfs
    out["series"] = {s["name"]: s["current"] for s in t["tabSeries"]}
    out["warehouses"] = [pick(w, ["name", "warehouse_name", "parent_warehouse", "is_group", "warehouse_type",
                                  "company", "disabled", "account"]) for w in t["tabWarehouse"]]
    out["stock_entry_types"] = [pick(s, ["name", "purpose", "add_to_transit"]) for s in t["tabStock Entry Type"]]
    out["price_lists"] = [pick(p, ["name", "currency", "buying", "selling", "enabled", "price_not_uom_dependent"])
                          for p in t["tabPrice List"]]
    out["item_groups"] = [pick(g, ["name", "parent_item_group", "is_group", "lft", "rgt"]) for g in t["tabItem Group"]]
    out["settings"] = {dt: {s["field"]: s["value"] for s in t["tabSingles"] if s["doctype"] == dt}
                       for dt in ("Stock Settings", "Buying Settings")}
    with open(os.path.join(out_dir, "stock_setup.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False, sort_keys=False)
    n_fields = sum(len(d["fields"]) + len(d["custom_fields"]) for d in out["doctypes"].values())
    print(f"{len(out['doctypes'])} doctypes, {n_fields} fields, {len(pfs)} print formats -> {out_dir}")


if __name__ == "__main__":
    main()
