"""Build a readable Excel workbook of all Purchase Orders from an ERPNext backup.

Reads the MariaDB dump (the "...-database.sql.gz" file from ERPNext's
Download Backups page) directly - no database server needed - and writes one
sheet per table: Purchase Orders, PO Items, PO Taxes, PO Cost Overheads,
PO Payment Schedule, Suppliers, Addresses, Contacts, Items.

Every column of every table is kept. The most useful columns come first, then
all remaining columns in their original order, so nothing is lost.

Usage (needs openpyxl):
    python -I export_po_excel.py <database.sql.gz> <output.xlsx>
"""
import datetime as dt
import gzip
import html
import re
import sys
from collections import defaultdict

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# --------------------------------------------------------------------------
# Which tables to pull, and which columns to show first on each sheet.
# --------------------------------------------------------------------------
TABLES = [
    "tabPurchase Order", "tabPurchase Order Item", "tabPurchase Taxes and Charges",
    "tabServices Items", "tabPayment Schedule", "tabSupplier", "tabAddress",
    "tabContact", "tabItem", "tabDynamic Link",
]

FIRST_COLS = {
    "Purchase Orders": [
        "name", "transaction_date", "schedule_date", "supplier", "supplier_name",
        "workflow_state", "status", "docstatus", "company", "custom_shipment_type",
        "custom_mode_of_transport", "custom_purpose_of_purchase", "currency",
        "conversion_rate", "total_qty", "total", "net_total", "total_taxes_and_charges",
        "discount_amount", "grand_total", "rounding_adjustment", "rounded_total",
        "in_words", "base_grand_total", "base_rounded_total", "per_received",
        "per_billed", "supplier_address", "address_display", "supplier_gstin",
        "gst_category", "contact_person", "contact_display", "contact_mobile",
        "contact_email", "shipping_address", "shipping_address_display",
        "billing_address", "billing_address_display", "company_gstin",
        "place_of_supply", "is_reverse_charge", "taxes_and_charges", "tax_category",
        "payment_terms_template", "tc_name", "terms", "order_confirmation_no",
        "order_confirmation_date", "set_warehouse", "cost_center", "project",
        "letter_head", "amended_from", "owner", "creation", "modified_by", "modified",
    ],
    "PO Items": [
        "parent", "po_date", "po_supplier_name", "po_workflow_state", "idx",
        "item_code", "item_name", "description", "gst_hsn_code", "qty", "uom",
        "stock_uom", "conversion_factor", "stock_qty", "rate", "amount", "sgst",
        "sgst_amt", "cgst", "cgst_amt", "igst", "igst_amt", "net_rate", "net_amount",
        "base_rate", "base_amount", "item_tax_template", "schedule_date",
        "expected_delivery_date", "warehouse", "material_request",
        "material_request_item", "received_qty", "billed_amt", "discount_percentage",
        "discount_amount", "price_list_rate", "project", "cost_center",
    ],
    "PO Taxes": [
        "parent", "po_date", "po_supplier_name", "idx", "category", "add_deduct_tax",
        "charge_type", "row_id", "account_head", "description", "rate", "tax_amount",
        "total", "tax_amount_after_discount_amount", "base_tax_amount", "base_total",
        "gst_tax_type", "included_in_print_rate", "cost_center",
    ],
    "PO Cost Overheads": [
        "parent", "po_date", "po_supplier_name", "idx", "service_item",
        "service_charges", "account_head", "charge_type",
    ],
    "PO Payment Schedule": [
        "parent", "po_date", "po_supplier_name", "idx", "payment_term", "description",
        "due_date", "invoice_portion", "payment_amount", "outstanding", "paid_amount",
        "mode_of_payment",
    ],
    "Suppliers": [
        "name", "supplier_name", "supplier_group", "supplier_type", "country", "gstin",
        "gst_category", "pan", "default_currency", "disabled", "supplier_primary_address",
        "primary_address", "supplier_primary_contact", "mobile_no", "email_id",
    ],
    "Addresses": [
        "name", "linked_to", "address_title", "address_type", "address_line1",
        "address_line2", "city", "state", "pincode", "country", "gstin", "gst_state",
        "gst_state_number", "gst_category", "email_id", "phone", "is_primary_address",
        "is_shipping_address", "disabled",
    ],
    "Contacts": [
        "name", "linked_to", "first_name", "last_name", "email_id", "phone",
        "mobile_no", "company_name", "designation", "is_primary_contact", "status",
    ],
    "Items": [
        "name", "item_code", "item_name", "item_group", "stock_uom", "gst_hsn_code",
        "description", "is_stock_item", "is_purchase_item", "disabled",
        "purchase_uom", "last_purchase_rate", "valuation_rate", "standard_rate",
    ],
}

DOCSTATUS = {0: "0 - Draft", 1: "1 - Submitted", 2: "2 - Cancelled"}

# --------------------------------------------------------------------------
# SQL dump parsing
# --------------------------------------------------------------------------
CREATE_RE = re.compile(r"^CREATE TABLE `([^`]+)` \(")
COL_RE = re.compile(r"^\s+`([^`]+)`\s+([a-z]+)")
INSERT_RE = re.compile(r"^INSERT INTO `([^`]+)` VALUES ")
TOKEN_RE = re.compile(
    r"'(?:[^'\\]|\\.)*'"                           # quoted string
    r"|NULL"
    r"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?"           # number
    r"|0x[0-9A-Fa-f]+"                             # hex literal
    r"|[(),]",
    re.S,
)
ESCAPES = {"0": "\0", "'": "'", '"': '"', "b": "\b", "n": "\n", "r": "\r",
           "t": "\t", "Z": "\x1a", "\\": "\\"}
ESC_RE = re.compile(r"\\(.)", re.S)


def unescape(s):
    return ESC_RE.sub(lambda m: ESCAPES.get(m.group(1), "\\" + m.group(1)), s)


def parse_values(body):
    """Yield one list of raw values per (...) tuple."""
    row, depth = None, 0
    for m in TOKEN_RE.finditer(body):
        tok = m.group(0)
        if tok == "(":
            depth += 1
            if depth == 1:
                row = []
        elif tok == ")":
            depth -= 1
            if depth == 0:
                yield row
        elif tok == ",":
            continue
        elif depth == 1:
            if tok == "NULL":
                row.append(None)
            elif tok[0] == "'":
                row.append(unescape(tok[1:-1]))
            else:
                row.append(tok)  # number kept as text for now; converted by type


def read_dump(path, wanted):
    cols = {}  # table -> [(name, type)]
    rows = defaultdict(list)
    current = None
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if current is not None:
                m = COL_RE.match(line)
                if m:
                    cols[current].append((m.group(1), m.group(2)))
                    continue
                current = None
            m = CREATE_RE.match(line)
            if m:
                if m.group(1) in wanted:
                    current = m.group(1)
                    cols[current] = []
                continue
            m = INSERT_RE.match(line)
            if m and m.group(1) in wanted:
                rows[m.group(1)].extend(parse_values(line[m.end():]))
    return cols, rows


# --------------------------------------------------------------------------
# Value conversion
# --------------------------------------------------------------------------
HTML_TAG_RE = re.compile(
    r"<\s*/?\s*(p|div|br|span|strong|b|i|u|em|table|tr|td|th|tbody|thead|ol|ul|li|h[1-6]|font|a|img)\b[^>]*>",
    re.I)


def html_to_text(s):
    s = re.sub(r"<\s*br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</\s*(p|div|tr|li|h[1-6])\s*>", "\n", s, flags=re.I)
    s = re.sub(r"</\s*(td|th)\s*>", "\t", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def convert(value, coltype):
    if value is None:
        return None
    try:
        if coltype in ("int", "bigint", "smallint", "tinyint", "mediumint"):
            return int(value)
        if coltype in ("decimal", "float", "double"):
            f = float(value)
            return int(f) if f.is_integer() and abs(f) < 1e15 else f
        if coltype == "date":
            return dt.date.fromisoformat(value) if value not in ("0000-00-00", "") else None
        if coltype in ("datetime", "timestamp"):
            if value.startswith("0000"):
                return None
            return dt.datetime.fromisoformat(value).replace(microsecond=0)
    except ValueError:
        return value
    if isinstance(value, str):
        if HTML_TAG_RE.search(value):
            value = html_to_text(value)
        value = ILLEGAL_CHARACTERS_RE.sub("", value)
        if len(value) > 32000:
            value = value[:32000] + " …[truncated - full text is in the backup]"
    return value


def to_dicts(cols, raw_rows):
    names = [c for c, _ in cols]
    types = [t for _, t in cols]
    out = []
    for r in raw_rows:
        if len(r) != len(names):
            raise SystemExit(f"column mismatch: expected {len(names)}, got {len(r)}")
        out.append({n: convert(v, t) for n, t, v in zip(names, types, r)})
    return out


# --------------------------------------------------------------------------
# Workbook writing
# --------------------------------------------------------------------------
HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
DATE_FMT = "dd-mm-yyyy"
DATETIME_FMT = "dd-mm-yyyy hh:mm"


def write_sheet(wb, title, records, all_cols):
    first = [c for c in FIRST_COLS.get(title, []) if c in all_cols]
    rest = [c for c in all_cols if c not in first]
    order = first + rest
    ws = wb.create_sheet(title)
    for i, c in enumerate(order, start=1):
        width = 14
        if c in ("description", "terms", "address_display", "shipping_address_display",
                 "billing_address_display", "item_name", "supplier_name", "in_words"):
            width = 40
        elif c in ("name", "parent", "supplier", "item_code", "account_head"):
            width = 22
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.freeze_panes = "B2"
    header = []
    for c in order:
        cell = WriteOnlyCell(ws, value=c)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        header.append(cell)
    ws.append(header)
    for rec in records:
        row = []
        for c in order:
            v = rec.get(c)
            if isinstance(v, (dt.date, dt.datetime)):
                cell = WriteOnlyCell(ws, value=v)
                cell.number_format = DATETIME_FMT if isinstance(v, dt.datetime) else DATE_FMT
                row.append(cell)
            else:
                row.append(v)
        ws.append(row)
    ws.auto_filter.ref = f"A1:{get_column_letter(len(order))}{len(records) + 1}"
    return len(records)


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    dump, out_path = sys.argv[1], sys.argv[2]
    cols, raw = read_dump(dump, set(TABLES))
    missing = [t for t in TABLES if t not in cols]
    if missing:
        raise SystemExit(f"tables not found in dump: {missing}")
    data = {t: to_dicts(cols[t], raw.get(t, [])) for t in TABLES}

    pos = sorted(data["tabPurchase Order"], key=lambda r: (r["creation"] or dt.datetime.min))
    for r in pos:
        r["docstatus"] = DOCSTATUS.get(r["docstatus"], r["docstatus"])
    po_by_name = {r["name"]: r for r in pos}
    po_order = {r["name"]: i for i, r in enumerate(pos)}

    def children(table):
        rows = [r for r in data[table] if r.get("parenttype") == "Purchase Order"]
        for r in rows:
            p = po_by_name.get(r["parent"], {})
            r["po_date"] = p.get("transaction_date")
            r["po_supplier_name"] = p.get("supplier_name")
            r["po_workflow_state"] = p.get("workflow_state")
        rows.sort(key=lambda r: (po_order.get(r["parent"], 10**9), r.get("idx") or 0))
        return rows

    # "linked_to" for addresses and contacts (from the Dynamic Link child table)
    links = defaultdict(list)
    for d in data["tabDynamic Link"]:
        if d.get("parenttype") in ("Address", "Contact"):
            links[(d["parenttype"], d["parent"])].append(f"{d['link_doctype']}: {d['link_name']}")
    for kind, table in (("Address", "tabAddress"), ("Contact", "tabContact")):
        for r in data[table]:
            r["linked_to"] = "; ".join(links.get((kind, r["name"]), []))

    child_cols = lambda t: [c for c, _ in cols[t]] + ["po_date", "po_supplier_name", "po_workflow_state"]
    sheets = [
        ("Purchase Orders", pos, [c for c, _ in cols["tabPurchase Order"]]),
        ("PO Items", children("tabPurchase Order Item"), child_cols("tabPurchase Order Item")),
        ("PO Taxes", children("tabPurchase Taxes and Charges"), child_cols("tabPurchase Taxes and Charges")),
        ("PO Cost Overheads", children("tabServices Items"), child_cols("tabServices Items")),
        ("PO Payment Schedule", children("tabPayment Schedule"), child_cols("tabPayment Schedule")),
        ("Suppliers", sorted(data["tabSupplier"], key=lambda r: r["name"]), [c for c, _ in cols["tabSupplier"]]),
        ("Addresses", sorted(data["tabAddress"], key=lambda r: r["name"]), [c for c, _ in cols["tabAddress"]] + ["linked_to"]),
        ("Contacts", sorted(data["tabContact"], key=lambda r: r["name"]), [c for c, _ in cols["tabContact"]] + ["linked_to"]),
        ("Items", sorted(data["tabItem"], key=lambda r: r["name"]), [c for c, _ in cols["tabItem"]]),
    ]

    wb = Workbook(write_only=True)
    readme = wb.create_sheet("README")
    readme.column_dimensions["A"].width = 28
    readme.column_dimensions["B"].width = 100
    counts = []
    for title, recs, all_cols in sheets:
        n = write_sheet(wb, title, recs, all_cols)
        counts.append((title, n))

    first_po, last_po = pos[0]["name"], pos[-1]["name"]
    bold = Font(bold=True)
    title_cell = WriteOnlyCell(readme, value="Pacific Engineered Surfaces - Purchase Order export")
    title_cell.font = Font(bold=True, size=14)
    readme.append([title_cell])
    readme.append([])
    info = [
        ("Source backup", dump.replace("\\", "/").split("/")[-1]),
        ("Exported on", dt.datetime.now().strftime("%d-%m-%Y %H:%M")),
        ("Purchase orders", f"{len(pos)}  ({first_po} … {last_po})"),
        ("docstatus", "0 - Draft, 1 - Submitted (approved/rejected via workflow), 2 - Cancelled"),
        ("workflow_state", "Created -> Approved / Rejected (set by the 'Admin' role)"),
        ("Child sheets", "Every PO Items / Taxes / Cost Overheads / Payment Schedule row has "
                         "'parent' = the PO number, plus the PO date and supplier for filtering."),
        ("Columns", "Most useful columns first, then every other column from the database. "
                    "HTML fields (addresses, terms, descriptions) are converted to plain text; "
                    "the original HTML is in the backup."),
        ("Complete copy", "The .sql.gz backup is the complete, restorable copy. "
                          "This workbook is a readable copy of the purchase-order data only."),
    ]
    for k, v in info:
        c = WriteOnlyCell(readme, value=k)
        c.font = bold
        cell_v = WriteOnlyCell(readme, value=v)
        cell_v.alignment = Alignment(wrap_text=True, vertical="top")
        readme.append([c, cell_v])
    readme.append([])
    hdr = WriteOnlyCell(readme, value="Sheet")
    hdr.font = bold
    hdr2 = WriteOnlyCell(readme, value="Rows")
    hdr2.font = bold
    readme.append([hdr, hdr2])
    for title, n in counts:
        readme.append([title, n])

    wb.save(out_path)
    print(f"saved {out_path}")
    for title, n in counts:
        print(f"  {title}: {n} rows")


if __name__ == "__main__":
    main()
