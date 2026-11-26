# The search box, Gate Entry and the Purchase Receipt's submission

**Date:** 24-11-2026 · **Asked by the owner (23-11-2026):** "make that search box (a universal search box in the
existing website) … same functionality and behaviour", then "search Gate Entry List — this is Thiru R's part …
build this entire gate entry list and the Receipt section also … with all previous data".

Everything below was read from the old site on 23–24-11-2026 (as Thiru R, read-only) before its subscription
ended, and from its backup `20261124_085443` (3,229 POs, 4,693 gate entries, 5,604 receipts; the final one,
`20261125_095508`, added the last day's 4 gate entries and 4 receipts: docs/14 §7). The whole
capture is kept outside the repository (company data): `Downloads\Procurement-ERP-Data-2026-11-23\` and, for the
code, `data/erpnext-live/` (`live-search-*`, `live-gate-entry-states-*`, `live-screens-*`, `live-assets-*`).

## 1. The search box — "Search or type a command (Ctrl + G)"

Code: `lib/purchase/search/` (`fuzzy.ts`, `awesome.ts`, `calc.ts`, `global.ts`), `components/purchase/search/
UniversalSearch.tsx`, `api/purchase/search`; mounted in `app/purchase/layout.tsx` above every page.

* **The old code, ported:** Frappe 14.101's awesome bar and its fuzzy matcher (`fuzzy_match`, captured from the old
  site's desk bundle). The scores are the old site's to the digit — `tests/purchase/search.test.ts` holds its answers
  to real searches ("gate entry" → Gate Entry List 370.05, New Gate Entry 370.015, "Search for gate entry ↵" 100, Help).
* **What it lists:** "<DocType> List" and "New <DocType>" for the screens this login may open (Buying for a buyer,
  Buying and Stock for the storekeeper), in the old boot's order; "new …" ranks the New entries; "<text> in
  <DocType>" finds the text in that list (ID like %text%); "Report Stock Ledger / Stock Balance"; "Find <text> in <the
  list on screen>" (its title field like %text%, else the ID — the old route options, captured);
  a calculator; "Generate Random Password"; with nothing typed, the five pages visited most and the recent ones;
  "Help on Search" (the old table). ↑ ↓ Enter (Ctrl+Enter: new tab), Esc, Ctrl+G from anywhere.
* **"Search for … ↵"** opens the global search: every match by DocType, the old "Field : value ||| …" snippets,
  "More…" per DocType. Its DocTypes are those the old Global Search Settings listed that this ERP has: Purchase
  Order, Purchase Receipt (storekeeper), Supplier, Item, Contact, Address, Purchase Taxes and Charges Template.
  Gate Entry was not indexed there and is not here.
* **Where it differs, and why:**
  * no "… Report" (a list's report view), workspaces, dashboards, pages, tags or calendar entries — this ERP has
    none of those screens;
  * the old calculator ran `eval` on the text; here a parser takes arithmetic and `Math.*` only (the same answers,
    "03517" no sum — the old strict-mode eval refused it too);
  * the visit history behind "recent" and "most visited" is kept in the browser, per login (the old site kept it on
    its server as Route History);
  * the global search matches every word typed anywhere in the content; the old one ranked MariaDB full-text matches.

## 2. Gate Entry (the add-on's DocType)

Code: `lib/purchase/stock/gate-entry-meta.ts` (pure rules), `gate-entries.ts` (list, load, po_items),
`gate-entry-save.ts` (save, submit, cancel, delete, amend), `components/purchase/stock/GateEntryForm.tsx`, pages
`app/purchase/gate-entries/` (list, `new`, `[id]`, `[id]/print`). Sidebar: Stock › Stock Transactions › Gate Entry.

* **The list** is the old list view (docs/14 §2, since 24-11-2026): ☐ ♥ ID, Status, Po No, and from a wider
  window Inward No, Supplier (≥ 1,367 px) and Inward Date (≥ 1,920 px), as the old list chose its columns by the
  window's width; the "assigned to" dash, when each changed, comments; newest created first (Thiru R's setting);
  the ID filter, Filter, sort; "+ Add Gate Entry"; 20 / 100 / 500 / 2500 and Load More; "20 of 1,000+", a click
  giving the exact count. Actions › Delete goes through the entry's own Delete.
* **The form** from its captured layout. New: Naming Series (GE-25-26-.##### or GE-.{financial_year}.-.#####),
  Location Hosur, Invoice Date and Gate Entry Date today. Po No's picker offers submitted POs, not Closed, under
  99 % received, described "supplier, status, date, grand total". Choosing the PO fills Supplier, Po Date and the
  rows; rows cannot be added. Item Qty → Bal Qty = Po Qty − Item Qty. Numbering continues the old counter
  (GE-25-26-03522 next).
* **The add-on's server code was never obtainable;** its rules come from live probes and the old data:
  * `po_items` = each PO line's PO qty − received qty, by the line's ID; lines with nothing left are left out
    (the live answers for PUR-ORD/25-26/02373 and 02548, 23-11-2026);
  * Create › Purchase Receipt (a submitted entry without Inward No) = the PO's receipt with only the entry's lines
    whose Item Qty is above 0, each for that Item Qty, Bill No / Bill Date = Invoice No / Date
    (9,057 / 9,092 rows; 9,010 / 9,076 quantities; 4,381 and 4,418 / 4,460 bills);
  * submitting the receipt writes the entry's Inward No and Inward Date (3,263 / 3,263); cancelling it clears them.
* **States and buttons** (captured 23-11-2026): a draft Save, then Submit (⋯ Print, Delete); submitted: Cancel,
  Create › Purchase Receipt while it has no Inward No, Print; cancelled: Amend (once, "<name>-1"), ⋯ Delete.
  Submit, Cancel and Delete ask "Permanently … ?". Cancel and Delete stop while a receipt names the entry.
  No change history is recorded (the DocType had track changes off); its old comments and emails show.
* **Print:** "GATE ENTRY PRINT" (its print-designer definition): the heading and name, two columns of fields, the
  items table; the browser's Print.
* **Where it differs:** the old script emptied a saved draft's rows when its PO was changed and did not refill them
  (it refilled only new entries); here a draft's rows are refilled. The two email notifications ("… Is Saved",
  "… Is Submitted") are not sent, as the PO's are switched off (docs/11, decision 4). The "Gate Entry Reciept wise"
  query report (159,052 rows of an unfiltered join on the old site) is not built.

## 3. The Purchase Receipt's submission and cancellation

Code: `lib/purchase/stock/receipt-save.ts` (Submit = save with every check, then post; `cancelReceipt`),
`receipt-submit.ts` (the effects), `stock-post.ts` (the ledger), `receipt-doc.ts` (valuation, entries),
`ledger-format.ts`; buttons in `ReceiptForm.tsx` (Submit) and `ReceiptCancelButton.tsx`.

* **Valuation** (update_valuation_rate, every save): taxes counted in valuation spread over the stock rows by net
  amount; a row's rate = (net amount + tax share + landed cost) per stock unit, to 6 places. The old site's GST
  taxes were "Total", so its rates were the net rates.
* **Submit:** the receipt is stored as submitted ("To Bill", or "Completed" at value 0); each stock row's accepted
  quantity goes into the ledger at its valuation rate (a rejected quantity into the rejected warehouse at 0),
  named MAT-SLE-<year>-##### after the old ledger's last, valued by the FIFO engine from the previous entry's stored
  state; entries already later (a back-dated receipt) are valued again; stock never goes negative. Each touched
  Bin is refreshed (actual, value and rate from the ledger; ordered from the open POs; projected). Each PO line's
  Received Qty = the submitted receipts' received quantities (6,140 / 6,140), the PO's % Received Frappe's
  formula (2,650 / 2,650) and its status the status map's. The gate entry gets its Inward No; the item its Last
  Purchase Rate (unless a later purchase exists).
* **Cancel:** refused while a submitted Landed Cost Voucher holds the receipt; otherwise its entries are marked
  cancelled and reversed (cancelled too — the old site's own pattern), later entries valued again, the bins, the
  POs, the gate entry and the item's rate put back. The timeline records both as Versions.
* **Checked end to end on 24-11-2026** (local data, then reloaded from the final backup): GE-25-26-03523 against
  PUR-ORD/25-26/02548 (LPG Cylinder, 425 Kg) → PR/25-26/MM-03459 → MAT-SLE-2026-03649: 5,950 → 6,375 Kg,
  ₹5,52,457.50 → ₹5,91,723.25, queue […, [1275.0, 92.39]]; PO 850 → 1,275 received (75 %); the entry's Inward No set.
  Cancelled: every figure back. `tests/purchase/gate-entry.test.ts` keeps the rules and this valuation.
* **Not built yet:** receiving batch or serial-numbered items — refused with the old message ("Batch number is
  mandatory for Item …"); no receipt since 01-01-2026 had one (3,349 rows). Over-receipt is not capped: the old
  allowance was 0 %, but the role allowed past it (Accounts User) was Thiru R's. No accounting entries (docs/12 §8,
  decision 3). The Landed Cost Voucher screen is next (docs/12 §7).

## 4. The receipt's print (built 25–26-11-2026)

Code: `lib/purchase/print/` (`jinja.ts`, `receipt-print.ts`, `receipt-formats.ts`, `print-css.ts`),
`api/purchase/receipts/[id]/print` (the printed page), `app/purchase/receipts/[id]/print` and
`components/purchase/print/PrintScreen.tsx` (the print view); the printer icon on the receipt (draft or submitted).

* **The formats are the old ones, run as they were:** QR Codes (the default), Test PR, Purchase Receipt PF, Puchase
  Receipt Format, Goods Receipt — each format's own Jinja template and CSS from the old site, rendered by nunjucks
  with Python's rules put back (`jinja.ts`: "36.0", "None", Frappe's "no such element" text for a field the
  receipt does not have, empty lists false, ints and floats as Python kept them, Jinja's filters). The frappe
  calls they make are answered from this ERP's data (addresses as they are now, the POs' Order Confirmation No);
  "Puchase Receipt Format" listed every Purchase Invoice's payment schedule, not the receipt's, so its one line
  ("45 Days From The Date Of Receipt Of Material", 63071.0, from the old site's only invoice) prints on every receipt.
* **Checked:** every format of MM-03457 (GST) and MM-00407 (30 QR codes) equals the old site's own output, body and
  style (`npm run check:receipt-prints`; fingerprints read from the old site on 26-11-2026).
* **QR codes** are drawn here (the old page asked api.qrserver.com) from exactly the text that service read — the
  address as the browser sent it, cut at "&" and "#" as it was: "A & A Silicates" gave "…-None-A ".
* **The print view** as the old one: Print Format, Language, Letter Head, the three print options (they change only
  Frappe's Standard print, as on the old site), Full Page, Refresh, the form, ⋯ (Full Page, PDF, Refresh), Print.
  A cancelled receipt does not print (Print Settings). **Differs:** PDF opens the browser's print dialog (Save as
  PDF) — the old server made the PDF itself; Frappe's "Standard" format is not built yet (docs/15, X3).
