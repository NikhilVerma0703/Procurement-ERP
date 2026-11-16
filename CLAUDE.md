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
npm run db:migrate # prisma migrate dev (local Postgres only)
```

## Rules of this codebase

- **Namespace everything** so the merge is a move:
  - pages under `src/app/purchase`, APIs under `src/app/api/purchase`
  - code under `src/lib/purchase`, components under `src/components/purchase`
  - Prisma models `Purchase*` mapped to tables `purchase_*`
  - CSS classes `po-*`, base rules scoped to `.purchase-root`
  - Only `src/app/layout.tsx`, `src/app/page.tsx` and `src/components/standalone/` are standalone-only.
- **Server authority** (the Main ERP and Pigment ERP rule):
  - The form computes live for the user.
  - The server action re-validates with the same zod schema and **recomputes every total, tax and status itself**.
    It never stores the browser's numbers.
  - It writes in one transaction and returns `{ ok, error, fieldErrors }`.
- **Seams** (from Step 2): `src/lib/purchase/server/{db,current-user,gate,page,write,audit}.ts` and a pure
  `src/lib/purchase/access.ts`. At the merge they are rewired to the Main ERP's `currentUser()`, View-as guard and
  action_log. Nothing else in the module may reach past them.
- **Behave like the original.** Labels, field order, tabs, buttons, statuses and number formats follow the old
  ERPNext screens (`docs/reference/`). Do not add features the original lacked. Do not drop ones it had without
  the owner's say-so (scope table: plan §5).
- **Golden tests** are the definition of correct. The calculation engine must reproduce the totals, taxes and
  statuses ERPNext stored on the 3,199 historical POs (Step 4). A mismatch is a bug or a documented exception.
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
| Main ERP conventions | `C:\Users\User\Desktop\Pacific-ERP-payment-tracking` (read `origin/main` through git; don't modify that checkout) |
