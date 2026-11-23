# Phase II — the Buying module and the Stock module

**Status:** discovery done, data secured and imported (all 27 Stock tables + 3,227 POs, 125 checks equal), navigation and access done, Stock Ledger and Stock Balance built and equal to the old site's own answers; the other screens next.
**Date:** 21-11-2026
**Asked by the owner (21-11-2026):** Phase I replicated the part of the old site that **Althaf** uses (Buying →
Purchase Order and the masters a PO links to). Phase II adds what **Thiru R** (Storekeeper) uses as well:
the old site's **Stock → Masters & Reports** (Items and Pricing, Stock Transactions, Stock Reports), his
**Purchase Order → Gate Entry → Purchase Receipt** chain, and **all** their historical data, before the old site
shuts down. One Procurement ERP, no second app, no copy of the PO screens: both users share them.

Everything below was read from the old site itself on 21-11-2026 (as Thiru R, read-only) and from its backup
of that day. Nothing was changed there.

---

## 1. Who uses what (the old site's own records)

| User | Account | Roles on the old site | What they work in (page visits, documents created) |
|---|---|---|---|
| **Althaf** | `salessupport@…` | 49 roles incl. System Manager | Purchase Order (1,049 list visits, 342 prints; **2,166 POs created**), Supplier, Price List, Item Price (3,059 created by saving POs), Buying workspace, a few Buying reports |
| **Thiru R** | `stores@…` | 58 roles incl. System Manager, Stock Manager, Store Head | Purchase Order (2,652 list visits; **891 POs**), **Gate Entry** (816 list visits; **4,626 of 4,682**), **Purchase Receipt** (688 prints; **5,489 of 5,593**), **Landed Cost Voucher** (**329 of 378**, last on 18-11-2026), Material Request (4,126; last 30-10-2025), Stock Entry (4,029; last 03-03-2026), Quality Inspection (728; last 18-07-2026), Item-wise Purchase History (50 runs), Stock Ledger / Balance / Projected Qty |

Both hold nearly every role on the old site, so its permissions do not separate them; the separation the owner
wants (Althaf: Buying; Thiru R: everything) is ours to build (§6).

## 2. Buying — the nine sections

Phase I's sidebar already holds the nine sections Althaf uses, in this order, and they become the **Buying** module:

| # | Section | Records (21-11) | State |
|---|---|---:|---|
| 1 | Purchase Order | 3,227 | Built (Phase I): list, form, workflow, sheet, email, timeline |
| 2 | Supplier | 628 | Built (Phase I masters) |
| 3 | Item | 7,358 | Built (Phase I masters); also *Stock › Items and Pricing › Item* — one screen, two menus |
| 4 | Address | 1,228 | Built |
| 5 | Contact | 376 | Built |
| 6 | Purchase Taxes and Charges Template | 6 | Built |
| 7 | Payment Terms Template | 219 | Built |
| 8 | Payment Term | 206 | Built |
| 9 | Terms and Conditions | 118 | Built |

The old site's Buying workspace has more cards (Material Request, Purchase Invoice, Request for Quotation,
Supplier Quotation, Supplier Group, Supplier Scorecard, Promotional Scheme, Pricing Rule, Buying Settings and 15
reports). Neither user works in them except through the Stock sections below (Material Request, Item Price, Price
List, Item Group, Pricing Rule, Product Bundle). Records: Purchase Invoice 1, Request for Quotation 1, Supplier
Quotation 0, Supplier Scorecard 0, Promotional Scheme 0. They are in the backup; building them is an owner
decision (§8).

## 3. Stock › Masters & Reports — the 23 sections

The owner's screenshot (21-11-2026: "this entire part"): three cards, every link in them.

| Card | Section | Records (21-11) | Last used | Notes |
|---|---|---:|---|---|
| Items and Pricing | Item | 7,358 | today | Shared with Buying. Add-on: list + form script; custom fields (HSN, colour, tax type/rule, service item, ITC) |
| | Item Group | 28 | | Tree; custom HSN field |
| | Product Bundle | 0 | never | |
| | Price List | 9 | | |
| | Item Price | 5,220 | 20-11-2026 | Created automatically when a PO/PR rate is saved (*Stock Settings › Auto Insert Price List Rate If Missing* = on); custom `uom_factor` |
| | Shipping Rule | 0 | never | |
| | Pricing Rule | 0 | never | |
| | Item Alternative | 0 | never | |
| | Item Manufacturer | 0 | never | |
| | Customs Tariff Number | 0 | never | |
| Stock Transactions | Material Request | 4,145 (+7,494 rows) | 30-10-2025 | 4,053 *Material Issue* ("Indent"), 89 Purchase, 3 Transfer; 6 email notifications |
| | Stock Entry | 4,496 (+11,227 rows) | 03-03-2026 | Material Issue 4,041, Transfer for Manufacture 247, Manufacture 197, Receipt 11. Add-on: 13 KB form script, 5 server methods (transfer items, supplier, serial nos) |
| | Delivery Note | 77 | 23-12-2024 | Sales side; India Compliance e-way bill fields |
| | **Purchase Receipt** | **5,593** (+11,378 rows) | **today** | Thiru R's GRN. 1,215 drafts, 4,364 To Bill. 25 custom fields (Gate Entry link, GST, e-way bill, transporter) + 27 on rows (bags, GST split). 4 print formats ("Goods Receipt", "Puchase Receipt Format", "Purchase Receipt PF", "QR Codes"); 2 notifications |
| | Pick List | 0 | never | |
| | Delivery Trip | 0 | never | |
| Stock Reports | Stock Ledger | 26,041 entries | today | Captured live: 22,629 rows (cancelled entries hidden) |
| | Stock Balance | 4,689 bins | today | Captured live for 31-03-2024 → 21-11-2026 (4,425 rows) and 01-04-2025 → 21-11-2026 |
| | Stock Projected Qty | | | Captured live (4,680 rows) |
| | Stock Summary | | | Page over the bins (actual / reserved / ordered / projected) |
| | Stock Ageing | | | Captured live (4,187 rows), FIFO ageing 0-30 / 30-60 / 60-90 / 90+ |
| | Item Price Stock | | | Captured live (5,352 rows) |
| | Warehouse Wise Stock Balance | | | Captured live (29 warehouses) |

**Behind these screens** (not links on the three cards, but every Purchase Receipt and Stock Entry writes them):
Stock Ledger Entry 26,041, Bin 4,689, Serial No 24,803, Batch 3,021, Quality Inspection 2,375 (+32,786 readings),
Stock Reconciliation 305, Landed Cost Voucher 378, Packing Slip 78, Warehouse 34, Stock Entry Type 8, UOM 301.
Stock Settings: **FIFO** valuation, no negative stock, default warehouse *Stores - PESPL*, default UOM *Nos*.

## 4. Thiru R's chain: Purchase Order → Gate Entry → Purchase Receipt

* **Gate Entry** is the add-on's own document (`pacific_group`, submittable, `GE-{financial year}-#####`): a vehicle
  at the gate against one PO — PO, supplier, invoice no/date, vehicle no, location, gate entry date — and its items
  (PO qty, received qty, balance). It links forward to the receipt (*Inward No*), and the receipt links back
  (`Purchase Receipt.gate_entry`). Two email notifications (saved, submitted); print format *GATE ENTRY PRINT*.
* **Purchase Receipt** receives the PO's items into a warehouse, raises Quality Inspections and Serial Nos /
  Batches, writes the Stock Ledger, and is the base of Landed Cost Vouchers.
* **The owner will explain the Gate Entry workflow separately.** Until then it is not built; its 4,682 records are
  imported unchanged (with their 13,919 rows), so nothing is lost.
* **What its form did** (the add-on's script, captured 21-11 — reference for when the owner explains it, not a design):
  the PO picker offered submitted POs not Closed and less than 99 % received; choosing the PO filled the rows from the
  PO's items (PO qty, balance = PO qty) and rows could not be added by hand; typing the received Item Qty set Bal Qty =
  PO Qty − Item Qty; the date defaulted to today. Once submitted and while it had no Inward No, **Create › Purchase
  Receipt** made the receipt from the PO (server method `gate_entry.create_purchase_receipt`, not obtainable) and set
  the receipt's gate entry, Bill No (= the invoice no) and Bill Date (= the invoice date).

## 5. Data secured (21-11-2026, before the shutdown)

| What | Where (gitignored) | Check |
|---|---|---|
| Full backup `20261121_164427` (database 42.8 MB, public + private files) | `data/erpnext-backup/` | Counted against the live site minutes later: 35 of the 39 parent DocTypes equal (every document type of both modules). The other 4: 3 new bins, 2 comments, 1 version — live work since 16:44 — and Workflow Action, which the site counts per user. The 22 child tables can't be counted over the API; their rows travel with their parents in the same dump. |
| Table inventory (751 tables, 263 with rows, 828 DocTypes) | `data/inventory/20261121.json` | `scripts/analysis/inventory.py` |
| The live reports' answers: Stock Balance ×2, Stock Ledger, Stock Projected Qty, Stock Ageing, Item Price Stock, Warehouse Wise Stock Balance, Item-wise Purchase History | `data/erpnext-live/live-stock-reports-20261121.json` (28 MB) | The golden check for our reports (as the 3,227 POs are for the PO engine) |
| Every screen's definition: 93 DocTypes, 2,497 fields, custom fields, property setters, permissions, notifications, naming series, warehouses, entry types; 16 print formats | `docs/reference/erpnext-setup/stock/` | `scripts/analysis/extract_stock_setup.py` |
| The add-on's form scripts (Item, Item list, Stock Entry, Purchase Receipt, Delivery Note, Quality Inspection, Packing Slip; PO unchanged since 16-11) | `docs/reference/live-capture/stock/` | Verbatim |
| Gate Entry's and Defects' form scripts (the only copies: not public assets, not in the backup) | `docs/reference/live-capture/stock/pacific_group_{gate_entry,defects}.js` | Saved 21-11 17:36 once the owner allowed the site's downloads in Chrome. The 7 add-on scripts fetched before are identical to this capture. |
| The live merged form definitions (38 DocTypes with their scripts, list scripts and templates) and the 8 reports' filter scripts (4.2 MB) | `data/erpnext-live/live-meta-20261121.json` | As the old site served them to the forms, customisations merged |
| ⚠ The add-on's **server** code (`pacific_group.customisations.*`, Gate Entry's `po_items`) | not obtainable (not in the backup, not served) | Derive from the data, as for the PO in Phase I |

**The final backup** must still be taken on the last day, after the last entry on the old site, and imported at
cut-over (as in `10-merge-guide.md` §4.2).

## 6. Access

| Login | Role here | Sees | In the Main ERP (merge) |
|---|---|---|---|
| Althaf | `PURCHASE` | **Buying** (the nine sections) | `PURCHASE` (scripts/0159) |
| Thiru R | `STORE` (new) | **Buying + Stock** (+ Gate Entry when specified) | `STORE` — the Main ERP's existing store role |
| Approver | `APPROVER` | Buying, and approves POs | as now |
| Admin | `ADMIN` | everything | `ADMIN` |

The PO screens are one shared set: Thiru R raises POs exactly as Althaf does (891 of the 3,227 are his).

## 7. Build order

Ordered by what the two users do **today**, so the switch-over loses no daily work:

1. ✅ **Navigation** (21-11): Buying is the module heading over its nine sections; Stock shows its three cards'
   built sections (Item so far); each module by role (`lib/purchase/nav.ts`, `tests/purchase/nav.test.ts`).
2. ✅ **Data layer** (21-11): 27 tables (`docs/02` Phase II), `stock-build.ts` in the importer, every count and the
   stock sums reconciled with the backup, `verify:erpnext` covering them (`docs/03`, re-run on 21-11).
3. **Purchase Receipt** (list, form, print formats, submit/cancel writing the Stock Ledger with FIFO valuation,
   Quality Inspection and Serial No / Batch on receipt), then **Landed Cost Voucher**.
   * ✅ (21-11) **The list and the read-only form** of every receipt (`/purchase/receipts`): the old list (Title,
     Status, Date, Grand Total, Gate Entry, ID; filters ID / Title / Company / Status; 20 / 100 / 500 / 2500; newest
     posting date first, Thiru R's own setting) and the old form drawn **from its own definition** — the form
     engine `lib/purchase/doc/` (86 layouts captured 21-11 by `scripts/analysis/extract_layouts.py`, a safe
     evaluator for all 193 show/hide conditions, Frappe's read-only rules, the grid width budget, ERPNext's
     currency labels and buying toggles). Checked against the live PR/25-26/MM-03433: the same fields, in the same
     order. Every Stock form reuses it.
   * ✅ (23-11) **Connections** (the live dashboard's groups: Related, Reference, GST Logs, Returns, Subscription, with
     counts; no invoice, asset, e-waybill log, integration request or auto repeat ever referred to a receipt),
     **GST Breakup** (India Compliance 14.34.6 built it on every load, never stored: HSN-wise, CGST/SGST or IGST —
     `lib/purchase/doc/gst-breakup.ts`; it agrees with the Tax Breakup ERPNext stored), and the **timeline** (the old
     history, comments and emails of every stock document: 31,922 events in `purchase_doc_events`; field names from
     the captured layouts). On the way: Frappe 14.101 shows a field that had no value as "from null" (its html2text
     reads null as text) — the PO timeline now does too.
   * ✅ (23-11) **The stock valuation engine** (`lib/purchase/stock/{valuation,ledger-engine}.ts`, ERPNext 14.92's
     FIFOValuation and process_sle: FIFO queue, batch-wise running averages, serial numbers, reconciliations, the
     negative-stock refusal). `npm run golden:ledger` replays all 22,630 live entries from nothing: **22,619 equal on
     every figure**. The site's currency precision changed over time (System Settings history: 2 from 24-07-2024,
     3 from 13-11-2024; float precision 3 again from 23-12-2024): 106 entries are equal at their day's 2 decimals.
     The 11 others were all last written Aug–Dec 2024, in that changeover (tiny rate and paisa differences) or are
     reconciliations of serialised slabs that took the reconciliation's own rate. Since 23-12-2024 every entry
     replays exactly — the settings new receipts post under. ERPNext's valuation counted the entry cancelled only
     by its docstatus (MAT-RECO-2024-00247); its reports skip it.
   * Next: entering and editing drafts (1,215 on the old site), submit / cancel posting the stock ledger with this
     engine, the four print formats (default "QR Codes"), then Landed Cost Voucher.
4. **Stock Reports** — each checked against the captured live answers (`npm run golden:stock`):
   * ✅ **Stock Ledger** and **Stock Balance** (21-11): `lib/purchase/stock/reports.ts` (ERPNext 14.92's arithmetic,
     Python floats, Banker's Rounding (legacy) at precision 3), pages `/purchase/stock-ledger`, `/purchase/stock-balance`.
     Equal to the old site on every row: Stock Balance 31-03-2024 → 21-11-2026 4,424 / 4,424, 01-04-2025 →
     21-11-2026 4,232 / 4,232; Stock Ledger 22,629 / 22,629 in the same order. Found on the way: one 2024 ledger
     entry (MAT-RECO-2024-00247) cancelled only by its docstatus — the reports skip it, as ERPNext's did.
     Filters not yet built: Warehouse Type, Valuation Field Type, Include UOM, Show Variant Attributes, Show Stock
     Ageing Data (Balance); Brand, Project, Include UOM (Ledger); the ledger's Balance Serial No column.
   * Stock Projected Qty, Stock Summary, Stock Ageing, Item Price Stock, Warehouse Wise Stock Balance — next.
5. **Items and Pricing:** Item Group, Price List, Item Price (and its automatic insert from PO / PR), then the
   five unused masters (Product Bundle, Shipping Rule, Pricing Rule, Item Alternative, Item Manufacturer, Customs
   Tariff Number).
6. **Stock Transactions:** Material Request, Stock Entry (with the add-on's transfer and serial-no behaviour),
   Delivery Note, Pick List, Delivery Trip.
7. **Gate Entry**, once the owner has explained it.
8. **Access** for the two logins, the acceptance checklist extended, the merge script regenerated.

## 8. Owner decisions

1. **Landed Cost Voucher** is outside the three cards but Thiru R uses it weekly (last 18-11-2026). Proposed:
   build it (step 3), or his receipts' landed costs stop.
2. **The rest of the old Buying workspace** (Purchase Invoice, Request for Quotation, Supplier Quotation, Supplier
   Group, Supplier Scorecard, Promotional Scheme, Buying Settings, Buying reports): unused by both (≤1 record
   each). Proposed: data kept in the backup, screens not built unless asked.
3. **Accounting entries** the receipts and stock entries made on the old site (GL Entry 18,860): this module does
   no accounting. Proposed: kept in the backup only.
4. **Job Card slab register** (the add-on's *Stock Entry Serial No*, 23,698 rows on 286 Job Cards — Manufacturing,
   not Stock): kept in the backup; not part of this module.
5. **At the merge:** the Main ERP already has a Store (Add Bag, Resin Intake, RM Invoices, RM Assignment) and an
   Inventory module. Material Request and Stock Entry stopped on the old site in 10-2025 / 03-2026 — perhaps moved
   there. Confirm which stock screens the store will use after the merge, so stock is not kept twice.
6. **Gate Entry workflow** — to be explained by the owner.
7. **The final backup** — the day and hour the old site stops taking entries.
