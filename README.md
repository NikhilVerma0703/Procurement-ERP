# Procurement ERP

A complete, independent replica of **Buying → Purchase Order** from the company's old ERPNext site
(pacificengineeredsurfaces.nestorhawk.com, ERPNext 14.92 + India Compliance 14.34 + the custom `pacific_group`
add-on). It carries all historical data: 3,199 purchase orders with their suppliers, items, addresses, contacts and
templates, related as they were.

It runs **standalone** first. After acceptance it is merged into the Main ERP
(`vmundra-pacific/Pacific-ERP`) as the **`purchase` module**, the way Pigment, Chromia and Lab were.

Stack, as in the Main ERP: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 3 + Prisma 6 + PostgreSQL.
Forms use react-hook-form + zod, notices use sonner, and icons come from lucide-react.

**Plan and status:** [docs/00-feasibility-and-plan.md](docs/00-feasibility-and-plan.md)

- **Step 0** (live-site captures) ✅
- **Step 1** (project scaffold) ✅
- **Step 2** (data model) ✅ — [docs/02-data-model.md](docs/02-data-model.md)
- **Step 3** (import of the historical data) ✅ — [docs/03-data-migration.md](docs/03-data-migration.md)
- **Step 4** (calculation, GST and status engine) ✅ — [docs/04-calculation-engine.md](docs/04-calculation-engine.md)
- **Step 5** (PO list screen, standalone sign-in) ✅ — [docs/05-list-screen.md](docs/05-list-screen.md)
- **Step 6** (PO form: save, approve/reject, cancel, amend, duplicate, close/hold, Update Items) ✅ — [docs/06-po-form.md](docs/06-po-form.md)
- **Step 7** (the PDF PO sheet) is next

## Commands

```bash
npm install
npm run dev          # http://localhost:3300
npm run build        # prisma generate && next build
npm run typecheck    # tsc --noEmit
npm test             # vitest — tests/purchase/**
npm run db:migrate   # prisma migrate dev — local database (from Step 2)
npm run db:studio    # browse the database
npm run import:erpnext             # import the old site's data from data/erpnext-backup (newest backup)
npm run import:erpnext -- --dry-run # read and map only; nothing written
npm run golden                     # check the calculation engine against every imported PO
npm run users -- list              # standalone sign-in accounts (add / password / role / disable)
```

**Local database (from Step 2):** copy `.env.example` to `.env` and put your local PostgreSQL password in it. Then
create the database once:

```bash
psql -U postgres -c "CREATE DATABASE procurement_erp"
```

**Signing in (from Step 5):** put a long random `AUTH_SECRET` in `.env` (see `.env.example`), then create your own
account; the password is asked for twice and never shown:

```bash
npm run users -- add <your email> --name "<Your Name>" --role ADMIN
```

## Layout

```
src/app/purchase/          the module's screens (/purchase/…)           ─┐
src/app/api/purchase/      the module's APIs (/api/purchase/…)           │ travel to the
src/components/purchase/   the module's components (CSS classes po-*)    │ Main ERP as they
src/lib/purchase/          the module's logic: routes, seams, engines    │ are at the merge
tests/purchase/            the module's vitest suite                    ─┘
src/app/layout.tsx         STANDALONE ONLY: the app frame (replaced by the Main ERP's <Shell>)
src/components/standalone/ STANDALONE ONLY: the app's sidebar
prisma/schema.prisma       Purchase* models → purchase_* tables (Step 2 onward)
scripts/analysis/          Python helpers used for the first export and setup extraction
docs/                      plan, reference material (below)
scripts/                   import-erpnext.ts, golden-check.ts (read data/; reports to data/reports/), purchase-users.ts
data/                      company data — NOT in git (below)
stopgap/                   TEMPORARY: the old ERPNext running on this PC until this ERP is live (stopgap/README.md)
```

## Data (not in git)

`data/` stays on this machine only (`.gitignore`):

- `data/erpnext-backup/`: the verified ERPNext backup of 16-11-2026, the import source from Step 3.
  - `…-database.sql.gz`: 751 tables
  - `…-files.tar` and `…-private-files.tar`: the attachments
- `data/exports/`: the readable Excel export of all POs, suppliers, items, addresses and contacts.

The site config backup (`…-site_config_backup.json`, which holds secrets) is deliberately **not** copied here. It
stays in the Downloads folder.

## Reference material (`docs/reference/`)

- `PO_Migration_Guide.md`: the analysis of the old site, the backup record, and the field-by-field spec of the PO
  screen.
- `erpnext-setup/`: the 11 PO print layouts (HTML/Jinja) and `po_setup.json`, which holds:
  - custom fields and property setters
  - the workflow and notifications
  - tax, payment-terms and terms templates
- `live-capture/`: things only the live site could tell, captured before its shutdown:
  - `pacific_group_purchase_order.js`: the add-on's PO form script, verbatim
  - `addon-server-probe-2026-11-16.md`: what the add-on's server functions return
  - `ui-notes.md`: menus, buttons and tabs, and the hidden totals behaviour
  - `pdfs/` (17 reference PDFs) and `screens/` (11 screenshots). These hold business data, so they are kept
    locally and not committed.
