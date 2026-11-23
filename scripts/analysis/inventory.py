"""Count every table's rows in an ERPNext .sql.gz backup, and list the site's DocTypes.

Phase II (21-11-2026): before the old site shuts down, prove that a backup holds everything
the Buying and Stock modules use, by comparing these counts with the live site's.

Writes <out>.json: {"tables": {table: rows}, "doctypes": [{name, module, custom, istable,
issingle, is_submittable}]}.

Usage: python -I inventory.py <database.sql.gz> <out.json>
Standard library only; streams the dump (never loads it whole).
"""
import gzip
import json
import re
import sys

INSERT = re.compile(r"^INSERT INTO `([^`]+)` VALUES ")
CREATE = re.compile(r"^CREATE TABLE `([^`]+)`")
COLUMN = re.compile(r"^\s+`([^`]+)` ")
# A quoted string (skipped whole, so a "),(" inside it never counts) or a row boundary.
TOKEN = re.compile(r"'(?:[^'\\]|\\.)*'|\),\(")
# One row's values: quoted strings, NULL, numbers.
VALUE = re.compile(r"'((?:[^'\\]|\\.)*)'|(NULL)|([-0-9.eE+]+)")

WANT_ROWS = {"tabDocType": ["name", "module", "custom", "istable", "issingle", "is_submittable"]}


def unescape(s):
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t", "r": "\r", "0": "\0"}.get(m.group(1), m.group(1)), s)


def rows_of(body):
    """Split one INSERT's VALUES body into rows of python values."""
    out, row, depth, i = [], [], 0, 0
    # body looks like (v,v,...),(v,...);
    for m in re.finditer(r"'(?:[^'\\]|\\.)*'|NULL|[-0-9.eE+]+|\(|\)", body):
        t = m.group(0)
        if t == "(":
            row = []
        elif t == ")":
            out.append(row)
        elif t == "NULL":
            row.append(None)
        elif t.startswith("'"):
            row.append(unescape(t[1:-1]))
        else:
            row.append(t)
    return out


def main(path, out_path):
    tables, columns, current, kept = {}, {}, None, {t: [] for t in WANT_ROWS}
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = CREATE.match(line)
            if m:
                current = m.group(1)
                columns[current] = []
                tables.setdefault(current, 0)
                continue
            if current and line.startswith("  `"):
                c = COLUMN.match(line)
                if c:
                    columns[current].append(c.group(1))
                continue
            m = INSERT.match(line)
            if m:
                table = m.group(1)
                body = line[m.end():]
                n = 1 + sum(1 for t in TOKEN.finditer(body) if t.group(0) == "),(")
                tables[table] = tables.get(table, 0) + n
                if table in WANT_ROWS:
                    cols = columns[table]
                    for r in rows_of(body):
                        rec = dict(zip(cols, r))
                        kept[table].append({k: rec.get(k) for k in WANT_ROWS[table]})
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"tables": tables, "doctypes": kept["tabDocType"]}, f, indent=1, sort_keys=True)
    print(f"{len(tables)} tables, {sum(1 for v in tables.values() if v)} with rows, {len(kept['tabDocType'])} doctypes -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
