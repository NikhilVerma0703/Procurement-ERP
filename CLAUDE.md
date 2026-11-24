# Procurement ERP

Replica of ERPNext **Buying → Purchase Order** (old site: ERPNext 14.92.14 / Frappe 14.101.1 / India Compliance
14.34.6 / custom add-on `pacific_group` 0.0.1), in the Main ERP's stack:
- Next.js 15 App Router, React 19, TS, Prisma 6, Postgres
- Tailwind 3, react-hook-form + zod, sonner, lucide

Standalone now. It merges into `vmundra-pacific/Pacific-ERP` as the `purchase` module (the Pigment/Chromia
pattern). The plan, scope and step list are in `docs/00-feasibility-and-plan.md`. Read it first.

## Commands

```bash
npm run dev        # port 3300
npm run typecheck
npm test           # vitest over tests/purchase/**
npm run db:migrate # prisma migrate dev (refuses any database not on this machine)
npm run golden     # engine vs all imported POs (local data)
npm run golden:stock  # Stock Balance / Stock Ledger vs the old site's own live answers (data/erpnext-live)
npm run golden:ledger # the FIFO valuation engine replays every entry of the old stock ledger
npm run import:erpnext  # load the newest backup in data/erpnext-backup (another machine's DB: --target <host>)
npm run verify:erpnext  # read-only: does the database still equal the backup?
npm run merge:sql  # rebuild merge/ for the Main ERP after any schema change
npm run export:data -- --out "<folder>"  # every record as readable Excel, by the old menus (company data: outside the repo)
```

## Rules of this codebase

- **Namespace everything** so the merge is a move:
  - pages under `src/app/purchase`, APIs under `src/app/api/purchase`
  - code under `src/lib/purchase`, components under `src/components/purchase`
  - Prisma models `Purchase*` mapped to tables `purchase_*`
  - CSS classes `po-*`, base rules scoped to `.purchase-root`
  - Standalone-only (left behind at the merge): `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/standalone/`,
    and the sign-in: `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/types/next-auth.d.ts`,
    `src/app/{login,no-access,api/auth}/`, `scripts/purchase-users.ts`, model `PurchaseLogin` (`purchase_logins`).
- **Server authority** (the Main ERP and Pigment ERP rule):
  - The form computes live for the user.
  - The server action re-validates with the same zod schema and **recomputes every total, tax and status itself**.
    It never stores the browser's numbers.
  - It writes in one transaction and returns `{ ok, error, fieldErrors }`.
- **Seams:** `src/lib/purchase/server/{db,current-user,gate,page,write,audit,files,mail}.ts`
  and a pure `src/lib/purchase/access.ts`. At the merge they are rewired to the Main ERP's `currentUser()`, View-as
  guard, action_log, file storage and mailer. Nothing else in the module may reach past them: every page starts with
  `purchasePageGate()`, every API route and server action with `purchaseGate(action)`, all queries use `server/db`.
- **Behave like the original.** Labels, field order, tabs, buttons, statuses and number formats follow the old
  ERPNext screens (`docs/reference/`). Do not add features the original lacked. Do not drop ones it had without
  the owner's say-so (scope table: plan §5).
- **Golden tests** are the definition of correct. The calculation engine must reproduce the totals, taxes and
  statuses ERPNext stored on the historical POs (3,199 at Step 4; 3,217 in the 19-11-2026 backup; 3,227 in the 21-11-2026 one). A mismatch is a bug or a documented exception.
- Comment the *why*, in the style of the Main ERP (business rule, owner decision, date).

## Data and secrets

- `data/` (the ERPNext backup and exports) and the captured PDFs/screens are company data. They are gitignored and
  never committed.
- Do not read the whole SQL dump into context. Stream it (see `scripts/analysis/`, and the importer from Step 3).
- The old site is **read-only** for us. Never delete or change anything there (owner, 16-11-2026).
- The site config backup with secrets stays out of this repo.

## Where to look

| Need | File |
|---|---|
| Field-by-field spec of the PO screen | `docs/reference/PO_Migration_Guide.md` §3 |
| Custom fields, workflow, notifications, templates | `docs/reference/erpnext-setup/po_setup.json` |
| PO sheet layouts | `docs/reference/erpnext-setup/print_formats/*.html` (default: `PDF PO.html`) |
| Add-on behaviour | `docs/reference/live-capture/{pacific_group_purchase_order.js, addon-server-probe-2026-11-16.md}` |
| Live UI details | `docs/reference/live-capture/ui-notes.md` (+ local `screens/`, `pdfs/`) |
| Calculation rules, old-site defects, golden check | `docs/04-calculation-engine.md` (code: `src/lib/purchase/calc/`) |
| PO form: save, workflow, GST checks, fetches, history | `docs/06-po-form.md` (code: `src/lib/purchase/orders/`, `src/components/purchase/form/`) |
| PO sheet PDF: layouts, printed values, measurements, check | `docs/07-po-sheet.md` (code: `src/lib/purchase/pdf/`; check: `scripts/check-sheets.ts`) |
| PO timeline, comments, attachments, email, notifications | `docs/08-activity-and-email.md` (code: `src/lib/purchase/{orders,notify}/`, `src/components/purchase/activity/`) |
| Masters screens (Supplier, Item, Address, Contact, templates): rules, quick entry, variants, rename | `docs/09-masters.md` (code: `src/lib/purchase/masters/`, `src/components/purchase/masters/`) |
| Merge into the Main ERP: what moves, seams, SQL script, cut-over | `docs/10-merge-guide.md` (files: `merge/`, made by `scripts/make-merge-sql.ts`) |
| Acceptance checklist, sign-off, every open owner decision | `docs/11-acceptance.md` |
| Phase II (Buying + Stock, Thiru R): who uses what, the 23 Stock sections, data secured, build order, owner decisions | `docs/12-phase-2-buying-and-stock.md` (setup: `docs/reference/erpnext-setup/stock/`; add-on scripts: `docs/reference/live-capture/stock/`; importer: `src/lib/purchase/migrate/stock-build.ts`; forms drawn from the old site's captured definitions: `src/lib/purchase/doc/`) |
| The top search box; Gate Entry; a receipt's Submit / Cancel (stock ledger, POs, gate entry) | `docs/13-search-gate-entry-receipt.md` (code: `src/lib/purchase/search/`, `src/lib/purchase/stock/{gate-entry-*,gate-entries,receipt-submit,stock-post,ledger-format}.ts`) |
| Main ERP conventions | `C:\Users\User\Desktop\Pacific-ERP-payment-tracking` (read `origin/main` through git; don't modify that checkout) |
