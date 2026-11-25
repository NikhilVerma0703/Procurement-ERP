# Step 5: Purchase Order list (and the standalone sign-in)

**Status:** done (17-11-2026). The list matches the old site's on the captured view, row for row; its filters,
sort, paging and export work against the 3,199 imported POs. The owner's decisions on the list extras are in §5.

**Code:**
- **The list:** `src/app/purchase/orders/page.tsx`, `src/components/purchase/list/`, `src/lib/purchase/orders/{list,list-where,queries,export}.ts`,
  `src/lib/purchase/format.ts`
- **Access seams:** `src/lib/purchase/access.ts`, `src/lib/purchase/server/{db,current-user,gate,page}.ts`
- **Standalone sign-in:**
  - `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/types/next-auth.d.ts`
  - `src/app/login/`, `src/app/no-access/`, `src/app/api/auth/`
  - `scripts/purchase-users.ts`

**Tests:** `tests/purchase/list.test.ts` (plus `routes` and `schema` updates).

## 1. Signing in (standalone only)

The list is the first screen with company data, so the standalone sign-in arrives with it, as the data-model doc
promised.

- **Accounts:** email and password, kept in `purchase_logins` (bcrypt hashes only).
- **Roles:** they mirror the old workflow.
  - **Purchase:** creates and edits drafts ("Purchase Head").
  - **Approver:** approves and rejects ("Admin").
  - **Admin:** everything.

  Today every role may view; saving and approving arrive with the form (Step 6).
- **Making accounts:** `npm run users`. Passwords are typed twice and never shown.

  ```bash
  npm run users -- add <email> --name "<Full Name>" --role APPROVER
  npm run users -- list
  npm run users -- password <email>      # new password
  npm run users -- disable <email>       # enable <email> to undo
  ```
- **Behaviour:**
  - A session lasts a working day (8 hours, refreshed while in use).
  - A disabled login or a changed role takes effect on the next click: the login is re-read on every request.
  - After ten wrong passwords, that address is locked for up to 15 minutes.
  - `AUTH_SECRET` in `.env` signs the session (see `.env.example`).
- **Kept out of the import:** a re-import never touches the logins (`migrate/load.ts`, `KEEP_ON_RELOAD`).
- **At the merge:** the Main ERP's users and roles take over. The sign-in files and `purchase_logins` stay behind, and
  the seams (`access.ts`, `server/current-user.ts`) are pointed at the Main ERP's (CLAUDE.md).

`.env` also holds a local **test login** (`PURCHASE_TEST_LOGIN_*`, role Admin), used for the checks below. It exists
only in this PC's database; remove it with `npm run users -- disable test.admin@procurement.local` whenever you like.

## 2. What the list does — as on the old site

| Old site (screen `01-list-view`) | Here |
|---|---|
| Buying › Purchase Order; Refresh, ⋯, **+ Add Purchase Order** | Same. The ⋯ menu holds **Export (Excel)**. Add opens the form, which arrives in Step 6. |
| Quick filters: ID, Supplier, Supplier Name, Company, Status | Same, applied as you type. Supplier and Company suggest their values. ID and Supplier Name match anywhere; Supplier, Company and Status match exactly (ERPNext's rule). |
| Filter builder ("N filters") | Same operators: Equals, Not Equals, Like, Not Like, In, Not In, Is set / not set, >, <, >=, <=, Between. 28 fields, including item-row fields such as Item Code. |
| Sort selector and order toggle | Same; default Last Updated On, newest first (the doctype's default). |
| Columns | Supplier Name, Status (workflow state pill: Approved green, Rejected red, Created grey), Date, Grand Total, % Billed and % Received bars, ID, time since the last change ("3 d", "1 w"), comment count. As Frappe chose them by the window's width (no List View Settings for Purchase Order): Grand Total and % Billed from 1,367 px, % Received from 1,920 px (checked against the old list at 956 px, 25-11-2026). |
| Paging 20 / 100 / 500 / 2500, **Load More**, "20 of …" | Same. |
| Figures | `₹ 189,125.68` (groups of three, 2 decimals unless the value has 3), dates `dd-mm-yyyy`, times in Asia/Kolkata. |
| Comes back as you left it (filters and sort, per user) | Same: kept in the browser for each login. |
| Clicking the status pill filters by it; clicking a row opens the PO | Same. The PO opens as a read-only summary until Step 6. |
| ☐ before each row and ☐ Select All in the heading; shift-click ticks the rows in between | Same, added by owner decision 19-11-2026. While rows are ticked, the heading reads "N items selected" (ERPNext 14's words, "1 items selected" too) and **+ Add Purchase Order** gives way to **Actions** (below). |
| ♡ before each row: red when you liked it, how many did beside it, who on hover. ♡ in the heading shows only what you liked | Same, added by owner decision 19-11-2026. The heading's heart adds the filter "Liked By like %you%", which the filter builder shows and edits like any other ("Liked By" is one of its fields, as in Frappe). Liking a PO writes "{name} Liked" on its timeline ([08](08-activity-and-email.md) §2). |

**How ERPNext's filters are matched:**
- Text ignores case.
- "Not equals", "Not like" and "Not in" also match empty fields.
- A date on Created On or Last Updated On means that whole day in Indian time.
- An item-row condition holds when any row matches.

**The address bar holds the list's state** (e.g. `?supplier_name=jeon&sort=name`), so any list can be bookmarked or
sent to a colleague.

**Export** downloads the filtered list as `.xlsx`, in its order. There are two sheets:
- *Purchase Order:* ID, supplier, dates, states, totals, % received / billed, company, tax category, created / updated;
- *Purchase Order Item:* each PO's rows.

The old users' saved report views included item columns, hence the second sheet.

**Actions on the ticked rows** (Frappe's list Actions menu), each PO through the same rule as on its own page:
- **Approve, Reject** (above a divider, where Frappe put workflow actions): offered when every ticked PO is a draft
  awaiting approval and you may approve. The POs are approved one at a time with the same checks as the form's
  button, then the "Workflow Status" dialog lists the Successful and the Failed Transactions, each failure with its
  reason. Approve sends the approval notifications as on one PO (when they are switched on). Frappe ran more than 20
  in the background; here they go 20 a request, one request after another, with a count on the button ("40 of 120"),
  up to its limit of 500, so each request stays inside Vercel's time limit ([10](10-merge-guide.md) §7). Delete goes
  in turns of 20 too.
- **Export:** the ticked POs as the same Excel file as ⋯ Export (Frappe opened its Data Export tool on them).
- **Print:** "Print Documents" asks for the Print Format (default PDF PO), then saves one PDF, `Purchase-Order.pdf`,
  every PO's sheet in the list's order (Frappe's `download_multi_pdf`). A cancelled PO stops it: "You selected Draft
  or Cancelled documents" (drafts print, as the old Print Settings allowed). Frappe's dialog also asked for a Letter
  Head and a Page Size: the layouts draw their own logo on A4, as in the print view ([07](07-po-sheet.md) §1). At
  most 40 sheets a file ("You can only print upto 40 documents at a time", Frappe's words): one answer must stay under
  Vercel's 4.5 MB, and a sheet is up to 93 KB ([10](10-merge-guide.md) §7). Print more in turns.
- **Delete** (for the roles that may delete drafts): "Delete N items permanently?", then each PO through its own
  Delete, newest number first and again for any refused while others went (Frappe's `delete_bulk`). A submitted PO is
  refused with Frappe's message ("Purchase Order X: Submitted Record cannot be deleted. You must Cancel it first.").
  Whatever was refused is listed afterwards.
- **Not offered:** Assign To, Apply Assignment Rule and Add Tags. They need assignments and tags, which are not built
  (never used on the old site, §4).

## 3. Side-by-side check

**The captured view** ("Approved" only, sorted by ID; screen `01-list-view`): the first 15 rows match exactly.
- Same suppliers, dates and Grand Totals, including `₹ 112,121.062`, `₹ 55,650.007` and `₹ 62,308,544.929`.
- Same % Received bars.
- Same "time ago", one day older now.

**Filters the old users had saved** (their ERPNext list settings, in the backup):
- Supplier Name contains "jeon": 6 POs.
- Date between 01-11-2024 and 20-11-2024: 31 POs, and Load More shows all 31.
- The export of that list: 31 POs and 75 item rows.

**Counts that tie to earlier steps:**
- "Approved": 2,643 POs.
- No Tax Category: 1,416 POs.
- Tax Category ≠ In-State: 2,240 POs (empty ones included, as on the old site).

**Sign-in:**
- Signed out, the list redirects to the sign-in page and the export answers 401.
- A wrong password is refused.
- Signing out locks the list again.

The production build (`npm run build`) succeeds.

## 4. Left out, and why

**Never used on the old site:**
- Assigned To, tags, named saved filters: 0 of 3,199 POs, 0 saved filters;
- the "assigned to" placeholder in each row.

Leaving out what was never used is the plan's default (plan §5). Likes were never used either (0 POs), but the owner
asked for them on 19-11-2026 (§2).

**Count:** shown exactly ("20 of 2,643"). ERPNext stopped counting at "1,000+" to save time; here the count is
instant.

**Report view** (ERPNext's spreadsheet-like view with chosen columns): not rebuilt, by owner decision (17-11-2026).
Five accounts had saved a layout in it, sales support and stores among them. The list's Excel export gives the same
columns, item rows included.

**Selecting rows** (checkboxes, then the Actions menu): first left out by owner decision (17-11-2026), then added by
the owner's decision of 19-11-2026 (§2). Frappe's bulk Edit is not on a PO list there either: it is hidden for a
doctype with a workflow.

## 5. Decisions

Both list extras the plan left to the owner (plan §5) were decided on 17-11-2026: no Report view, no row selection
for bulk actions (§4). On 19-11-2026 the owner asked for the old list's checkboxes and hearts after all: row
selection with the Actions menu, and likes (§2).

## 6. Next

Step 6, the PO form, replaces the read-only summary. It brings saving, the workflow actions (Approve, Reject, Cancel,
Amend, Duplicate, Close, Hold) and the role rules for them (`access.ts`, `server/write.ts`, `server/audit.ts`).
