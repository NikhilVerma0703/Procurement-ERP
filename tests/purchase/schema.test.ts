import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Pins the schema conventions the merge into the Main ERP depends on
// (as the Main ERP's tests/pigmentSchema0146.test.ts pins Pigment's): every
// model Purchase*, every table and enum type purchase_*, money as
// numeric(21,9), and the migration identities (code / number / erpnext_name)
// plus the `legacy` copy on everything the importer brings across.

const schema = readFileSync(fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)), "utf8");

type Block = { kind: "model" | "enum"; name: string; body: string };
const blocks: Block[] = [...schema.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => ({
  kind: m[1] as Block["kind"],
  name: m[2],
  body: m[3],
}));
const models = blocks.filter((b) => b.kind === "model");
const enums = blocks.filter((b) => b.kind === "enum");
const mapOf = (b: Block) => b.body.match(/@@map\("([^"]+)"\)/)?.[1];
const fieldLines = (b: Block) =>
  b.body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[a-z]\w*\s+\S/.test(l) && !l.startsWith("//"));

describe("purchase schema conventions", () => {
  it("has the whole PO ecosystem", () => {
    expect(models.length).toBeGreaterThanOrEqual(40);
    for (const name of ["PurchaseOrder", "PurchaseOrderItem", "PurchaseOrderTax", "PurchaseOrderCostOverhead",
      "PurchaseOrderPaymentSchedule", "PurchaseSupplier", "PurchaseItem", "PurchaseAddress", "PurchaseContact"]) {
      expect(models.map((m) => m.name)).toContain(name);
    }
  });

  it("names every model Purchase* and maps it to a purchase_* table", () => {
    for (const m of models) {
      expect(m.name.startsWith("Purchase"), m.name).toBe(true);
      expect(mapOf(m)?.startsWith("purchase_"), `${m.name} → ${mapOf(m)}`).toBe(true);
    }
  });

  it("maps every enum to a purchase_* type, stored with ERPNext's labels", () => {
    for (const e of enums) {
      expect(e.name.startsWith("Purchase"), e.name).toBe(true);
      expect(mapOf(e)?.startsWith("purchase_"), e.name).toBe(true);
      const values = e.body.split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+\s/.test(l));
      for (const v of values) expect(v, `${e.name}: ${v}`).toMatch(/@map\("[^"]+"\)/);
    }
  });

  it("stores every Decimal as numeric(21,9), as ERPNext does", () => {
    for (const m of models) {
      for (const line of fieldLines(m).filter((l) => /\sDecimal\??\s|\sDecimal\??$/.test(l))) {
        expect(line, `${m.name}: ${line}`).toContain("@db.Decimal(21, 9)");
      }
    }
  });

  it("maps camelCase columns to snake_case", () => {
    for (const m of models) {
      for (const line of fieldLines(m)) {
        const [field, type] = line.split(/\s+/);
        const isRelation = /^Purchase\w+(\[\])?\??$/.test(type);
        if (isRelation || !/[A-Z]/.test(field)) continue;
        expect(line, `${m.name}.${field}`).toMatch(/@map\("[a-z0-9_]+"\)/);
      }
    }
  });

  it("keeps the ERPNext identity and the original row on the documents and masters", () => {
    const identity = /^(code|number)\s|^erpnextName\s|^name\s+String\s+@id|^code\s+String\s+@id|^prefix\s|^email\s+String\s+@id/m;
    // Not ERPNext records: the import log, the PO's links, the file store (keyed by each file's place,
    // which comes from the old site's file URL), and the standalone app's sign-in accounts.
    // Likes were a column on the old site (_liked_by), not a doctype: no ERPNext name to keep.
    // Assignments, tags and saved filters (26-11-2026) start empty here: the old site had none to bring over
    // (0 to-dos and 0 tags on its records, read 26-11-2026), so they keep no ERPNext name either.
    const own = new Set(["PurchaseImportRun", "PurchaseOrderLink", "PurchaseFile", "PurchaseLogin", "PurchaseLike", "PurchaseAssignment", "PurchaseTag", "PurchaseSavedFilter"]);
    for (const m of models.filter((x) => !own.has(x.name))) {
      expect(identity.test(fieldLines(m).join("\n")), `${m.name} has no ERPNext identity`).toBe(true);
    }
    for (const name of ["PurchaseOrder", "PurchaseOrderItem", "PurchaseOrderTax", "PurchaseOrderCostOverhead",
      "PurchaseOrderPaymentSchedule", "PurchaseSupplier", "PurchaseItem", "PurchaseAddress", "PurchaseContact"]) {
      const m = models.find((x) => x.name === name)!;
      expect(fieldLines(m).some((l) => l.startsWith("legacy ")), `${name} keeps legacy`).toBe(true);
    }
  });

  it("deletes a PO's own rows with it, and nothing it merely refers to", () => {
    for (const name of ["PurchaseOrderItem", "PurchaseOrderTax", "PurchaseOrderCostOverhead", "PurchaseOrderPaymentSchedule"]) {
      const m = models.find((x) => x.name === name)!;
      expect(m.body).toMatch(/order\s+PurchaseOrder\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Cascade\)/);
    }
    const order = models.find((x) => x.name === "PurchaseOrder")!;
    expect(order.body).not.toMatch(/onDelete: Cascade/);
  });
});
