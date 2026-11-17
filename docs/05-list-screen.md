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
| Columns | Supplier Name, Status (workflow state pill: Approved green, Rejected red, Created grey), Date, Grand Total, % Billed and % Received bars, ID, time since the last change ("3 d", "1 w"), comment count. |
| Paging 20 / 100 / 500 / 2500, **Load More**, "20 of …" | Same. |
| Figures | `₹ 189,125.68` (groups of three, 2 decimals unless the value has 3), dates `dd-mm-yyyy`, times in Asia/Kolkata. |
| Comes back as you left it (filters and sort, per user) | Same: kept in the browser for each login. |
| Clicking the status pill filters by it; clicking a row opens the PO | Same. The PO opens as a read-only summary until Step 6. |

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
- likes, Assigned To, tags, named saved filters: 0 of 3,199 POs, 0 saved filters;
- the "assigned to" placeholder in each row.

Leaving out what was never used is the plan's default (plan §5).

**Count:** shown exactly ("20 of 2,643"). ERPNext stopped counting at "1,000+" to save time; here the count is
instant.

**Report view** (ERPNext's spreadsheet-like view with chosen columns): not rebuilt, by owner decision (17-11-2026).
Five accounts had saved a layout in it, sales support and stores among them. The list's Excel export gives the same
columns, item rows included.

**Selecting rows** (checkboxes, then bulk Edit / Delete / Print / Export of the selection): not added, by owner
decision (17-11-2026). A PO is printed or changed from its own page, and the export covers the filtered list.

## 5. Decisions

Both list extras the plan left to the owner (plan §5) were decided on 17-11-2026: no Report view, no row selection
for bulk actions (§4).

## 6. Next

Step 6, the PO form, replaces the read-only summary. It brings saving, the workflow actions (Approve, Reject, Cancel,
Amend, Duplicate, Close, Hold) and the role rules for them (`access.ts`, `server/write.ts`, `server/audit.ts`).
