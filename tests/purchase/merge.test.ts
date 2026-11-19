// Step 9: what the merge into the Main ERP takes from this schema stays in step with it
// (merge/purchase-schema-block.prisma and merge/purchase-module.sql, made by `npm run merge:sql`).
// A schema change without a re-run fails here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const schema = read("prisma/schema.prisma");
const block = read("merge/purchase-schema-block.prisma");
const sql = read("merge/purchase-module.sql");

/** The schema up to its STANDALONE ONLY section: what the merge carries. */
const carried = schema.slice(0, schema.indexOf("// STANDALONE ONLY"));
const names = (text: string, kind: "model" | "enum") => [...text.matchAll(new RegExp(`^${kind} (\\w+) \\{`, "gm"))].map((m) => m[1]).sort();
const maps = (text: string) => [...text.matchAll(/@@map\("(purchase_\w+)"\)/g)].map((m) => m[1]).sort();

describe("the merge files", () => {
  it("carry every model and enum but the standalone sign-in", () => {
    expect(names(block, "model")).toEqual(names(carried, "model"));
    expect(names(block, "enum")).toEqual(names(carried, "enum"));
    expect(block).not.toMatch(/PurchaseLogin/);
    expect(names(schema, "model")).toContain("PurchaseLogin");
  });

  it("are the schema's own text, model for model", () => {
    for (const m of names(carried, "model")) {
      const body = (text: string) => new RegExp(`^model ${m} \\{[\\s\\S]*?^\\}`, "m").exec(text)?.[0];
      expect(body(block), m).toBe(body(carried));
    }
  });

  it("create every table and enum type of the block, and nothing of the sign-in", () => {
    for (const t of maps(carried)) expect(sql, t).toMatch(new RegExp(`(CREATE TABLE IF NOT EXISTS|CREATE TYPE) "${t}"`));
    // The statements, not the header that explains what is left out.
    const statements = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(statements).not.toMatch(/purchase_logins?\b|purchase_login_role/);
  });

  it("add the PURCHASE role value before the transaction, and log once", () => {
    expect(sql.indexOf(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PURCHASE';`)).toBeLessThan(sql.indexOf("\nBEGIN;"));
    expect(sql).toMatch(/INSERT INTO action_log/);
    expect(sql.trimEnd()).toMatch(/leave the value in place\.$/);
  });
});
