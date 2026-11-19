# Step 3: data migration from the old ERPNext site

**Status:** done for review (16-11-2026). The backup of 16-11-2026 11:02 is imported into the local database
`procurement_erp`, and the reconciliation matches the backup on every check.

**Code:** `src/lib/purchase/migrate/`
**Run with:** `npm run import:erpnext`
**Tests:** `tests/purchase/migrate.test.ts`

## How it works

| Step | File | What it does |
|---|---|---|
| Read | `dump.ts` | Streams the backup's `…-database.sql.gz` directly; no ERPNext needed. Only the tables the PO needs are read, filtered while reading. |
| Map | `build.ts`, `convert.ts` | ERPNext rows → the new tables (`docs/02-data-model.md`). ERPNext names become foreign keys. Times are converted from the old site's Asia/Kolkata to UTC. Money stays exact. |
| Load | `load.ts` | **One transaction:** empties the module's tables, then inserts everything in dependency order. Any failure rolls back, and the database is left exactly as it was. |
| Likes | `build.ts` | Each record's `_liked_by` list (POs and the masters) becomes rows of `purchase_likes`, one per liker. The backup has none; the rows are there for the final backup. |
| Files | `files.ts` | Copies the PO attachments and the letter-head logo out of the backup's file archives into the module's file store, the `purchase_files` table (a folder, `data/storage/purchase/files/`, until Step 9). |
| Check | `reconcile.ts` | Compares the result with the backup and writes the report to `data/reports/`. |
| Record | `run.ts` | Logs every run (backup file, SHA-256, counts, verdict) in `purchase_import_runs`. |

**Rules that keep it safe and faithful:**
- **Stable IDs.** A record's ID is derived from its ERPNext name. Importing a later backup gives the same records the
  same IDs.
- **Nothing silently dropped or invented.**
  - Every row that cannot be stored is listed in the report. These are orphans in ERPNext itself.
  - So is every link that cannot be resolved.
  - A link a record cannot exist without (supplier, item, account, unit) would get a reported placeholder, so no PO
    is ever lost. This import needed none.
- **Values kept as recorded.**
  - The add-on's choice fields are stored as text, so the 16 POs that say "Air / Ship" keep it.
  - Payment-term names that ERPNext later renamed are kept beside the link.
- **Every original row** is kept in `legacy` on documents and masters.
- **Reload guard.** The import refuses to run if POs have already been raised in this system, because a reload would
  wipe them. Since 19-11-2026 it also refuses when anything changed after the last import: a row added or removed in
  any module table (a comment, a like, an upload, a deleted draft), or a PO or master saved after it. After go-live
  that is what stops the old site's data being loaded over the team's work. `--force` overrides this, deliberately.
- **Which database.** It prints `Database: <host>/<database>` first (never the user or password). It writes to a
  database on another machine only when `--target <that host>` names it, because in the Main ERP the repo's `.env`
  is production by convention (`lib/purchase/migrate/target.ts`).
- **Read-only proof.** `npm run verify:erpnext` compares a loaded database with the backup without writing: every
  count, money total, relation and spot check, and the stored files byte for byte (19-11-2026: 6 of 6 files, ✓).

## Result of the 16-11-2026 import

- **Time:** 47 s.
- **Report:** `data/reports/import-20261116-100822.md`, kept locally.
- **Verdict:** ✅ every check matches.

| Check | Result |
|---|---|
| Rows | POs **3,199**, lines **8,709**, tax rows **4,707**, cost overheads **373**, payment rows **3,219**, suppliers **625**, items **7,331**, addresses **1,225**, contacts **375**, customers **422**, UOM conversions **12,425**, item tax rows **5,443**, item variant attributes **7,637** and GST HSN codes **21,923** (added for the masters screens, Step 8), timeline entries **16,672**, attachments **5**, users **28**: each equal to the backup |
| Money (exact) | Grand totals: INR 3,371,577,288.245 · USD 5,764,769.283 · EUR 4,107,038.771 · JPY 210,000. Base grand total, net totals, taxes, rounded totals, quantities and line amounts are all equal to the backup. |
| Per PO | 0 POs with a missing or extra line or tax row. Every PO's lines add up to its total. |
| Relations | 0 placeholder suppliers or items. 548 suppliers and 3,822 items linked to their POs. All 33 amended POs linked to their originals. |
| Spot checks | PUR-ORD/25-26/02510, 02486, 02512, 02263 (USD), 01426 (40 lines), 02015-1 (amended), 24-25/00001: field by field equal |
| Files | 5 PO attachments + the logo restored |

### Re-run on the 19-11-2026 backup: 3,217 POs

The owner asked for every PO raised since 16-11 (3,217 on the old site that afternoon). With the owner's go-ahead the
old site's Backups page took a new backup (⋯ › Download Files Backup, 19-11-2026 15:21:55), and its three files were
downloaded into `data/erpnext-backup`. Then `npm run import:erpnext -- --force` (`--force` because the local copy held
test POs): 40 s, every check matches (`data/reports/import-20261119-095918.md`).

- **Rows:** POs **3,217**, lines **8,765**, tax rows **4,736**, cost overheads **377**, payment rows **3,237**,
  suppliers **626**, items **7,342**, addresses **1,226**, contacts **375**, customers **422**, UOM conversions
  **12,437**, item tax rows **5,443**, item variant attributes **7,637**, GST HSN codes **21,923**, timeline entries
  **16,774**, attachments **5**, users **28**, likes **0**: each equal to the backup.
- **Since 16-11:** 18 new POs, and 9 older ones saved again (approved, received).
- **Files:** both file archives are byte for byte the 16-11 ones; no attachment was added or removed.
- **Issues:** the same 26, word for word.

### The 26 issues noted, none of which loses data

- **4 orphan rows:** two Poland VAT templates were renamed in ERPNext and left these rows behind. They belonged to no
  template there either, so they were not imported.
- **7 payment-term names** refer to terms later renamed or retyped, for example "…completion of worlk" and
  "75 % before document ". The name is kept; the link is empty.
- **16 POs** have Mode Of Transport "Air / Ship" or "Air/Ship", no longer an option. Kept as recorded.

## Running it again (the final backup)

1. On the old site's last day, take a backup (`stopgap/README.md`, "Final cut-over") and put its three files in
   `data/erpnext-backup/`.
2. Read and map first, without writing anything:
   ```bash
   npm run import:erpnext -- --dry-run
   ```
   Check the issues listed in `data/reports/import-dry-run-…md`.
3. Import (the newest backup is chosen automatically). On another machine's database (the production cut-over,
   [10](10-merge-guide.md) §4) add `--target <its host>`:
   ```bash
   npm run import:erpnext
   ```
4. Read the reconciliation report.
   - Exit code 0 means everything matches.
   - Exit code 2 means it imported with differences; the report names them.
   - Exit code 1 means nothing was changed.

5. Prove it, read-only: `npm run verify:erpnext`.

To browse the imported data: `npm run db:studio`.
