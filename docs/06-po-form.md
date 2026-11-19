# Step 6: Purchase Order form

**Status:** done (18-11-2026). A Procurement Manager (the Admin login) created a PO, approved it, held, resumed,
closed, re-opened, updated its dates and items, cancelled and amended it in the browser. Every figure and history line
was checked in the database. The test POs were then removed, so the local data is again the 3,199 imported POs.

**Code:**
- **Pages:** `src/app/purchase/orders/{new,[id]}/page.tsx`
- **Server actions:** `src/app/purchase/orders/{actions,fetches}.ts`
- **Link search API:** `src/app/api/purchase/lookup/route.ts`
- **Form:** `src/components/purchase/form/`
  - `OrderForm.tsx`: header, buttons, tabs, Save
  - `DetailsTab.tsx`, `OtherTabs.tsx`, `RowForms.tsx`, `Breakup.tsx`
  - `UpdateItemsDialog.tsx`
  - `controls.tsx`, `Grid.tsx`, `HtmlEditor.tsx`
  - `context.ts`: state and live totals
  - `triggers.ts`: field fetches
  - `rows.ts`
- **Rules (`src/lib/purchase/orders/`):**
  - `form-schema.ts`: what is typed; one zod schema for the browser and the server
  - `save.ts`: validation, server recompute, numbering, write, history
  - `transitions.ts`: workflow actions, Update, Update Items
  - `workflow.ts`: which actions a state and a role allow
  - `gst-rules.ts`: India Compliance's GST checks
  - `masters.ts`, `fetches.ts`: what a field change fetches
  - `record.ts`, `load.ts`, `form-load.ts`: a stored PO as the form opens it; new, duplicate and amend
  - `version.ts`: the change history in ERPNext's Version shape
  - `settings.ts`: the old site's Buying and Accounts Settings
  - `numbering.ts`, `options.ts`
- **Seams added:** `src/lib/purchase/server/{write,audit}.ts`
- **Check script:** `scripts/check-drafts.ts`

**Tests:** `tests/purchase/form.test.ts`: workflow by role and state, Version diff, GST checks, pricing, empty rows,
schema messages, numbering.

## 1. Server authority

1. **Same schema.** The browser validates with `orderFormSchema` before it sends anything. The server action parses the
   same schema again.
2. **Masters resolved.** Every link is looked up by name: supplier, items, accounts, warehouses, addresses, templates
   and the rest. What is missing or not allowed is refused with ERPNext's own message, beside the field.
3. **Recomputed.** The calculation engine (Step 4) recomputes every figure. Each stored number is the server's, never
   the browser's. The browser runs the same engine only for the live totals while typing.
4. **One transaction.** The write and its history happen together. A PO changed since the form was opened is refused:
   "This Purchase Order was changed by someone else…".

`npx tsx --conditions=react-server scripts/check-drafts.ts` re-checks all 542 stored drafts with these rules:

- **532 pass.**
- **10 are refused**, each one a draft ERPNext would also refuse today:
  - 5 hold items disabled since;
  - 4 hold the retired Mode Of Transport option "Air / Ship";
  - 1 names a renamed payment term.
- **Totals.** Where a re-saved draft's totals differ, they are the old-site defects you approved correcting (D1–D3). The
  old-precision era shows the same way. The golden check reproduces the stored figures with the old rules.

On the 19-11-2026 backup: 548 drafts, **538 pass**, and the same 10 are refused.

## 2. Rules kept from the old site

**On save (ERPNext 14 `PurchaseOrder.validate` and controllers):**
- **Supplier.** A supplier on hold for "All" or "Invoices" until its release date is blocked. So is a disabled
  supplier.
- **Items.** An item must exist, must not be disabled or past its end of life, and must not be a template. A stock
  item needs a warehouse. A warehouse must be enabled and belong to the PO's company.
- **Whole-number UOMs.** No fractions, for the row's UOM and its stock UOM.
- **Minimum order quantity.** Counted over all of an item's rows. The same item may sit on several rows: Buying
  Settings allowed it, and 184 POs do so.
- **Taxes.**
  - Tax accounts must belong to the company.
  - The taxes template must be enabled.
  - With no stock or fixed-asset row, "Valuation" taxes become "Total".
- **Payment schedule.**
  - An empty schedule is filled from the Payment Terms Template, or with one 100% row due on the PO date. The
    template's Payment Terms are looked up then, so the rows link to them (fixed 19-11-2026: a duplicated PO, whose
    schedule Frappe's no-copy leaves empty, failed to save when its template named its terms).
  - Duplicate due dates are refused.
  - The amounts must add up to the Grand / Rounded Total.
- **Grand Total.** The company-currency Grand Total must not be negative.
- **Header.** Required By is the earliest row's. Title keeps the literal "{supplier_name}", as all 3,199 POs do.
- **Select fields.** A retired option is refused with Frappe's message ("Mode Of Transport cannot be …").

**India Compliance's GST checks (`gst-rules.ts`):**
- **Place of Supply.** It must be a valid option. Left empty, it becomes the company GSTIN's state.
- **Mandatory fields.** Company Billing Address, Company GSTIN and GST Category.
- **GST Category against the GSTIN.** The category must suit the GSTIN, using the GSTIN formats.
- **GST accounts.**
  - No CGST/SGST on an inter-state supply, and no IGST on an intra-state one.
  - Both CGST and SGST, or neither.
  - No reverse-charge account without reverse charge.
  - No GST from a supplier without a GSTIN, from a composition dealer, or when the company and party GSTIN are the
    same.
  - The charge type must suit the GST account.
- **Reverse charge.** The input GST and the reverse charge booked against it must balance.
- **Actual GST rows.** Their per-item amounts must match the rates.
- **Not replicated:** the live GSTIN status check (it needed India Compliance's paid API), and one warning-only
  message.

**Numbering:**
- **New PO.** It takes the next number of `PUR-ORD/25-26/` inside the save's transaction. The row lock orders two
  saves made at the same moment.
- **Amendment.** It is named after the cancelled PO: "-1", then "-2". A PO can be amended only once.
- **Deleted draft.** Deleting the newest draft gives its number back (Frappe's `revert_series_if_last`).

**Field fetches (`triggers.ts`), as the old form's scripts did:**
- **Supplier:**
  - It brings its address, contact, currency (with the exchange rate), price list and Payment Terms Template.
  - It brings its Tax Category: the address's first, then the supplier's.
  - It picks the GST template that India Compliance would have picked.
- **Supplier Address.** It brings its texts and Tax Category, and re-picks the template.
- **Required By.**
  - The header date fills every row that has none.
  - Without a header date, a row's date fills the other empty rows.
- **Item:**
  - It brings its name, description, UOM and factor, and Item Tax Template (by Tax Category and date).
  - It brings its warehouse, accounts and weight.
  - Price List Rate, discount and margin set the rate (`apply_pricing_rule_on_item`).
- **Currency or date.** The exchange rate comes from the stored Currency Exchange records, stale ones included, as
  Accounts Settings allowed. Otherwise it comes from frankfurter.dev, the old site's Currency Exchange Settings, and
  only the two currency codes and the date are sent.
- **Templates:**
  - The Tax Category brings its template, and each row's Item Tax Template follows it.
  - A taxes template brings its rows.
  - A Terms template brings its text.
  - A Payment Terms Template brings its dated schedule.
- **Cost Overheads (the add-on).**
  - A service item brings its account. A repeated service item drops the new row.
  - Typing a charge replaces that account's Actual GST tax row. The row is the service item's highest template rate on
    the account's charges, matching the 258 historical rows (for example 18% of 274 = 49.32).
- **Empty rows.** Rows left empty are dropped before a save, as Frappe did.

## 3. Workflow and buttons

The old workflow (`po_setup.json`) and ERPNext's form buttons (`purchase_order.js`, Frappe's toolbar) decide what each
state offers. `access.ts` decides who:

| State | Buttons | Who |
|---|---|---|
| new / draft with changes | Save | Purchase, Admin |
| draft, saved | Actions ▾ Approve, Reject | Approver, Admin |
| draft | ⋯ Delete | Purchase, Admin |
| submitted, not fully received and billed | Update Items; Status ▾ Hold / Resume, Close | Approver, Admin |
| submitted, not fully received and billed | Cancel | Approver, Admin |
| Closed | Status ▾ Re-open | Approver, Admin |
| submitted, after changing an allowed field | Update (Required By, print settings) | Approver, Admin |
| cancelled, not yet amended | Amend | Purchase, Admin |
| any saved PO | ⋯ Duplicate, Reload, New Purchase Order | Purchase, Admin (Reload: anyone) |

**What each action does:**
- **Approve and Reject.** Both submit the PO, as the old workflow did; Rejected is submitted too. The draft is checked
  again first, and every figure is recomputed. The status becomes To Receive and Bill. Items' Last Purchase Rate is
  updated, as Buying Settings had it.
- **Cancel.** A submitted receipt or invoice made against the PO refuses it ("Cannot delete or cancel because …").
  Frappe offers Cancel in every submitted status.
- **Hold.** It asks for a reason, kept as a comment ("Reason for hold: …").
- **Resume and Re-open.** They recompute the status from % received and billed.
- **Update Items (`update_child_qty_rate`):**
  - Removing a row with anything received or billed is refused.
  - Quantity cannot go below what was received.
  - A rate cannot take the amount below what was billed.
  - A new row takes the item's defaults.
  - Then everything is recomputed, the payment schedule included.
- **Duplicate.** It copies everything except Frappe's no-copy fields (status, payment schedule, print heading, received
  and billed quantities).
- **Amend.** It copies everything into a new Created draft.

**History (the old site's shapes, seen in the 9,216 imported entries):**
- **Approve:** a Label (the new status), a Version, then a Workflow line ("Approved").
- **Edit and Update:** a Version, with fieldnames and formatted values ("₹ 1,847,340.00", "25-11-2026"), plus row
  changes, additions and removals.
- **Cancel:** a Version (status → Cancelled, docstatus 1 → 2).
- **Hold, Resume, Close, Re-open:** a Label each.
- **Delete:** a Deleted line keeping the draft's last content.
- **Create:** nothing; the old site recorded nothing either.

The timeline that shows these lines is Step 8.

## 4. Screen

**Layout.** Tabs, sections, fields and grid columns follow the captured screens (`docs/reference/live-capture/`):
- Details; Address & Contact; Drop Ship (hidden on a submitted PO without a customer); Terms; More Info; Connections.
- Each grid has its row form ("Editing Row #n"), row checkboxes for Delete, and Add Row.

**Display:**
- Labels carry the currency ("Rate (USD)"). Company-currency totals appear when the currencies differ.
- Numbers and dates use the old site's formats (#,###.###, dd-mm-yyyy).

**Behaviour:**
- A submitted or cancelled PO shows its stored figures. They are never recomputed for display.
- "Not Saved" shows while there are changes. Ctrl+S saves. Leaving with changes asks first.

## 5. Not in this step

**Left out because unused in 2.5 years (plan §5):** Is Subcontracted, Shipping Rule, Incoterm, Project, Order
Confirmation No/Date, Auto Repeat. Their stored data is kept.

**Later steps:**
- **Step 7:** Print / PDF.
- **Step 8:**
  - the sidebar (Assigned To, Attachments, Shared With, Tags, likes);
  - comments and the timeline;
  - the email notifications.

**Other modules (not replicated):** Create ▾ (Purchase Receipt, Purchase Invoice, Payment, Payment Request,
Subscription).

**Not built yet, pending your call:**
- **Get Items From** (Material Request, Supplier Quotation, Product Bundle) and **Tools ▸ Link to Material Request.**
  Both wait on the open Material Request decision (plan §5).
- **Tools ▸ Update Rate as per Last Purchase.**
- **The grid's Add Multiple, Download and Upload.**
- **Scan Barcode and the ‹ › record arrows.**
- **Item Prices and pricing rules.** Price-list rates exist on only 43 lines, so a new row's rate starts at 0 and is
  typed (plan §5).

**Testing note.** Role rules are covered by unit tests. The browser test used the Admin login. It is the only local
account, so no Purchase-only or Approver-only login was tried in the browser.
