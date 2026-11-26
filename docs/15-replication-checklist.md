# Section-by-section replication checklist

**Started:** 26-11-2026 · **Asked by the owner (26-11-2026):** "make our Procurement ERP work as close to 100 %
identical to the original website as possible … one section at a time … maintain a record of completed and pending
sections." This file is that record. Each section is compared with the old site (signed in, read-only), the
differences are built, and the section is tested here before the next one starts.

What is compared for every section: the list (columns, filters, sort, counts, actions), the new / edit form, the
record's own page, every page a click on an ID, name, supplier, item or title opens, the buttons and menus, and the
**print view** (formats, Full Page, Refresh, PDF, Print).

## Cross-cutting work

| # | Item | State |
|---|---|---|
| X1 | **Financial-year numbers** (owner, 26-11-2026): a new document's number carries the financial year of its own date — PUR-ORD/26-27/…, PR/26-27/MM-…, GE-26-27-…; from 01-04-2027 …/27-28/…. FY 2026-27 continues the 25-26 count (next PO PUR-ORD/26-27/02563); every later year restarts at 00001. Old numbers stay as they are. Calendar-year series (MAT-MR-2026-…, MAT-SLE-2026-…, MAT-LCV-2026-…) were not financial-year series on the old site and stay calendar-year. **Built 26-11-2026** (`lib/purchase/financial-year.ts`, `series-counter.ts`): PO (PO Date), Purchase Receipt (Posting Date), Gate Entry (Gate Entry Date; its Financial Year field too), and the generic save (Stock Entry "MAT-STE/24-25/", Delivery Note "DN/24-25/", Quality Inspection "MAT-QA/24-25/" once they are entered here). The forms' Series offer this year's series. Checked in a rolled-back transaction: PUR-ORD/26-27/02563, PR/26-27/MM-03462, GE-26-27-03526; dated 02-04-2027 → PUR-ORD/27-28/00001; back-dated to 20-03-2026 → PUR-ORD/25-26/02563. Tests: `tests/purchase/financial-year.test.ts`. | ☑ |
| X2 | **Print view** as the old one: Print Format, Language and Letter Head choices, the three print options, Full Page, Refresh, back to the form, ⋯ (Full Page, PDF, Refresh), Print. | ☑ for receipts (`components/purchase/print/PrintScreen.tsx`); the other sections take it as their print is built |
| X3 | **Frappe's "Standard" print** for every DocType (the old site offered it on all of them), drawn from the captured form layouts. | ☑ engine (`print/standard-print.ts`: Frappe 14.101.1's standard.html and ERPNext 14.92.14's includes, run as they were; the old print stylesheet, `print-bundle-css.ts`); live for receipts and POs; the other sections take it as their print view is built |
| X4 | **Every lookup list complete where the old one was** (owner, 26-11-2026: Payment Terms Template showed only 20): Payment Terms Template (219), Payment Term (206), Terms and Conditions (118) list everything, by name, each typed word matched. | ☑ |

## The old site's print formats (read 26-11-2026)

| DocType | Formats on the old site (default first) | Here |
|---|---|---|
| Purchase Order | PDF PO (default), Standard, Test Future Lab PO, tecnosint, PURCHASE ORDER TEMPLATE, Purchase Order Print, Purchase Order 2025, Purchase Order, PO print format, Import PO, Future Lab PO, Drop Shipping Format | **all 12**, each run from its own template; every format of four POs (02512 GST, 02510 IGST, 02263 USD import, 02560) equals the old site's output (`npm run check:po-prints`, 48 / 48). The print view as the old one. The server PDFs of docs/07 stay for the emails. |
| Purchase Receipt | QR Codes (default), Standard, Test PR, Purchase Receipt PF, Puchase Receipt Format, Goods Receipt | **all 6**, equal to the old site's own output for MM-03457 and MM-00407 (`npm run check:receipt-prints`, 12 / 12) |
| Gate Entry | Standard, GATE ENTRY PRINT | GATE ENTRY PRINT (drawn by hand); to run as its template; Standard pending |
| Pick List | Standard, Pick List | pending |
| Supplier | Standard, IRS 1099 Form | pending |
| Every other DocType below | Standard | pending (X3) |

## Sections

State: ☐ not compared yet · ◐ compared, differences being built · ☑ equal to the old site (tested).

### Buying

| Section | List | Form / new | Record & links | Print | State |
|---|---|---|---|---|---|
| Purchase Order | old list (docs/05); columns by width (25-11) | docs/06 | | 1 + 4 of 12 formats | ☐ |
| Supplier | old list view (25-11) | docs/09 | | Standard, IRS 1099 Form pending | ☐ |
| Item | old list view (25-11) | docs/09 | | Standard pending | ☐ |
| Address | old list view (25-11) | docs/09 | | Standard pending | ☐ |
| Contact | old list view (25-11) | docs/09 | | Standard pending | ☐ |
| Purchase Taxes and Charges Template | old list view (25-11) | docs/09 | | Standard pending | ☐ |
| Payment Terms Template | old list view (25-11) | docs/09 | | Standard pending | ☐ |
| Payment Term | old list view (25-11) | docs/09 | | Standard pending | ☐ |
| Terms and Conditions | old list view (25-11) | docs/09 | | Standard pending | ☐ |

### Stock › Items and Pricing

| Section | List | Form / new | Record & links | Print | State |
|---|---|---|---|---|---|
| Item | (as Buying › Item) | | | | ☐ |
| Item Group | old list + tree (docs/14) | editable | | Standard pending | ☐ |
| Product Bundle | old list view | editable | | Standard pending | ☐ |
| Price List | old list view | editable | | Standard pending | ☐ |
| Item Price | old list view | editable | | Standard pending | ☐ |
| Shipping Rule | old list view | editable | | Standard pending | ☐ |
| Pricing Rule | old list view | editable | | Standard pending | ☐ |
| Item Alternative | old list view | editable | | Standard pending | ☐ |
| Item Manufacturer | old list view | editable | | Standard pending | ☐ |
| Customs Tariff Number | old list view | editable | | Standard pending | ☐ |

### Stock › Stock Transactions

| Section | List | Form / new | Record & links | Print | State |
|---|---|---|---|---|---|
| Material Request | old list view | read-only (entry: owner decision 5) | | Standard pending | ☐ |
| Stock Entry | old list view | read-only (decision 5) | | Standard pending | ☐ |
| Delivery Note | old list view | read-only (decision 5) | | Standard pending | ☐ |
| Gate Entry | old list view (25-11) | docs/13 | | GATE ENTRY PRINT; Standard pending | ☐ |
| Purchase Receipt | old list view (25-11) | docs/12, docs/13 | | 5 of 6 formats | ☐ |
| Pick List | old list view | read-only | | Pick List, Standard pending | ☐ |
| Delivery Trip | old list view | read-only | | Standard pending | ☐ |

### Stock › Stock Reports

| Report | Equal to the old answers | State |
|---|---|---|
| Stock Ledger | 22,646 rows (docs/14) | ☐ (screens to compare) |
| Stock Balance | 4,430 / 4,238 rows | ☐ |
| Stock Projected Qty | 4,682 rows | ☐ |
| Stock Summary | | ☐ |
| Stock Ageing | 4,193 rows | ☐ |
| Item Price Stock | 5,353 rows | ☐ |
| Warehouse Wise Stock Balance | 29 rows | ☐ |

## Log

* 26-11-2026 — both sites open for comparison; the old site's print formats listed; X1 decided by the owner and built;
  the receipt's print view rebuilt as the old one (X2); its five formats checked against the old site's output.
* 26-11-2026 — Standard print (X3); all six receipt formats and all twelve PO formats equal the old site's; the terms
  lookups complete (X4). The old PO list read: ⋯ menu Refresh, Close, Reopen, Import, User Permissions, Role
  Permissions Manager, Customize, Toggle Sidebar, List Settings; Actions Approve, Reject, Purchase Invoice, Purchase
  Receipt, Advance Payment, Export, Assign To, Apply Assignment Rule, Add Tags, Print — next.
* Note on the old PO print: its on-screen preview showed whole numbers as "35" (it sent the form's numbers from the
  browser); its Print, Full Page and PDF reloaded the PO and printed "35.0". This ERP prints as the old Print did.
