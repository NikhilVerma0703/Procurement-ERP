# Stock › Masters & Reports: every section, the old list view, the five further reports

**Date:** 24–25-11-2026 · **Asked by the owner (24-11-2026):** "there are too many sections inside each:
(1) Items and Pricing (2) Stock Transactions (3) Stock Reports, but you made only one 'Item' inside Items and
Pricing — so make all these remainings"; then, of the Gate Entry List: "in the original website it is looking
different … some extra columns and icons".

Built from the old site's own definitions and code, captured before its shutdown (`data/erpnext-live/`):
the form layouts (`lib/purchase/doc/layouts`), each DocType's list script, form script and Thiru R's list
settings (`live-meta-20261121.json`), the list and report screens (`live-screens-2026112{3,4}.json`), the desk's
own list bundle (`live-assets-20261123.json`) and the reports' answers (`live-stock-reports-20261124.json`).

## 1. What is where

The sidebar's Stock module lists every link of the old Stock workspace's three cards, in its order
(`routes.ts` PURCHASE_MODULES; Gate Entry stands before Purchase Receipt, the receipt it leads to).

| Card | Section | Here | Records |
|---|---|---|---:|
| Items and Pricing | Item | its own screen (docs/09) | 7,358 |
| | Item Group | tree + form, entered here | 28 |
| | Price List · Item Price | list + form, entered here | 9 · 5,220 |
| | Product Bundle · Shipping Rule · Pricing Rule · Item Alternative · Item Manufacturer · Customs Tariff Number | list + form, entered here (never used on the old site) | 0 |
| Stock Transactions | Material Request · Stock Entry · Delivery Note | list + form, **read-only** (§4) | 4,145 · 4,496 · 77 |
| | Gate Entry · Purchase Receipt | their own screens (docs/13) | 4,697 · 5,608 |
| | Pick List · Delivery Trip | list, read-only (never used) | 0 |
| Stock Reports | Stock Ledger · Stock Balance | docs/12 §7 | |
| | Stock Projected Qty · Stock Summary · Stock Ageing · Item Price Stock · Warehouse Wise Stock Balance | §5 | |

Code: `lib/purchase/doc/screens.ts` (one entry per screen: where its records are kept, the old sort, whether
records are entered here), pages `app/purchase/[doctype]/` (list, `[id]`, `new`) and `app/purchase/item-groups/`;
components `components/purchase/doc/{DocList,DocPages,DocEditor,ItemGroupTree}.tsx`.

## 2. The list view (every Stock list, and the Gate Entry List)

`lib/purchase/doc/list-view.ts` is Frappe 14.101's list view, read from the old site's own list bundle and held
to every captured list (`tests/purchase/stock-screens.test.ts`):

* **Columns** — the title field (or ID), Status when the DocType has one, then its "in list view" fields, cut
  to **4 columns in a window up to 1,366 px wide, 6 below 1,920 px and 10 from 1,920 px** (Frappe's
  `setup_columns`, by `window.innerWidth`), then ID when the title is another field. This is why the owner's
  Gate Entry List showed Po No, Inward No, Supplier and Inward Date and the capture (a narrower window) only Po No.
* **Each row** — ☐ and ♥ (likes, as on the Buying lists), the title in bold opening the record, the status pill,
  a Select as a pill, a Percent as a bar; a click on a value or pill filters the list by it; on the right the
  empty "assigned to" avatar ("-": no one was ever assigned), when it last changed, its comment count.
* **Above** — the standard filters (ID, the title field, the "in standard filter" fields), Filter (the builder,
  any field and operator), clear filters, the sort (order and field, Frappe's options); List View ▾ (List / Tree
  for Item Group), ↻, ⋯ › Export, "+ Add <DocType>" (Actions › Export / Delete while rows are ticked).
* **Count** — "20 of 77"; past 1,000 rows "20 of 1,000+", and a click gives the exact count ("20 of 4,693"),
  as Frappe's `count_upper_bound`. 20 / 100 / 500 / 2500 and Load More.
* **Status** — `frappe.get_indicator` with each DocType's own `get_indicator` (Material Request's Pending /
  Partially ordered / Issued…, Delivery Note's To Bill / Completed / Return, Pick List, Delivery Trip).
* **Sort** — Thiru R's own setting where he had one (Material Request and Gate Entry: Created On, newest first),
  else the DocType's.
* **Where it differs:** no Report / Kanban / Calendar views; the Tag column stays hidden (no tags were used);
  ⋯ › Export gives the filtered list as a CSV file (the old one opened the Data Export dialog); a user's saved
  list filters are not kept (Thiru R's Material Request list opened filtered to "Pending").

## 3. The masters of Items and Pricing (entered here)

`DocEditor` draws the old form from its layout; `lib/purchase/doc/master-form.ts` holds each form script's
behaviour (what a link searches, what choosing one fetches, mandatory toggles, locked fields, the custom
buttons); `doc-save.ts` saves on the server (CLAUDE.md: the server keeps only what may be typed, fetches the
rest again, applies the DocType's rules, Frappe's mandatory and link checks, names the record, one transaction;
edits of Item Price, Item Alternative, Item Manufacturer and Customs Tariff Number are recorded as Versions,
deletions as Deleted Documents). The rules, from ERPNext 14.92:

* **Item Group** (tree view: Collapse / Expand All, New, a node's Edit / Add Child / Delete; ⋯ › View List) —
  named by its name; the parent defaults to All Item Groups and must be a group; a group with children stays a
  group; a name an item has is refused; the root is read only; a group with children, or one items use, is not
  deleted. The form's "Item Group Tree" and "Items" buttons. *Rename is not offered* (it would rename the group
  on every item, receipt and order line).
* **Price List** — buying or selling; saving it updates its Item Prices' currency, buying and selling
  (`update_item_price`); not deleted while an Item Price, PO, receipt or supplier names it; "Add / Edit Prices".
* **Item Price** — the item must exist and not be a template; the price list must be enabled (its buying,
  selling and currency are taken); Valid From ≤ Valid Upto; no duplicate (item, list, UOM, dates, packing unit,
  customer, supplier, batch); the reference is the supplier or customer; named with a 10-character hash.
* **Product Bundle** (named by its parent item, which must not be a stock item; no bundle inside a bundle),
  **Shipping Rule** (Fixed needs an amount, the others conditions; From < To; one open band; bands sorted; no
  overlaps), **Pricing Rule** (PRLE-.####; the Apply On table, Applicable For, buying/selling, min/max, rate or
  discount, currency of the price list, dates, condition; only the chosen options' values kept), **Item
  Alternative** (items that allow it, not itself, the same stock setting, once per pair), **Item Manufacturer**
  (no duplicate; the item's default manufacturer), **Customs Tariff Number** (named by its number).
* **Checked:** `npm run check:stock-forms` saves, edits and deletes every one of them through this code against
  the local database — 67 checks, each refusal with the old message — and leaves nothing behind.
* **Where it differs:** what these never-used masters did to transactions (a Pricing Rule's rate on a PO line,
  a Shipping Rule's charge, a bundle's packed items, an alternative on a work order) is not applied — none was
  ever made; the old site held no Manufacturer, so an Item Manufacturer cannot be saved (as there). The automatic
  Item Price on a PO / receipt rate (*Stock Settings › Auto Insert Price List Rate If Missing*) is not built yet.

## 4. The transactions (read-only)

Material Request, Stock Entry and Delivery Note show every old record — the list as above, the form drawn from
its layout with its rows, links opening the items, POs and other records here, and its timeline (history,
comments, emails). Entering them is not offered: Material Requests stopped on 30-10-2025, Stock Entries on
03-03-2026, Delivery Notes on 23-12-2024, and the store may keep them in the Main ERP after the merge
(docs/12 §8, decision 5). Pick List and Delivery Trip were never used.

## 5. The five further reports

`lib/purchase/stock/reports-more.ts` (ERPNext 14.92's report code, ported), loaders `reports-more-data.ts`,
pages under `app/purchase/`. `npm run golden:stock` holds each to the old site's own answer of 25-11-2026 —
**every figure and every row, in the old order**:

| Report | Rows equal |
|---|---:|
| Stock Projected Qty | 4,682 / 4,682 |
| Stock Ageing | 4,193 / 4,193 |
| Item Price Stock | 5,353 / 5,353 |
| Warehouse Wise Stock Balance | 29 / 29 |
| (Stock Balance ×2, Stock Ledger, as before) | 4,430 · 4,238 · 22,646 |

(Against the final backup and the old site's answers of 25-11-2026 09:59, §7; on 24-11 the same checks held for
that morning's data.)

* The old database sorted text by MariaDB's utf8mb4_unicode_ci (“ after ", "½" as "1⁄2", invisible
  characters ignored): `stock/collation.ts` reproduces it for the reports that listed in that order.
* **Stock Ageing** — FIFO slots per item from the ledger (transfers within a voucher, reconciliations, negative
  stock as the old code), ranges 0–30 / 31–60 / 61–90 / 91+ by default; its rows end sorted by Average Age
  (the old code's chart sorted the report's own list), and the chart of the ten oldest.
* **Warehouse Wise Stock Balance** — the old roll-up into groups, kept as it was (a group inside a group passes
  on only its own entries' value).
* **Stock Summary** — the Bins with any stock, order or reservation, Projected qty ascending, 20 a page with
  More, each page's bars scaled to its own largest figure; the figures printed as the old page did ("4107.726").
  *Its Move / Add buttons are not offered* (they made Stock Entries, §4).
* *Not built:* the "Include UOM" filter (as on Stock Balance).

## 6. Data and the merge

* New table `purchase_documents` (model `PurchaseDocument`: doctype, ERPNext name, docstatus, the record and its
  rows in `legacy`) for the DocTypes the old site never used; `purchase_item_groups.legacy` (the importer keeps
  the item group's whole row). Migrations `20261124090207_stock_screens`, `20261124120000_stock_documents_erpnext_name`;
  `merge/` rebuilt (`npm run merge:sql`). A reload from the backup empties `purchase_documents` too.

## 7. The last day's work (25-11-2026)

GE-25-26-03522 (JEONJIN CORPORATION, on the owner's screenshot) was missing: the team had kept working on the
old site all through 24-11-2026 after the 08:54 backup — 4 gate entries (03522–03525), 4 receipts (MM-03458–03461)
with 7 stock ledger entries, 3 new POs (02560–02562) and changes to 3 others, a supplier, an item, an item price
and a landed cost voucher (listed from the old site's API, read only). A new final backup, **20261125_095508**,
was taken on the old site's Backups page and loaded: "✓ Import matches the backup" — 3,232 POs, 4,697 gate
entries, 5,608 receipts, 26,060 stock ledger entries. The old site's own report answers were captured again at
09:59 (`live-stock-reports-20261125.json`): every stock report equal row for row; the PO, ledger and receipt
golden checks as before (0 unexplained). Anything entered on the old site after 09:55 on 25-11-2026 needs one
more backup.
