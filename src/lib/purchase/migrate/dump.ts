// Reads an ERPNext (MariaDB) backup — the "...-database.sql.gz" file from the
// old site's Download Backups page — straight from disk, no database needed.
//
// mysqldump writes each table as `CREATE TABLE \`tabX\` (...)` followed by
// extended inserts `INSERT INTO \`tabX\` VALUES (...),(...);` with strings in
// single quotes and backslash escapes. Only the tables asked for are parsed;
// rows can be filtered while reading so large tables (Version, Comment) keep
// only what the Purchase Order needs. Pure Node — no Prisma, no Next — so the
// importer's CLI and the unit tests share it.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

/** One source row: column name → raw value (string, or null for SQL NULL). */
export type Row = Record<string, string | null>;

export interface TableSpec {
  table: string;
  /** Keep only matching rows (applied while reading). */
  where?: (row: Row) => boolean;
  /** Keep only these columns (saves memory on wide tables). */
  columns?: readonly string[];
}

export interface DumpTable {
  columns: { name: string; type: string }[];
  rows: Row[];
  /** Rows seen in the dump before `where` was applied. */
  scanned: number;
}

const CREATE_RE = /^CREATE TABLE `([^`]+)` \(/;
const COL_RE = /^\s+`([^`]+)`\s+(\S+)/;
const INSERT_RE = /^INSERT INTO `([^`]+)` VALUES /;

const ESCAPES: Record<string, string> = {
  "0": "\0",
  "'": "'",
  '"': '"',
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
  "\\": "\\",
};

/**
 * Parses the VALUES part of one extended INSERT into rows of raw values.
 * Strings are unescaped; NULL becomes null; numbers stay as their text.
 */
export function parseValues(body: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  const n = body.length;
  let i = 0;
  for (;;) {
    while (i < n && body[i] !== "(") i++;
    if (i >= n) break;
    i++;
    const row: (string | null)[] = [];
    for (;;) {
      while (body[i] === " ") i++;
      const c = body[i];
      if (c === "'") {
        i++;
        let out = "";
        for (;;) {
          const q = body.indexOf("'", i);
          const b = body.indexOf("\\", i);
          if (q === -1) throw new Error("Unterminated string in dump");
          if (b !== -1 && b < q) {
            out += body.slice(i, b);
            const e = body[b + 1];
            out += ESCAPES[e] ?? `\\${e}`;
            i = b + 2;
            continue;
          }
          out += body.slice(i, q);
          i = q + 1;
          break;
        }
        row.push(out);
      } else if (body.startsWith("NULL", i)) {
        row.push(null);
        i += 4;
      } else {
        let j = i;
        while (j < n && body[j] !== "," && body[j] !== ")") j++;
        row.push(body.slice(i, j).trim());
        i = j;
      }
      if (body[i] === ",") {
        i++;
        continue;
      }
      if (body[i] === ")") {
        i++;
        break;
      }
      throw new Error(`Unexpected character ${JSON.stringify(body[i])} in dump at ${i}`);
    }
    rows.push(row);
  }
  return rows;
}

/** Streams the dump once and returns the requested tables. */
export async function readDump(path: string, specs: readonly TableSpec[]): Promise<Map<string, DumpTable>> {
  const bySpec = new Map(specs.map((s) => [s.table, s]));
  const out = new Map<string, DumpTable>();
  let current: string | null = null;

  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (current) {
      const col = COL_RE.exec(line);
      if (col) {
        out.get(current)!.columns.push({ name: col[1], type: col[2] });
        continue;
      }
      current = null;
    }
    const create = CREATE_RE.exec(line);
    if (create) {
      if (bySpec.has(create[1])) {
        current = create[1];
        out.set(current, { columns: [], rows: [], scanned: 0 });
      }
      continue;
    }
    const insert = INSERT_RE.exec(line);
    if (!insert || !bySpec.has(insert[1])) continue;
    const spec = bySpec.get(insert[1])!;
    const table = out.get(insert[1]);
    if (!table) throw new Error(`INSERT before CREATE for ${insert[1]}`);
    const names = table.columns.map((c) => c.name);
    const keep = spec.columns ? new Set(spec.columns) : null;
    for (const values of parseValues(line.slice(insert[0].length))) {
      table.scanned++;
      if (values.length !== names.length) {
        throw new Error(`${insert[1]}: row has ${values.length} values for ${names.length} columns`);
      }
      const row: Row = {};
      for (let k = 0; k < names.length; k++) {
        if (!keep || keep.has(names[k])) row[names[k]] = values[k];
      }
      if (!spec.where || spec.where(row)) table.rows.push(row);
    }
  }

  for (const s of specs) {
    if (!out.has(s.table)) throw new Error(`Table ${s.table} is not in the backup`);
  }
  return out;
}
