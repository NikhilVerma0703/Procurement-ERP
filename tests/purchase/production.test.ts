// What keeps production safe and inside Vercel's limits (19-11-2026): which database the importer may
// load, the bulk actions sent in turns, and the upload and print limits. Made-up data only.
import { describe, expect, it } from "vitest";
import { deleteInBatches, inBatches } from "@/components/purchase/list/batches";
import type { BulkOutcome } from "@/lib/purchase/bulk-delete";
import {
  databaseHost, databaseLabel, dotEnvValue, importTargetRefusal, localDatabaseRefusal, prismaDatabaseUrl,
} from "@/lib/purchase/migrate/target";
import { ATTACHMENT_TOO_BIG, MAX_ATTACHMENT_BYTES } from "@/lib/purchase/orders/attachment-limit";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import { BULK_BATCH, MAX_PRINT_BYTES, MAX_PRINT_SHEETS, TOO_MANY_TO_PRINT } from "@/lib/purchase/orders/selection";

const NEON = "postgresql://someone:secret@ep-example-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://me:pw@localhost:5432/procurement_erp";

describe("which database the importer may load", () => {
  it("reads the URL Prisma would use: the shell's, else .env, else prisma/.env", () => {
    const files: Record<string, string> = { ".env": `# comment\nDATABASE_URL="${LOCAL}"\n`, "prisma/.env": `DATABASE_URL=${NEON}` };
    const read = (f: string) => files[f] ?? null;
    expect(prismaDatabaseUrl({ DATABASE_URL: NEON }, read)).toBe(NEON);
    expect(prismaDatabaseUrl({}, read)).toBe(LOCAL);
    expect(prismaDatabaseUrl({}, (f) => (f === "prisma/.env" ? files[f] : null))).toBe(NEON);
    expect(prismaDatabaseUrl({}, () => null)).toBe("");
    expect(dotEnvValue("export DATABASE_URL=abc # note\nDATABASE_URL='last'", "DATABASE_URL")).toBe("last");
  });

  it("names the database by host, never with the user or password", () => {
    expect(databaseHost(NEON)).toBe("ep-example-123.ap-southeast-1.aws.neon.tech");
    expect(databaseLabel(NEON)).toBe("ep-example-123.ap-southeast-1.aws.neon.tech/neondb");
    expect(databaseLabel(NEON)).not.toContain("secret");
    expect(databaseHost("not a url")).toBeNull();
  });

  it("loads this machine's database, and another only when --target names its host", () => {
    expect(importTargetRefusal(LOCAL, undefined)).toBeNull();
    expect(importTargetRefusal("postgresql://u:p@127.0.0.1/x", undefined)).toBeNull();
    expect(importTargetRefusal(NEON, undefined)).toContain("--target ep-example-123.ap-southeast-1.aws.neon.tech");
    expect(importTargetRefusal(NEON, "ep-other.neon.tech")).not.toBeNull();
    expect(importTargetRefusal(NEON, "EP-EXAMPLE-123.ap-southeast-1.aws.neon.tech")).toBeNull();
    // A host only looks local when it is: "localhost" in the password does not count.
    expect(importTargetRefusal("postgresql://u:localhost@db.example.com/x", undefined)).not.toBeNull();
    expect(importTargetRefusal("", undefined)).toContain("not set");
    expect(importTargetRefusal("::garbage", undefined)).toContain("could not be read");
  });

  it("keeps the local-only commands (db:migrate) off any other database", () => {
    expect(localDatabaseRefusal(LOCAL, "npm run db:migrate")).toBeNull();
    expect(localDatabaseRefusal(NEON, "npm run db:migrate")).toContain("not this machine");
  });
});

describe("bulk actions in turns", () => {
  const ok = (done: string[], failed: string[] = []): ActionResult<BulkOutcome> => ({
    ok: true,
    value: { done: done.map((id) => ({ id, name: id })), failed: failed.map((id) => ({ id, name: id, error: `no ${id}` })) },
  });

  it("sends at most BULK_BATCH a request, in order, and adds the outcomes up", async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `po${String(i).padStart(2, "0")}`);
    const sent: number[] = [];
    const progress: string[] = [];
    const r = await inBatches(ids, async (batch) => (sent.push(batch.length), ok(batch)), (d, t) => progress.push(`${d}/${t}`));
    expect(BULK_BATCH).toBe(20);
    expect(sent).toEqual([20, 20, 5]);
    expect(progress).toEqual(["20/45", "40/45", "45/45"]);
    expect(r.ok && r.value.done.map((d) => d.id)).toEqual(ids);
  });

  it("stops at a refusal: what was done stays done, the rest is listed with the reason", async () => {
    let calls = 0;
    const r = await inBatches(["a", "b", "c", "d"], async (batch) => (++calls === 1 ? ok(batch) : { ok: false, error: "You are not permitted to do this." }), undefined, 2);
    expect(r.ok && r.value.done.map((d) => d.id)).toEqual(["a", "b"]);
    expect(r.ok && r.value.failed).toEqual([
      { id: "c", name: "", error: "You are not permitted to do this." },
      { id: "d", name: "", error: "You are not permitted to do this." },
    ]);
    // Refused before anything was done: the refusal itself is the answer.
    expect(await inBatches(["a"], async () => ({ ok: false, error: "Not signed in" }))).toEqual({ ok: false, error: "Not signed in" });
  });

  it("deletes newest name first, and again across turns for what another's deletion frees", async () => {
    // "B" can go only once "A" has gone; with turns of one, A comes after B (newest first).
    const gone = new Set<string>();
    const order: string[] = [];
    const r = await deleteInBatches(
      [{ id: "A", name: "A" }, { id: "B", name: "B" }, { id: "X", name: "X" }],
      async (batch) => {
        order.push(...batch);
        const done = batch.filter((id) => id !== "X" && (id !== "B" || gone.has("A")));
        done.forEach((id) => gone.add(id));
        return ok(done, batch.filter((id) => !done.includes(id)));
      },
      undefined,
      1,
    );
    expect(order).toEqual(["X", "B", "A", "X", "B", "X"]);
    expect(r.ok && r.value.done.map((d) => d.id)).toEqual(["A", "B"]);
    expect(r.ok && r.value.failed.map((f) => f.id)).toEqual(["X"]);
  });
});

describe("Vercel's request and answer sizes", () => {
  it("takes uploads up to 4,000,000 bytes, as the Main ERP's Lab module", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(4_000_000);
    expect(ATTACHMENT_TOO_BIG).toBe("File size exceeded the maximum allowed size of 4.0 MB");
  });

  it("prints at most 40 sheets a file, which stays under 4.5 MB at the largest sheet measured", () => {
    expect(MAX_PRINT_SHEETS).toBe(40);
    expect(TOO_MANY_TO_PRINT).toBe("You can only print upto 40 documents at a time");
    expect(MAX_PRINT_SHEETS * 93 * 1024).toBeLessThan(MAX_PRINT_BYTES);
    expect(MAX_PRINT_BYTES).toBeLessThan(4_500_000);
  });
});
