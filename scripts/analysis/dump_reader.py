"""Stream an ERPNext (MariaDB) .sql.gz backup: column names/types and row values of chosen tables.

Shared by the analysis scripts (moved out of export_po_excel.py on 21-11-2026 so the Phase II
extractors need no Excel library). Standard library only; never loads the dump whole.
"""
import gzip
import re
from collections import defaultdict

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
