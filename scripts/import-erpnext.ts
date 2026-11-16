// Import the old ERPNext site's Purchase Order data into this database.
//
//   npm run import:erpnext                     # newest backup in data/erpnext-backup
//   npm run import:erpnext -- --dry-run        # read and map only; nothing written
//   npm run import:erpnext -- --prefix <name>  # a specific backup
//   npm run import:erpnext -- --force          # reload even if POs were raised here (wipes them)
//
// A reload, all-or-nothing (src/lib/purchase/migrate/load.ts). The
// reconciliation report goes to data/reports/; attachments to the module's
// file store (data/storage/purchase, or PURCHASE_FILE_STORE).
// Exit code: 0 everything matches, 2 imported with differences, 1 failed.
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { runImport } from "../src/lib/purchase/migrate/run";

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const root = resolve(__dirname, "..");
const db = new PrismaClient();
const started = Date.now();

runImport(db, {
  backupDir: resolve(root, valueOf("--backup-dir") ?? "data/erpnext-backup"),
  prefix: valueOf("--prefix"),
  storeRoot: resolve(root, process.env.PURCHASE_FILE_STORE ?? "data/storage/purchase"),
  reportDir: resolve(root, "data/reports"),
  force: args.includes("--force"),
  dryRun: args.includes("--dry-run"),
  log: (m) => console.log(m),
})
  .then((r) => {
    console.log(`\n${r.ok ? "✓ Import matches the backup." : "⚠ Imported, with differences — read the report."}`);
    console.log(`Report: ${r.reportPath}`);
    console.log(`Took ${Math.round((Date.now() - started) / 1000)} s`);
    process.exitCode = r.ok ? 0 : 2;
  })
  .catch((e) => {
    console.error(`\n✗ Import failed — the database was left as it was.\n${e instanceof Error ? e.stack ?? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
