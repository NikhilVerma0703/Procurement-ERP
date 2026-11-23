# Step 9: acceptance, sign-off and open decisions

**What this is:** the checklist the Procurement Manager works through with you before the old Purchase Order screens are switched off (plan, Step 9). Its last sections are the sign-off and every decision still open.

**Where to run it:** the standalone app, or a Neon branch after the merge, loaded with the final backup (`npm run import:erpnext`). Nothing done there is kept: the next import replaces it. A short run on production follows the cut-over ([10-merge-guide.md](10-merge-guide.md) §4).

**How to read a row:** do what the middle column says, then check the right-hand column. Mark ✓ or ✗ and note anything that differs from the old site. The old site's PDFs and screenshots are kept in `docs/reference/` (and locally under `screens/`, `pdfs/`) for comparison.

## A. Logins and access

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| A1 | Sign in as a **Purchase** login. | The sidebar shows Purchase Order and the masters (Supplier, Item, Address, Contact, Purchase Taxes and Charges Template, Payment Terms Template, Payment Term, Terms and Conditions). | |
| A2 | Sign in as an **Approver** login. Open a supplier. | You can read every master, but there is no Save or Add. You can approve and reject POs. | |
| A3 | Sign out. Open `/purchase/orders`. | You are sent to the sign-in page. | |

## B. The Purchase Order list

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| B1 | Open Buying › Purchase Order. | 3,227 POs, as of the 21-11-2026 backup (plus any raised since). The columns and status colours are as on the old list. | |
| B2 | Use each quick filter in turn: ID, Supplier, Supplier Name, Company, Status. | Each one narrows the list; clearing it brings the rows back. | |
| B3 | Add a filter with the filter builder. Search, sort, then switch between 20 / 100 / 500 and press Load More. | Rows and the "N of M" count follow. The address bar keeps the view, so a bookmark reopens it. | |
| B4 | Export. | An Excel file of the filtered list downloads. | |
| B5 | Tick two rows, then shift-tick a third further down. | The heading reads "N items selected"; the rows in between are ticked too. "+ Add Purchase Order" becomes **Actions**. | |
| B6 | Tick two draft POs (Created). Actions › Approve. | "Workflow Status" lists both under Successful Transactions; the list shows them Approved. With an approved PO ticked too, Approve and Reject are not offered. | |
| B7 | Tick a few POs. Actions › Print, keep PDF PO, Print. Then tick a cancelled PO and Print again. | One PDF, `Purchase-Order.pdf`, with each sheet in the list's order. With the cancelled PO: "You selected Draft or Cancelled documents". | |
| B8 | Tick a draft and an approved PO. Actions › Delete › Yes. | The draft is deleted. The approved PO stays: "Purchase Order … Submitted Record cannot be deleted. You must Cancel it first." | |
| B9 | Click a row's ♡, then the ♡ in the heading. Open that PO. | The heart turns red with 1; the heading's heart lists only the POs you liked ("1 filter"). The PO's sidebar shows ♥ 1 and its timeline "{you} Liked". Unlike: both go. | |

## C. Historical POs

Pick POs you know from the old site.

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| C1 | Open an approved PO, a cancelled one, an amended one (`…-1`), one in a foreign currency, and one with Cost Overheads. | Every tab, field, item row, tax row and total reads as it did on the old site. | |
| C2 | Print each in the layout the team used (default "PDF PO"). | The sheet matches the old PDF: wording, figures, layout. | |
| C3 | Read each PO's timeline. | The old history is there in the old wording ("… changed value of …", Approved, attachments, emails). | |

## D. A new PO

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| D1 | New Purchase Order. Choose a supplier. | Its address, contact, currency, price list, tax template and payment terms fill in, as on the old form. | |
| D2 | Add items. Change a UOM, a quantity and a rate. | Item name, HSN/SAC, UOM and its conversion factor, warehouse, amounts and totals follow as you type. | |
| D3 | Use a supplier in Tamil Nadu, then one outside it. | In-State GST (CGST + SGST) for the first, Out-State (IGST) for the second. The item-wise GST columns follow. | |
| D4 | Add an additional discount, a Cost Overhead row, payment terms and a Terms text. | The totals, rounded total, amount in words and payment schedule are as the old site computed them. | |
| D5 | Try to save without a supplier, with a quantity of 0, or with a whole-number UOM in decimals. | Each is refused, with the message beside the field. | |
| D6 | Save (Ctrl+S). | The PO is numbered in the `PUR-ORD/25-26/` series and shows as Draft. "Not Saved" appears while it has unsaved changes. | |
| D7 | Drop Ship: choose a customer, then a Customer Contact. | Only that customer's contacts are offered. The contact's details show under it. | |

## E. The workflow

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| E1 | As Approver: Approve one draft, Reject another. | The states and statuses change. The timeline records who did it and when. | |
| E2 | Cancel an approved PO, then Amend it. | Cancelled; the amendment is the same number with `-1`, as a draft. | |
| E3 | Duplicate a PO. Delete a new draft. | The copy is a new draft. Deleting the newest draft gives its number back to the series. | |
| E4 | Hold, then Resume. Close, then Re-open. | The statuses follow ERPNext's rules. | |
| E5 | On an approved PO: Update Items (quantity and rate). | The totals and taxes are recomputed. The change is in the timeline. | |

## F. Print and email

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| F1 | Print view: change the layout. Download the PDF, then Print. | Each layout in use renders: PDF PO, Import PO, PO print format, Purchase Order 2025, PURCHASE ORDER TEMPLATE. | |
| F2 | Email (Ctrl+E) to a test address with the sheet attached. | Once the mail settings are in, it is sent. Without them it stays "Not Sent" on the timeline. Reply works. | |

## G. Comments and attachments

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| G1 | Add a comment (Ctrl+Enter), edit it, delete it. | Each change shows on the timeline. | |
| G2 | Attach a file, open it, remove it. Then try a file over the limit. | Attached as private and opened. The over-size file is refused with its message (10 MB here; the merged limit is decision 3 below). | |

## H. Masters

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| H1 | Supplier › Add Supplier: GSTIN, name, group, email, mobile, address. Save. | The supplier is made with its primary address and contact. The GSTIN sets the GST Category, PAN and Supplier Type. | |
| H2 | On that supplier: New Address, New Contact. | Each is linked to the supplier and returns to it after saving. A postal code from another state is refused. | |
| H3 | Block Supplier, then save. | The supplier shows On Hold. A PO for it is refused. | |
| H4 | Item › Add Item without HSN/SAC, then with one. | It is refused, then saved. | |
| H5 | On a stone template item: Create › Single Variant, then Multiple Variants. | The variants are named `{template}-{abbreviations}`. A combination that exists already is reported. | |
| H6 | Change a template's Lead Time and save. | "Item Variants updated"; its variants take the new value. | |
| H7 | Payment Terms Template with rows that do not total 100%. | Refused ("Combined invoice portion must equal 100%"). | |
| H8 | ⋯ › Rename a test supplier, then try to Delete a supplier with POs. | The new name is everywhere it was used. The delete is refused ("Cannot delete or cancel because …"). | |
| H9 | On any master list: tick rows, Actions › Export; then tick a record in use and Actions › Delete. Like a row and use the heading's ♡. | A `.csv` of the ticked rows downloads. The delete is refused with the record's link. The heading's heart shows only what you liked. | |

## I. On production, after the merge

| # | Do | Expect | ✓ / ✗ |
|---|---|---|---|
| I0 | After the cut-over load ([10](10-merge-guide.md) §4.2): `npm run verify:erpnext` with `DATABASE_URL` on production, then open `/purchase/orders` on the live site. | "✓ The database holds exactly what the backup has." The list reads "20 of" the final backup's PO count; old POs open, print and export as here. | |
| I1 | Sign in with a `PURCHASE` role. | Only the module, under its "Buying" rows. An admin sees a Buying section too. | |
| I2 | The first real PO, from new to approved to PDF to email. | As above, with the real mail settings. | |

## Sign-off

| Who | Name | Date | Accepted (✓) / notes |
|---|---|---|---|
| Procurement Manager | | | |
| Owner | | | |

## Open decisions (every step)

Defaults apply where a recommendation is given and you say nothing.

| # | Decision | Recommendation | From |
|---|---|---|---|
| 1 | **Who approves after the merge.** Over the last 12 months the two buyers held both "Purchase Head" and "Admin", and approved their own POs (1,441 approvals). | Ask the Procurement Manager. Either `PURCHASE` may approve (as practised) or approval stays with the ERP's `ADMIN`. | [10](10-merge-guide.md) §5 |
| 2 | **Goods receipts.** How a new receipt is recorded: the Main ERP's Store module, or a small "receive" action in this module. It drives "% Received" and the PO status. | The Store module, if it is to handle purchase receipts. Until then, statuses stay as received history left them. | plan §5 |
| 3 | **Attachment size after the merge.** Vercel allows about 4 MB per upload; the old site allowed 10 MB. | Applied 19-11-2026 with this default: 4,000,000 bytes, as the Lab module. The 5 old attachments are 344 KB at most. | [10](10-merge-guide.md) §5 |
| 4 | **The three email notifications** (PO created / approved). The old site stopped sending them on 21-09-2024. | Keep off. | [08](08-activity-and-email.md) §4 |
| 5 | **Email to supplier.** No one ever sent one from a PO on the old site, but the plan includes it. | Keep, for all three roles. | [08](08-activity-and-email.md) §4 |
| 6 | **Which mailbox sends PO emails.** | The writer's own mail settings, else the ERP's (the Main ERP's rule). | [10](10-merge-guide.md) §5 |
| 7 | **nodemailer 8.0.11** has published security advisories (fixed in 10.6). The Main ERP uses the same version. | Upgrade in both projects together, at or after the merge. | Step 8 |
| 8 | **Material Requests:** Get Items From and Link to Material Request (6 of 8,709 lines used them). | Leave out; keep the history as text. | plan §5, [06](06-po-form.md) |
| 9 | **Smaller form tools:** Update Rate as per Last Purchase, the grid's Add Multiple / Download / Upload, Scan Barcode, record arrows. | Leave out unless the Procurement Manager uses them. | [06](06-po-form.md) |
| 10 | **Item prices and pricing rules** (price-list rates on 43 lines). | Leave out; rates are typed. | plan §5, [06](06-po-form.md) |
| 11 | **Purchase invoices / "% Billed"** (1 invoice ever). | Keep the status logic and data; no invoice screen. | plan §5 |
| 12 | **Other print layouts** (6 layouts without reference PDFs, e.g. "Drop Shipping Format"). | Only if the team still prints them; each needs a captured PDF to match. | [07](07-po-sheet.md) |
| 13 | **Unused sidebar items** (Assigned To, Tags, Shared With, Follow). Likes: added by the owner, 19-11-2026. | Leave out. | [08](08-activity-and-email.md) §4 |
| 14 | **The masters' own history** (844 supplier and 4,438 item versions, 36 item files and emails). | Import, if the team looked at it; otherwise leave in the backup. | [09](09-masters.md) |
| 15 | **Merge on Rename** (used once). | Leave out. | [09](09-masters.md) |
| 16 | **Item Group defaults and taxes** for new items (4 group tax rows). | Leave out unless the team relied on them. | [09](09-masters.md) |
| 17 | **Your separate supplier and item list files.** The plan was to match them against the imported masters (by code, GSTIN and name). It needs those files. | Send them, or confirm they are no longer needed. | plan §4, §8.5 |
| 18 | **The final backup** from the old site, if POs were raised after 21-11-2026 16:44 (the last backup imported: 3,227 POs, and the Stock documents). | Take it on the last day, and import it at cut-over. | plan Step 0 |
| 19 | **Assign To, Apply Assignment Rule and Add Tags** in the lists' Actions menu. They need assignments and tags (0 POs used them). | Leave out. | [05](05-list-screen.md) §2 |
| 20 | **Bulk Edit and Print on the master lists** (Frappe's Actions menu had both). | Leave out unless the team used them. | [09](09-masters.md) |
| 21 | **Letter Head and Page Size** in the bulk Print dialog. The PO layouts draw their own logo on A4, as the print view does. | Leave out. | [05](05-list-screen.md) §2 |

Already decided: no Report view on the list (17-11-2026); the old lists' checkboxes, Actions menu and likes are in (19-11-2026, replacing "no bulk row actions" of 17-11-2026); the old site's calculation defects are not carried over (16-11-2026, [04](04-calculation-engine.md) §6).
