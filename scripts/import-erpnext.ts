// Import the old ERPNext site's Purchase Order data into this database.
//
//   npm run import:erpnext                     # newest backup in data/erpnext-backup
//   npm run import:erpnext -- --dry-run        # read and map only; nothing written
//   npm run import:erpnext -- --prefix <name>  # a specific backup
//   npm run import:erpnext -- --force          # reload even if POs were raised here (wipes them)
//   npm run import:erpnext -- --target <host>  # load a database that is not on this machine
//   npm run verify:erpnext                     # read-only: does the database still equal the backup?
//
// A reload, all-or-nothing (src/lib/purchase/migrate/load.ts). The
// reconciliation report goes to data/reports/; attachments and the logo to the
// module's file store, the purchase_files table.
//
// WHICH DATABASE: the one Prisma would use from this checkout (the shell's
// DATABASE_URL, else .env), printed as host/database before anything runs. The
// importer writes to a database on another machine only when --target names
// that host (lib/purchase/migrate/target.ts): in the Main ERP the repo's .env
// is production by convention. --verify and --dry-run write nothing.
// Exit code: 0 everything matches, 2 imported with differences, 1 failed or refused.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { runImport, runVerify } from "@/lib/purchase/migrate/run";
import { databaseLabel, importTargetRefusal, prismaDatabaseUrl } from "@/lib/purchase/migrate/target";

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

// The repository root: npm runs scripts there (here, and from scripts/purchase/ in the Main ERP).
const root = process.cwd();
const read = (file: string) => {
  const p = join(root, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const url = prismaDatabaseUrl(process.env, read);
const verify = args.includes("--verify");
const dryRun = args.includes("--dry-run");

console.log(`Database: ${databaseLabel(url)}${verify ? " (read-only check)" : dryRun ? " (dry run: not touched)" : ""}`);
if (!verify && !dryRun) {
  const refusal = importTargetRefusal(url, valueOf("--target"));
  if (refusal) {
    console.error(`\n✗ ${refusal}`);
    process.exit(1);
  }
}

// The URL just checked is the one used, whatever else the environment holds.
const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
const started = Date.now();
const options = {
  backupDir: resolve(root, valueOf("--backup-dir") ?? "data/erpnext-backup"),
  prefix: valueOf("--prefix"),
  reportDir: resolve(root, "data/reports"),
  log: (m: string) => console.log(m),
};

(verify ? runVerify(db, options) : runImport(db, { ...options, force: args.includes("--force"), dryRun }))
  .then((r) => {
    const verdict = verify
      ? r.ok
        ? "✓ The database holds exactly what the backup has."
        : "⚠ The database differs from the backup — read the report."
      : r.ok
        ? "✓ Import matches the backup."
        : "⚠ Imported, with differences — read the report.";
    console.log(`\n${verdict}`);
    console.log(`Report: ${r.reportPath}`);
    console.log(`Took ${Math.round((Date.now() - started) / 1000)} s`);
    process.exitCode = r.ok ? 0 : 2;
  })
  .catch((e) => {
    console.error(`\n✗ ${verify ? "Verify failed" : "Import failed — the database was left as it was"}.\n${e instanceof Error ? e.stack ?? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
