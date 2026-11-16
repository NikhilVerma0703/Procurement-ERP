"""Extract table structures and usage counts from an ERPNext .sql.gz backup.

Writes, for every table in TABLES:
  <out>/<table>.sql   the CREATE TABLE statement exactly as dumped
and prints a compact summary: row count (optionally filtered by parenttype /
reference doctype) and the number of columns that are non-empty in that set.

Usage: python -I erpnext_schema.py <database.sql.gz> <out dir>
Standard library only.
"""
import gzip
import os
import re
import sys
from collections import Counter

TABLES = [
    # The Purchase Order and its child tables
    "tabPurchase Order", "tabPurchase Order Item", "tabPurchase Taxes and Charges",
    "tabServices Items", "tabPayment Schedule", "tabPurchase Order Item Supplied",
    "tabPricing Rule Detail",
    # Parties and their addresses / contacts
    "tabSupplier", "tabSupplier Group", "tabCustomer", "tabCompany",
    "tabAddress", "tabContact", "tabContact Email", "tabContact Phone", "tabDynamic Link",
    # Items
    "tabItem", "tabItem Group", "tabUOM", "tabUOM Conversion Detail", "tabItem Default",
    "tabItem Tax", "tabItem Supplier",
    # Templates and lookups the PO fields point at
    "tabPurchase Taxes and Charges Template", "tabItem Tax Template", "tabItem Tax Template Detail",
    "tabPayment Terms Template", "tabPayment Terms Template Detail", "tabPayment Term",
    "tabTerms and Conditions", "tabTax Category", "tabWarehouse", "tabCost Center", "tabProject",
    "tabAccount", "tabCurrency", "tabCurrency Exchange", "tabPrice List", "tabLetter Head",
    "tabSeries",
    # People and history
    "tabUser", "tabHas Role", "tabVersion", "tabComment", "tabCommunication", "tabFile",
    # Documents that link back to a PO (for the Connections tab)
    "tabPurchase Receipt Item", "tabPurchase Invoice Item", "tabMaterial Request",
]

# Which rows count, per table (None = all rows).
SCOPE = {
    "tabPurchase Taxes and Charges": ("parenttype", "Purchase Order"),
    "tabServices Items": ("parenttype", "Purchase Order"),
    "tabPayment Schedule": ("parenttype", "Purchase Order"),
    "tabPurchase Order Item Supplied": ("parenttype", "Purchase Order"),
    "tabPricing Rule Detail": ("parenttype", "Purchase Order"),
    "tabVersion": ("ref_doctype", "Purchase Order"),
    "tabComment": ("reference_doctype", "Purchase Order"),
    "tabCommunication": ("reference_doctype", "Purchase Order"),
    "tabFile": ("attached_to_doctype", "Purchase Order"),
}

CREATE_RE = re.compile(r"^CREATE TABLE `([^`]+)` \(")
COL_RE = re.compile(r"^\s+`([^`]+)`\s+(\S+)")
INSERT_RE = re.compile(r"^INSERT INTO `([^`]+)` VALUES ")
TOKEN_RE = re.compile(r"'(?:[^'\\]|\\.)*'|NULL|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|0x[0-9A-Fa-f]+|[(),]", re.S)


def tuples(body):
    row, depth = None, 0
    for m in TOKEN_RE.finditer(body):
        t = m.group(0)
        if t == "(":
            depth += 1
            if depth == 1:
                row = []
        elif t == ")":
            depth -= 1
            if depth == 0:
                yield row
        elif t != "," and depth == 1:
            row.append(None if t == "NULL" else t)


def empty(v):
    return v is None or v in ("''", "0", "0.000000000", "'0'", "'0000-00-00'")


def main():
    dump, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    wanted = set(TABLES)
    cols, ddl, rows, filled = {}, {}, Counter(), {}
    current, buf = None, []
    with gzip.open(dump, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if current is not None:
                buf.append(line)
                m = COL_RE.match(line)
                if m:
                    cols[current].append((m.group(1), m.group(2)))
                if line.startswith(")"):
                    ddl[current] = "".join(buf)
                    current, buf = None, []
                continue
            m = CREATE_RE.match(line)
            if m and m.group(1) in wanted:
                current, buf = m.group(1), [line]
                cols[current] = []
                continue
            m = INSERT_RE.match(line)
            if m and m.group(1) in wanted:
                t = m.group(1)
                names = [c for c, _ in cols[t]]
                scope = SCOPE.get(t)
                idx = names.index(scope[0]) if scope else None
                nonempty = filled.setdefault(t, Counter())
                for r in tuples(line[m.end():]):
                    if scope and r[idx] != f"'{scope[1]}'":
                        continue
                    rows[t] += 1
                    for n, v in zip(names, r):
                        if not empty(v):
                            nonempty[n] += 1
    for t in TABLES:
        if t not in ddl:
            print(f"{t}: NOT IN DUMP")
            continue
        safe = t.replace("tab", "", 1).replace(" ", "_").lower()
        with open(os.path.join(out, f"{safe}.sql"), "w", encoding="utf-8") as fh:
            fh.write(ddl[t])
        used = sum(1 for c, _ in cols[t] if filled.get(t, {}).get(c))
        scope = f" [{SCOPE[t][0]}={SCOPE[t][1]}]" if t in SCOPE else ""
        print(f"{t}{scope}: {rows[t]} rows, {len(cols[t])} columns, {used} ever filled")


main()
