// One import of the old ERPNext site's data, start to finish:
//   1. find the backup (newest in the folder, or the one named) and checksum it;
//   2. read the tables the Purchase Order needs and map them (./build);
//   3. refuse if POs were already raised in this system (./load);
//   4. load everything in one transaction (./load);
//   5. restore the PO attachments and the letter-head logo (./files);
//   6. reconcile against the backup and write the report (./reconcile);
//   7. record the run in purchase_import_runs.
// `dryRun` stops after step 2 and reports what would be imported.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { build, SOURCE_TABLES } from "./build";
import { readDump } from "./dump";
import { restoreFiles } from "./files";
import { assertReloadAllowed, loadAll } from "./load";
import { reconcile } from "./reconcile";

export interface ImportOptions {
  /** Folder holding the three backup files (…-database.sql.gz, …-files.tar, …-private-files.tar). */
  backupDir: string;
  /** Which backup, e.g. "20261116_110221-pacificengineeredsurfaces_m_frappe_cloud"; default: the newest. */
  prefix?: string;
  /** Where restored files go (the module's file store). */
  storeRoot: string;
  /** Where the reconciliation report is written. */
  reportDir: string;
  force?: boolean;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface ImportResult {
  ok: boolean;
  reportPath: string;
  runId?: string;
}

async function sha256(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

async function resolveBackup(dir: string, prefix?: string) {
  const dbFiles = (await readdir(dir)).filter((f) => f.endsWith("-database.sql.gz")).sort();
  const chosen = prefix ? `${prefix}-database.sql.gz` : dbFiles.at(-1);
  if (!chosen || !dbFiles.includes(chosen)) throw new Error(`No backup ${prefix ?? ""} in ${dir}`);
  const p = chosen.replace(/-database\.sql\.gz$/, "");
  return {
    prefix: p,
    database: join(dir, chosen),
    publicTar: join(dir, `${p}-files.tar`),
    privateTar: join(dir, `${p}-private-files.tar`),
  };
}

export async function runImport(db: PrismaClient, opts: ImportOptions): Promise<ImportResult> {
  const log = opts.log ?? (() => {});
  const backup = await resolveBackup(opts.backupDir, opts.prefix);
  log(`Backup: ${backup.prefix}`);
  const checksum = await sha256(backup.database);
  log(`SHA-256: ${checksum}`);

  log("Reading the backup…");
  const tables = await readDump(backup.database, SOURCE_TABLES);
  log("Mapping to the new model…");
  const built = build(tables);
  log(`  ${built.orders.length} POs, ${built.orderItems.length} lines, ${built.issues.length} issue(s) noted`);

  await mkdir(opts.reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

  if (opts.dryRun) {
    const reportPath = join(opts.reportDir, `import-dry-run-${stamp}.md`);
    const lines = [
      `# ERPNext import — dry run (${backup.prefix})`, "",
      ...Object.entries(built).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `- ${k}: ${(v as unknown[]).length}`),
      "", `## Issues (${built.issues.length})`, "", ...built.issues.map((i) => `- ${i}`),
    ];
    await writeFile(reportPath, lines.join("\n") + "\n", "utf8");
    return { ok: true, reportPath };
  }

  await assertReloadAllowed(db, !!opts.force);
  const run = await db.purchaseImportRun.create({
    data: { sourceFile: `${backup.prefix}-database.sql.gz`, sourceSha256: checksum, status: "running" },
  });

  try {
    log("Loading (one transaction)…");
    const loaded = await loadAll(db, built, log);

    log("Restoring attachments and the letter-head logo…");
    const wanted = [
      ...built.attachments.map((a) => ({ fileUrl: a.fileUrl })),
      ...built.letterHeads.filter((l) => l.image).map((l) => ({ fileUrl: l.image! })),
    ];
    const files = await restoreFiles(backup, wanted, opts.storeRoot);
    for (const f of files.filter((x) => x.storagePath)) {
      await db.purchaseAttachment.updateMany({ where: { fileUrl: f.fileUrl }, data: { storagePath: f.storagePath } });
    }

    log("Reconciling against the backup…");
    const result = await reconcile(db, built, tables, loaded, files);
    const reportPath = join(opts.reportDir, `import-${stamp}.md`);
    const header = `Backup \`${backup.prefix}\` · SHA-256 \`${checksum}\` · run \`${run.id}\` · ${new Date().toISOString()}\n\n`;
    await writeFile(reportPath, result.markdown.replace(/\n\n/, `\n\n${header}`), "utf8");

    await db.purchaseImportRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: result.ok ? "ok" : "differences",
        counts: loaded,
        report: {
          ok: result.ok,
          failed: result.checks.filter((c) => !c.ok).map((c) => ({ ...c })),
          issues: result.issues.length,
          reportFile: reportPath,
        },
      },
    });
    return { ok: result.ok, reportPath, runId: run.id };
  } catch (err) {
    await db.purchaseImportRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "failed", report: { error: String(err instanceof Error ? err.message : err) } },
    });
    throw err;
  }
}
