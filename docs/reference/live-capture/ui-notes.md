# Live UI notes — Buying → Purchase Order (captured 16-11-2026)

Screenshots are in `screens/` (numbered in reading order). Reference PDFs are in `pdfs/` (see `pdfs/manifest.json`).
These notes record what a screenshot alone doesn't make obvious.

## List (`screens/01-list-view.jpg`)
- **Breadcrumb:** Buying › Purchase Order. **Title:** Purchase Order.
- **Header buttons:** List View switcher, Refresh, ⋯ menu, **+ Add Purchase Order**.
- **Quick-filter bar:** ID, Supplier, Supplier Name, Company, Status (select). Also "N filter(s)" (filter builder),
  clear filters, sort-order toggle, sort field (ID), and a "Show/hide" toggle.
- **Columns:** ☐, ♡ (like), Supplier Name, Status (workflow state pill: Created grey, Approved green), Date, Grand
  Total (currency formatted, ₹ for INR), % Billed (bar), % Received (bar), ID, then modified time-ago and comment
  count.
- **Count:** "20 of 1,000+". Paging is 20 / 100 / 500.
- **Sidebar:** Assigned To, Created By, Edit Filters, Tags, Show Tags, Save Filter (name). The capture session
  carried a saved "1 filter" (list showed Approved only).

## Form header
- **Title** = supplier name, with the workflow state pill beside it (Created / Approved / Rejected / Cancelled).
- **Draft (Created)** (`02`):
  - Buttons: **Get Items From** (Product Bundle, Material Request, Supplier Quotation), **Tools** (Update Rate as per
    Last Purchase, Link to Material Request), ‹ › (previous/next record), Print, ⋯, **Actions** (Approve, Reject).
  - ⋯ menu: Print, Jump to field (Ctrl+J), Links, Duplicate, Copy to Clipboard, Reload, Delete (⇧+Ctrl+D),
    Customize, Repeat, New Purchase Order (Ctrl+B).
- **Approved** (`11`):
  - Buttons: **Update Items**, **Status** (Hold, Close), **Create** (Purchase Receipt, Purchase Invoice, Payment,
    Payment Request, Subscription), ‹ ›, Print, ⋯, **Cancel**.
  - ⋯ menu adds Send SMS. Delete is gone.
- **Sidebar:** Assigned To (+), Attachments (Attach File), Shared With (+), Tags (Add a tag), likes and comments
  count, FOLLOW, activity lines ("X edited this · 1 week ago", "X created this").

## Details tab (`02`–`05`)
- **Row 1:** Supplier* | Date* | Company*
- **Row 2:** Shipment Type | Required By | ☐ Apply Tax Withholding Amount, ☐ Is Reverse Charge, ☐ Is Subcontracted
- **Row 3:** Mode Of Transport | Purpose. Order Confirmation No appears once approved.
- **Collapsed sections:** Accounting Dimensions, Currency and Price List.
- **Scan Barcode | Set Target Warehouse**
- **Items grid as the users actually see it:** No., Item Code*, Required By*, Quantity*, UOM*, Rate (INR), Final
  Amount (INR), ⚙ (column settings), ✎ (row form).
  - Buttons: Add Multiple, Add Row, Download, Upload.
  - The SGST/CGST/IGST columns are defined as grid columns but do **not** fit in the default width. They show in
    the row form.
- **Below the grid:** Total Quantity | Total (INR).
- **Cost Overhead section:** grid with Service Item, Service Charges; Add Row.
- **Taxes and Charges:** Tax Category | Shipping Rule | Incoterm; Purchase Taxes and Charges Template. Grid: No.,
  Type*, Account Head*, Amount (INR), Total (INR); Add Row.
- **Then:** Taxes and Charges Added (INR), Total Taxes and Charges (INR).
- **Totals:** Grand Total, Rounding Adjustment, Rounded Total, ☐ Disable Rounded Total, In Words
  ("INR Twenty Lakh, One Thousand, Three Hundred And Twenty Six only."), Advance Paid.
- **Collapsed sections:** Additional Discount, Tax Breakup, GST Breakup.
- **Then:** "Add a comment" box (Ctrl+Enter), Comment button, timeline.

### ⚠ Hidden add-on behaviour seen on PUR-ORD/25-26/02486 (draft, Out-State)

| Line | Amount (₹) |
|---|---|
| Total | 16,68,314.79 |
| Taxes: IGST 18% | 3,00,296.662 |
| Taxes: Actual "Insurance Expenses" | 49.32 |
| **Taxes and Charges Added** | **3,00,345.982** (the two rows) |
| **Total Taxes and Charges** | **3,33,010.982** (= added + 32,665 = Σ Cost Overhead charges 32,391 + 274) |
| **Grand Total** | **20,01,326.00** (rounding adjustment 0.00). Total + taxes would be 20,01,325.772. |

So the add-on's server side folds Cost Overhead charges into Total Taxes and Charges and sets a whole-rupee Grand
Total. The golden tests must settle the exact rule over all POs with Cost Overheads.

## Address & Contact tab (`06`)
- **Supplier Address:** link | Supplier Contact.
  - Address details (multi-line, ending "GSTIN: …").
  - Supplier GSTIN with live status ("Status: Active · updated 5 days ago ⟳", India Compliance).
  - GST Category.
- **Shipping Address:** link | details.
- **Company Billing Address:** link | details, Company GSTIN, Place of Supply.

## Drop Ship tab (`07`)
- Customer | Customer Contact (link), Customer Contact (text).
- On 02486 the customer is the company itself, "Pacific Engineered Surfaces Private Limited". That likely explains
  the 540 POs with a customer set.
- The tab is hidden on approved POs without a customer (02510).

## Terms tab (`08`)
- **Payment Terms:** Payment Terms Template; Payment Schedule grid (No., Payment Term, Description, Due Date*,
  Invoice Portion, Payment Amount); Add Row.
  - Note: "90 DAYS" showed Due Date = the PO date. Verify the template's credit days.
- **Terms & Conditions:** Terms (template link, used as the delivery term, e.g. "20 days"); Terms and Conditions
  (rich-text editor).

## More Info tab (`09`)
- Collapsed sections: Order Status, Printing Settings, Auto Repeat, Additional Info.

## Connections tab (`10`)

| Group | Linked documents |
|---|---|
| Related | Purchase Receipt, Purchase Invoice, Proforma Invoice |
| Payment | Payment Entry, Journal Entry, Payment Request |
| Reference | Supplier Quotation, Project, Auto Repeat |
| Manufacturing | Material Request, BOM, Production Plan, Blanket Order |
| Sub-contracting | Subcontracting Order, Stock Entry |
| Internal | Proforma Invoice |

Each shows a count when links exist.
