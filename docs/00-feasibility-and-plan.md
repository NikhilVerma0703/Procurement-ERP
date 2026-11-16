# PO Management ERP — feasibility, architecture and build plan

**Status:** proposal for approval. Nothing is built yet.
**Date:** 16-11-2026
**Goal:** an exact, independent replica of *Buying → Purchase Order* from the old ERPNext site, in the
company's own stack. It runs standalone first and is later merged into the Main ERP
(`vmundra-pacific/Pacific-ERP`) as a module.

---

## 1. Verdict: technically feasible

Everything a faithful replica needs is in hand, or still capturable before the old site shuts down:

| Needed | Have it? |
|---|---|
| **All data** | ✅ Full verified backup: 751 tables, 3,199 POs, 625 suppliers, 7,331 items, addresses, contacts, templates, users, history |
| **How the standard PO screen behaves** | ✅ ERPNext 14.92 and India Compliance 14.34 are open source. Their PO logic (calculations, GST, statuses, validations) can be read and re-implemented exactly. |
| **The custom add-on's PO logic** | ✅ Its form script was captured from the live site (`docs/reference/live-capture/`). ⚠ Its 4 server functions are not in the backup. Their results are recorded on 3,199 historical POs, so the rules can be derived from the data and checked against it. |
| **Every field, tab and grid** | ✅ Mapped: 155 visible PO fields, 13 item-grid columns, 101 item-row fields |
| **The PO sheet (PDF)** | ✅ All 11 print layouts saved as HTML (default *PDF PO*) |
| **Workflow, numbering, emails** | ✅ Created → Approved/Rejected by Admin; `PUR-ORD/25-26/#####`; 3 email notifications |

**The strongest guarantee of correctness:** every one of the 3,199 historical POs has ERPNext's own computed totals,
taxes and statuses stored with it. The new calculation engine will be tested against all of them. Any PO whose
totals the new system computes differently is reported, so "behaves exactly like the original" is measured, not
assumed.

**Conditions and honest limits**

1. **Not before the shutdown.** A complete, non-simplified replica with migration and PDFs is several weeks of
   careful work. Daily PO work needs a bridge for that period (section 7).
2. **Add-on server code.** The exact rules behind the per-item GST columns and Cost Overheads are inferred from data
   unless NestorHawk hands over `pacific_group`. Ask them; it removes all guesswork.
3. **Cross-module edges.** A few buttons on the PO screen lead into other ERPNext modules: material requests,
   purchase receipts, invoices and payments. Section 5 lists them with usage counts and a recommended choice for each.
4. **Look.** The screens will mirror ERPNext's layout, field order, tabs, grids, buttons and wording, so the
   Procurement Manager finds everything where it was. They will use the Main ERP's styling, so the module looks at
   home after the merge. Pixel-identical copying of ERPNext's CSS is not proposed.
5. **Licence.** ERPNext and India Compliance are GPL-3.0. The replica re-implements their behaviour in new code and
   copies none of theirs, so the code base stays entirely yours.

---

## 2. Your existing architecture: what was analysed

**Main ERP:** `vmundra-pacific/Pacific-ERP`, branch `main` at `e4d9eacf` (30-10-2026), read through git without
touching any working copy.

**Stack**
- Next.js 15 (App Router), React 19, TypeScript 5, Prisma 6
- PostgreSQL (Neon in production), next-auth v5, Tailwind 3
- react-hook-form + zod, sonner, lucide-react
- exceljs/xlsx for Excel, **pdfmake** for commercial PDFs, nodemailer
- Tests: vitest and `node --test`. Deployed on Vercel.

**How standalone apps join it** (Chromia, Robo, Lab, and Pigment, ported 27-10-2026)
- Models are prefixed (`Pigment*`) and tables are prefixed (`pigment_*`).
- One capped module **role** (`PIGMENT`), routes `/pigment`, APIs `/api/pigment`.
- Module code lives in `src/lib/pigment`, with these seams:
  - `access.ts`: pure and edge-safe
  - `server/gate.ts`, `server/page.ts`, `server/write.ts` (View-as read-only), `server/audit.ts` (action_log)
  - Screens live in `src/app/pigment`, and components in `src/components/pigment`.
- Schema reaches Neon as a **numbered SQL script** (`scripts/0146-…sql`). Standalone apps use Prisma Migrate locally.

**Commercial documents** (`src/lib/commercial`: proforma, invoices, packing lists) are the closest match to a PO:
- PDFs are built server-side with **pdfmake**.
- A route checks the module gate, then serves the PDF inline, or `?download=1` for a file.
- An issued document prints from a frozen snapshot.

**Standalone pattern** (`Pigment ERP`, `CTS`)
- `src/app/<section>/{page.tsx, actions.ts}`, `src/components/<area>/…`, `src/lib/<area>/{schema,queries,calc,…}.ts`
- Zod schemas are shared by the form and the server action.
- **The server re-validates and recomputes everything and never stores the browser's numbers**, writing in one
  transaction.
- Results come back as `{ ok, error, fieldErrors }`, then `revalidatePath`.
- Edit uses `?edit=<id>`. The README documents every business rule.

---

## 3. Architecture of the PO Management ERP

Built in the same stack and versions as the Main ERP, **namespaced from day one**, so the later merge is a move of
folders and not a rewrite.

```
src/app/purchase/                     screens (module root /purchase)
  orders/                             list · new · [id] (form with tabs) · actions.ts
  suppliers/  items/  addresses/  contacts/  templates/   masters the PO screen links to
src/app/api/purchase/                 orders/[id]/pdf · exports (.xlsx)
src/components/purchase/              list/ form/ grid/ print/ ui/   (CSS classes po-*)
src/lib/purchase/
  access.ts                           pure role rules (edge-safe), as lib/pigment/access.ts
  server/{db,current-user,gate,page,write,audit}.ts   the seams swapped at merge time
  orders/{schema,queries,actions-core,status,workflow,numbering}.ts
  calc/                               the calculation engine (pure, unit-tested)
  gst/                                GST rules (India Compliance behaviour + add-on columns)
  pdf/                                pdfmake layouts (PDF PO first)
  notify/                             the 3 email notifications (nodemailer)
  migrate/                            the ERPNext → new DB importer + reconciliation report
prisma/schema.prisma                  Purchase* models → purchase_* tables (Prisma Migrate locally)
tests/purchase/                       vitest: unit + golden tests over all historical POs
```

**Key design rules** (taken from your codebases)
- **Server authority.** The form computes live for the user. On save, the server action re-validates with the same
  zod schema and **recomputes every total, tax and status itself**, in one transaction.
- **Calculation engine** = ERPNext's *taxes_and_totals* behaviour, re-implemented as pure functions:
  - item amounts, discounts and UOM conversion
  - charge types: On Net Total, Actual, On Previous Row Amount/Total, On Item Quantity
  - item-wise tax, additional discount, rounding and rounded total
  - Indian-format amount in words
  - company-currency (`base_*`) values
  - the payment schedule from payment-terms templates
- **GST:** India Compliance's intra-state vs inter-state logic and Place of Supply. The add-on's SGST/CGST/IGST
  item columns follow its captured rules.
- **Workflow and status:** Created → Approve/Reject (approver tier), with Cancel, Amend and Duplicate. ERPNext's
  status rules apply (Draft, To Receive and Bill, To Bill, Completed, Closed, On Hold, Cancelled).
- **Numbering:** series `PUR-ORD/YY-YY/#####`, continuing from the last migrated number.
- **PDF:** pdfmake, server-side. The route is `GET /api/purchase/orders/[id]/pdf?format=…&download=1`, as the
  commercial module does it.
- **Logins in standalone:** next-auth v5 credentials (same as the Main ERP), with roles mirroring the ERPNext
  workflow:
  - *Purchase* creates and edits drafts (ERPNext "Purchase Head")
  - *Approver* approves and rejects (ERPNext "Admin")
  - *Admin*
  - At the merge, `server/current-user.ts` and `gate.ts` switch to the Main ERP's `currentUser()` and a capped
    `PURCHASE` role.

---

## 4. Data migration: the complete PO ecosystem, relational, as-is

**Source:** the verified backup `…-database.sql.gz`, read directly by a TypeScript importer. No ERPNext install is
needed, and the importer can be re-run on the final backup taken on the last day.

**Migrated with original IDs and relationships**

| ERPNext source | New table(s) | Rows | Relationship kept |
|---|---|---|---|
| Purchase Order | `purchase_orders` | 3,199 | number = original ID (e.g. `PUR-ORD/25-26/02510`); amended-from chain |
| Purchase Order Item | `purchase_order_items` | 8,709 | → PO (FK), → Item (FK), qty/rate/UOM/conversion/GST columns |
| Purchase Taxes and Charges (PO) | `purchase_order_taxes` | 4,707 | → PO (FK), row order, charge type, account |
| Services Items (PO) | `purchase_order_cost_overheads` | 373 | → PO (FK) |
| Payment Schedule (PO) | `purchase_order_payment_schedules` | 3,219 | → PO (FK) |
| Supplier | `purchase_suppliers` | 625 | 1 supplier → many POs (FK) |
| Item (+ UOM conversions, tax templates) | `purchase_items` (+ children) | 7,331 | 1 item → many PO lines (FK) |
| Address / Contact (+ links, emails, phones) | `purchase_addresses`, `purchase_contacts` (+ links) | 1,225 / 375 | → supplier / company / customer |
| Tax, item-tax, payment-terms, T&C templates | `purchase_*_templates` | 6 / … / 219 / 118 | used by PO fields |
| Company, warehouses, cost centres, accounts, currencies, UOMs, price list | lookup tables | small | as referenced by POs |
| Workflow actions, versions, comments, attachments (PO) | `purchase_order_events`, `purchase_attachments` | as found | the PO's timeline and files |
| Users who created or approved POs | `purchase_users` | 28 | owner and modified-by kept on every record |

- **Nothing is lost:** each migrated record also keeps its complete original row as JSON (`legacy`), including
  fields the screens don't show.
- **Verified after import:**
  - row counts equal the source, with no orphans
  - totals by year and currency equal the source
  - every PO's totals are recomputed by the new engine and compared with ERPNext's stored values
  - a signed-off reconciliation report is produced
- **Your separate supplier and item list files** are reconciled against these masters (matched on code, GSTIN and
  name). Differences are reported for your review, never silently overwritten.

---

## 5. Scope: "everything inside Buying → Purchase Order"

Usage counts come from the 3,199 historical POs and 8,709 item rows.

**Included: PO-specific and in use**
- **List:** columns, quick filters (ID, Supplier, Supplier Name, Company, Status), filter builder, search, sort,
  paging, counts, status colours, Excel export
- **Form:** every tab, section and field (155), item grid and row detail, taxes, Cost Overheads, payment schedule,
  addresses and contacts, Drop Ship (customer used on **540** POs), Terms
- **Behaviour:** field fetches and defaults, validations, the full calculation engine, multi-currency (**196**
  non-INR POs), GST (In-State/Out-State on **1,783**), additional discount (**58**), UOM conversion (**1,573**
  lines), amended POs (**33**)
- **Actions:** Save, Approve/Reject, Cancel, Amend, Duplicate, Close/Re-open, Hold/Resume, Print with layout and
  letter-head choice, PDF download, email to supplier, attachments, comments/timeline, Update Items after approval
- **Masters the PO links to:** Supplier, Item, Address, Contact, and the tax, payment-terms and T&C templates
- **Plus:** the 3 email notifications, numbering, and the PO print layouts in use

**Needs your decision (cross-module)**

| Item | Usage | Recommendation |
|---|---|---|
| *Get Items from Material Request* | 6 of 8,709 lines | Keep historical MR references as text; leave the button out unless the team still needs it |
| Goods receipts → "% Received" and status | received on **6,037** lines (5,552 receipts by Stores) | Keep all historical receipt quantities. Decide how *new* receipts are recorded: Main ERP Store module, or a minimal "receive" action inside the PO module |
| Purchase invoices → "% Billed" | 0 billed lines (1 invoice ever) | Keep the status logic and data. No invoice screen. |
| Generic ERPNext list extras (Report view, Kanban, Calendar, Tags, Assign To, bulk edit) | not measurable | Confirm with the Procurement Manager which, if any, she uses |
| Price lists / pricing rules | price-list rate on 43 lines | Keep the fields and data. Re-create only if still used. |

**Not used in 2.5 years** (data kept; screens leave them out unless you say otherwise): auto-repeat, subcontracting,
incoterms, shipping rules, projects, order-confirmation no.

**Not included:** every other ERPNext module (stock ledger, accounting, manufacturing, HR …).

---

## 6. Build plan: step by step, each step reviewed before the next

| Step | Deliverable | Done when |
|---|---|---|
| **0. Capture before shutdown** | ✅ backup, ✅ add-on script · reference PDFs of sample POs per layout in use · screenshots of key screens · optional read-only calls to the 4 add-on server functions · **final backup on the last day** | Everything that only exists on the live site is saved |
| **1. Project scaffold** | Repo in the Main ERP's stack and versions, module layout above, seams, local Postgres, logins, test setup, README | `npm run dev` opens an empty Purchase module; tests run |
| **2. Data model** | `Purchase*` Prisma schema for the whole PO ecosystem | Reviewed against the ERPNext tables; migrations apply locally |
| **3. Migration + reconciliation** | Importer from the backup, reconciliation report | Counts and totals match. Every PO opens with its suppliers, items and rows attached. |
| **4. Calculation, GST and status engine** | Pure TS engine + golden tests over all historical POs | Historical POs recompute to ERPNext's stored figures. Differences are explained. |
| **5. List screen** | Purchase Order list with filters, search, sort, paging, export | Side-by-side check with the original |
| **6. PO form** | Tabs, sections, fields, grids, fetches, validations, live totals; save, approve/reject, cancel, amend, duplicate, close/hold | Procurement Manager can create and approve a PO end to end |
| **7. PO sheet PDF** | pdfmake layouts in use (PDF PO first) | Matches the reference PDFs from step 0 |
| **8. Notifications, attachments, timeline, masters screens** | Emails, files, history, supplier/item/address/contact screens | Feature checklist complete |
| **9. Acceptance and merge readiness** | UAT with the Procurement Manager; merge guide (role, routes, SQL script, nav) | Your sign-off |

---

## 7. Bridge for the shutdown gap

The old site shuts down in about 5 days, before the replica is ready. Options:
1. **Ask NestorHawk for an extension.** This is in the email already drafted (`PO_Migration_Guide.md` §5).
2. **Run the original ERPNext locally from the backup** in Docker on this PC (Docker Desktop is installed).
   - The Procurement Manager keeps working, with nothing lost, until the replica goes live.
   - It is also the live reference for side-by-side checks.
   - New POs entered there are picked up by the importer.
3. **Pause, or record POs manually,** and enter them in the new system later. This is the least safe option.

---

## 8. What I need from you

1. **Approval** of this architecture and plan.
2. **Bridge choice** (section 7).
3. **Section 5 decisions:** receipts, material requests, list extras. Defaults apply if you have no preference.
4. **Which print layouts** the team actually prints (11 exist; default "PDF PO").
5. **Where the separate supplier and item list files are.**
6. Whether NestorHawk will release the `pacific_group` code.
