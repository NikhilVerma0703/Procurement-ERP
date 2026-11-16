# Purchase Order system — migration guide

**Company:** Pacific Engineered Surfaces Private Limited
**Current site:** pacificengineeredsurfaces.nestorhawk.com (subscription ends in about 5 days)
**Prepared:** 16-11-2026, from a read-only review of the live site and a verified full backup

---

## 1. Where things stand

| What | Status |
|---|---|
| Full database backup | ✅ `Downloads\20261116_110221-pacificengineeredsurfaces_m_frappe_cloud-database.sql.gz` (42.6 MB), verified |
| Public files backup | ✅ `Downloads\…-files.tar` (3.7 MB), 22 files |
| Private files backup | ✅ `Downloads\…-private-files.tar` (1.4 MB), 29 files |
| Readable Excel copy | ✅ `Pacific_Purchase_Orders_Export_2026-11-16.xlsx` (in this folder) |
| PO print layouts + setup | ✅ `po_setup\print_formats\*.html` and `po_setup\po_setup.json` |
| Site config (encryption key) | ✅ `Downloads\…-site_config_backup.json` (519 bytes). Holds the encryption key, the India Compliance API secret and the old database password, so **keep it private** |
| `pacific_group` add-on source code | ❌ only NestorHawk has it, so ask them for it (section 5) |

**What the backup was checked to contain** (counted row by row from the database file):

- 3,199 purchase orders, from `PUR-ORD/24-25/00001` (01-04-2024) to `PUR-ORD/25-26/02529` (16-11-2026)
- 8,709 PO item rows; the taxes, cost overheads and payment schedules on every PO
- 625 suppliers, 7,331 items, 1,225 addresses, 375 contacts
- Data from the rest of the site as well: 4,145 material requests, 5,552 purchase receipts, 4,641 gate entries, stock, accounting, users and settings (751 database tables in all)
- All 51 uploaded files. The site lists 141 file records, but 50 of them are only Google Drive links.

> Keep two copies of the three backup files somewhere safe, for example the company drive plus an external disk. They hold **all** company data, including users' (encrypted) passwords, so don't put them in a public share.

---

## 2. What the current website actually is

It is **not** custom software. It is **ERPNext**, a free, open-source ERP, which NestorHawk hosts for you on **Frappe Cloud**, the official ERPNext hosting service. Internally the site is named `pacificengineeredsurfaces.m.frappe.cloud`.

| Component | Version | Source |
|---|---|---|
| Frappe Framework | 14.101.1 | open source (github.com/frappe/frappe) |
| ERPNext | 14.92.14 | open source (github.com/frappe/erpnext) |
| India Compliance (GST, e-invoice, e-waybill) | 14.34.6 | open source (github.com/resilient-tech/india-compliance) |
| `pacific_group` | 0.0.1 | **custom add-on built for Pacific; code held by NestorHawk** |

The `pacific_group` add-on provides these screens: **Services Items** (the *Cost Overheads* table on POs), **Gate Entry** / Gate Entry Item, Proforma Invoice / Proforma Invoice Item, Port Master, Defects, Sample Item, Stock Entry Serial No, and the "Gate Entry Reciept wise" report. It also stores the **company logo used on the PO print layouts** (`/assets/pacific_group/images/pacific_logo.png`).

---

## 3. How the Purchase Order section works (functional spec)

### 3.1 List screen (Buying → Purchase Order)
- Columns: Supplier Name, Status (approval state), Date, ID.
- Quick filters: ID, Supplier, Supplier Name, Company, Status.
- All POs belong to *Pacific Engineered Surfaces Private Limited*.

### 3.2 PO numbering
- Series `PUR-ORD/25-26/#####`, which is the only option and the default.
- ⚠ It still says **25-26** in financial year 2026-27. New POs continue the 25-26 sequence (latest 02529).

### 3.3 Form layout

**Details tab**
- Series, Supplier\*, Supplier Name (auto), Order Confirmation No / Date (shown after approval)
- **Shipment Type** (Domestic / Import), custom field
- **Mode Of Transport** (Road / Air / Rail / Ship, default Road), custom field
- *Get Items from Open Material Requests* button
- Date\*, Required By, **Purpose** (General / Domestic / Exports), custom field
- Company\*, Apply Tax Withholding, Is Reverse Charge, Is Subcontracted
- Accounting dimensions: Cost Center, Project
- Currency and price list: Currency\*, Exchange Rate\*, Price List. POs exist in INR (3,003), EUR (118), USD (76) and JPY (1).
- Scan Barcode, Set Target Warehouse
- **Items table** (grid columns): Item Code, Required By, Quantity, UOM, Rate, **Final Amount** (renamed from "Amount"), SGST %, SGST Amt, CGST %, CGST Amt, IGST %, IGST Amt, Target Warehouse
  - The SGST/CGST/IGST % and Amt columns are custom fields. They are filled on about 44% of item rows, less often since Aug-2026. India Compliance's own GST fields are filled on about 90% of rows.
- Totals: Total Quantity, Total, Net Total (plus company-currency versions)
- **Cost Overheads** table (custom): Service Item, Service Charges, Account Head, Charge Type. Used on 373 rows.
- Taxes: Tax Category, Purchase Taxes and Charges Template, Shipping Rule, Incoterm; taxes table (Type, Account Head, Amount, Total)
  - Tax templates: Input GST In-state / Out-state, Input GST RCM In-state / Out-state, plus 2 Poland VAT templates
- Totals: Grand Total, Rounding Adjustment, Rounded Total, In Words, Advance Paid; Additional Discount; Tax Breakup; GST Breakup

**Address & Contact tab**
- Supplier Address, Supplier GSTIN, GST Category, Supplier Contact (name, mobile, email)
- Shipping Address
- Company Billing Address, Company GSTIN, Place of Supply

**Drop Ship tab:** Customer, Customer Contact.

**Terms tab**
- Payment Terms Template (219 templates, such as "100% Advance" or "10% Advance, Balance CAD") and the Payment Schedule
- Terms (118 templates, used as **delivery terms**, such as "2 WEEKS" or "10-15 Days") and the Terms and Conditions text

**More Info tab:** Status, % Billed, % Received; Letter Head, Print Heading, Print Language; Auto Repeat; internal supplier info.

### 3.4 Approval workflow ("Purchase Order", active)

| State | Document status | Who can edit |
|---|---|---|
| Created | Draft | Purchase Head |
| Approved | Submitted | Admin |
| Rejected | Submitted | Admin |

Transitions:
- Created → **Approve** → Approved (role *Admin*, self-approval allowed)
- Created → **Reject** → Rejected (role *Admin*, self-approval allowed)

Current counts:
- 541 Created (drafts)
- 2,615 Approved: 1,966 *To Bill*, 649 *To Receive and Bill*
- 8 Rejected
- 34 Cancelled

### 3.5 Email notifications (3, all enabled)

| Name | When | Sent to |
|---|---|---|
| "Purchase Order {name} Is Save" | new PO with state *Created* | roles Request Dept Head, Store Head, Purchase Head, Admin |
| "Purchase Order {name} Is Submit" | approved (submit) | roles Admin, Supplier, Store Head, Purchase Head, Request Dept Head |
| "Purchase order approved" | approved (submit) | PO owner, supplier contact email |

⚠ No email account is set as the *default outgoing* account, so these emails may not actually be going out today.

### 3.6 The PO sheet (print layouts)
- 11 Jinja print layouts for POs. The **default is "PDF PO"**. Newer ones edited in Sept-2025 are *PO print format*, *Purchase Order 2025* and *PURCHASE ORDER TEMPLATE*. **Confirm which one your team prints.**
- "PDF PO" layout, from top to bottom:
  - Logo and the heading "PURCHASE ORDER"
  - Supplier address block, with PO No, PO Date, Currency and Delivery Date beside it
  - "SHIPPING METHOD : BY ROAD" (fixed text in 2 layouts; another layout uses Mode Of Transport)
  - Delivery Term (from Terms), shipping address, Payment Terms with the schedule
  - Item table: SNO, Product Code & Description, HSN, UOM, Qty, Rate, Dis %, Taxable Value, CGST %/Amt, SGST %/Amt, IGST %/Amt, Total Amount. **The heading block repeats every 10 items.**
  - Service Items (Cost Overheads) table, taxes table and totals
- All layouts use only standard ERPNext template features, so they run on any ERPNext 14.
- **10 of the 11 layouts load the logo from the `pacific_group` add-on.** The same logo is also in your files backup as `/files/pacific_logo.png`, which the "Logo" letter head uses.

### 3.7 Links to other parts of the system
- **Material Request**: the PO can pull items from open MRs (4,145 MRs exist).
- **Purchase Receipt**: drives "% Received" (5,552 receipts exist).
- **Purchase Invoice**: drives "% Billed". Only 1 exists, which is why most approved POs sit at *To Bill*.
- **Gate Entry** (custom): 4,641 exist.

> Other teams clearly use material requests, receipts, gate entries and stock in this system. Check with Stores and the gate team before the shutdown. The backup already covers their data too.

---

## 4. Recommended path: run your own copy of ERPNext 14 and restore the backup

This gives you **the identical website**: same screens, PO sheets, workflow, users and passwords, and all data. It is the only route that fits in 5 days. Building a new website from scratch (section 7) can come later, without time pressure.

Pick **one** hosting option.

### Option A — Frappe Cloud under your own account (least IT work)
Your site already runs on Frappe Cloud; only the account belongs to NestorHawk.
1. Ask NestorHawk whether they can **transfer the site to a Frappe Cloud team in your company's name**. If they can, nothing has to be rebuilt.
2. If not, create your own Frappe Cloud account and a **v14** bench group with ERPNext and India Compliance.
3. Add `pacific_group` from a Git repository. This needs the code and a plan with private benches.
4. Create a new site using **"Restore from backup"** and upload the three backup files.
5. Check two things on Frappe Cloud's current pricing and version pages: whether v14 is still offered, and which plan allows custom apps.

### Option B — Your own server (full control)
**Server:**
- Ubuntu 22.04 LTS, 2+ vCPU, 4–8 GB RAM, 50 GB SSD
- Any cloud provider or an office machine with a fixed IP

**Software for v14:**
- Python 3.10, Node 16, MariaDB 10.6, Redis
- wkhtmltopdf 0.12.6 (patched Qt) for PDFs

**Steps for your IT person or an ERPNext partner.** Replace `po.example.com` with your new domain.

```bash
# 1. Install bench and the same app versions
bench init frappe-bench --frappe-branch version-14
cd frappe-bench
bench get-app --branch version-14 erpnext
bench get-app --branch version-14 https://github.com/resilient-tech/india-compliance
bench get-app <pacific_group git URL from NestorHawk>        # if provided

# 2. Create the site and install the apps
bench new-site po.example.com
bench --site po.example.com install-app erpnext
bench --site po.example.com install-app india_compliance
bench --site po.example.com install-app pacific_group        # if provided

# 3. Restore the backup over it
bench --site po.example.com restore ~/backup/20261116_110221-pacificengineeredsurfaces_m_frappe_cloud-database.sql.gz \
  --with-public-files  ~/backup/20261116_110221-pacificengineeredsurfaces_m_frappe_cloud-files.tar \
  --with-private-files ~/backup/20261116_110221-pacificengineeredsurfaces_m_frappe_cloud-private-files.tar

# 4. Copy two values from the old site_config_backup.json:
#    encryption_key - keeps saved passwords (email accounts, GST settings) readable
#    ic_api_secret  - India Compliance API secret, used for GST e-invoice / e-waybill
bench --site po.example.com set-config encryption_key "<value from site_config_backup.json>"
bench --site po.example.com set-config ic_api_secret "<value from site_config_backup.json>"

# 5. Finish
bench --site po.example.com migrate
sudo bench setup production <linux-user>
# then point DNS at the server and enable HTTPS (bench setup lets-encrypt)
```

**If NestorHawk will not hand over `pacific_group`.** Do this after step 3 and before step 5, and test it on the new server first:

```bash
bench --site po.example.com remove-from-installed-apps pacific_group
bench --site po.example.com console
```

Then, in the console:

```python
# let the add-on's screens (Cost Overheads, Gate Entry, …) load without its code
frappe.db.sql("update `tabDocType` set custom=1 where module='Pacific Group'")
# let its print layouts render without the add-on
frappe.db.sql("update `tabPrint Format` set module='Buying' where module='Pacific Group'")
frappe.db.commit()
```

After that, in each PO print layout change the logo address from `/assets/pacific_group/images/pacific_logo.png` to `/files/pacific_logo.png`.

What you lose without the code:
- Any automatic calculations or checks written into the add-on, for example how the per-item GST columns and Gate Entry fields are filled
- The "Gate Entry Reciept wise" report

### Checks after the restore (both options)
1. The Purchase Order list shows **3,199** POs (more if you restore a later backup), and the latest number matches.
2. Open `PUR-ORD/25-26/02510`:
   - Supplier: A & A Silicates
   - Items total: ₹3,96,000
   - IGST 5%: ₹19,800
   - Grand total: ₹4,15,799.50
3. Print it with "PDF PO": the logo shows, and the layout and page breaks look right.
4. Log in as a normal purchase user with their **existing password**. Users and passwords come across with the backup.
5. Create a test PO, approve it as *Admin*, print it, then cancel it.
6. Set up an outgoing email account so the 3 notifications work.
7. If you use GST e-invoice / e-waybill, open **GST Settings** and confirm the API credentials still work. They need the encryption key from step 4.

---

## 5. Message to send NestorHawk today

> Subject: Data handover before our subscription ends — Pacific Engineered Surfaces (pacificengineeredsurfaces.nestorhawk.com)
>
> Hello,
>
> As our subscription ends shortly, please provide by [date]:
> 1. A full backup of our site (database, public files, private files and site_config.json).
> 2. The complete source code of the **pacific_group** app built for us (Git repository access or a zip of the app folder), including any other customisations kept outside the site.
> 3. Confirmation of the exact shutdown date and time.
> 4. Whether the Frappe Cloud site can be transferred to a Frappe Cloud account owned by us. If yes, what you need from us.
> 5. If possible, a short extension (read-only access is fine) until our new system is live.
> 6. Whether the India Compliance API account used for GST e-invoice / e-waybill on our site is registered to us or to you. If it is yours, how we move to our own.
>
> Thank you.

---

## 6. Five-day plan

| Day | What |
|---|---|
| **Day 1 (today, 16-11)** | ✅ Backup taken and verified, Excel copy made. Send the email above. Choose Option A or B and book the person who will set it up. |
| **Day 2** | Prepare the new server or Frappe Cloud account. **Trial restore** using today's backup and run the checks in section 4. |
| **Day 3** | The purchase team tests on the new system: create, approve and print POs. Fix the logo, print or email issues found. Keep working on the old site meanwhile. |
| **Day 4** | **Cut-over:** agree a time to stop entering data on the old site, take a **final backup** (same steps as today), restore it on the new system, re-check the counts, and send everyone the new link. |
| **Day 5** | Buffer. Just before the shutdown, take one last backup in case anything was entered after the cut-over. |

**Taking another backup yourself** (any System Manager):
1. On the old site, open `/app/backups`.
2. In the **⋯** menu, choose **Download Files Backup**.
3. Wait 1–2 minutes and refresh the page.
4. Click the new database file to download it.
5. The two file archives have the same name with `-files.tar` and `-private-files.tar` at the end. Open them at `https://pacificengineeredsurfaces.nestorhawk.com/backups/<that name>`.

**Refreshing the Excel copy from a newer backup** (needs Python with `openpyxl`):

```bash
python tools/export_po_excel.py "<path to new …-database.sql.gz>" "Pacific_Purchase_Orders_Export_<date>.xlsx"
python tools/extract_po_setup.py "<path to new …-database.sql.gz>" po_setup
```

---

## 7. Later, optionally: a custom-built PO website
If you still want your own lightweight PO application after you're safely on your own ERPNext, a developer needs:
- **Data:** the Excel workbook (one sheet per table, all columns) or the database backup
- **Spec:** section 3 of this guide, plus `po_setup/po_setup.json`, which holds the fields, workflow, notifications and tax, payment and delivery-term templates
- **PO sheet design:** `po_setup/print_formats/` (HTML of every layout)

The minimum feature set:
- Supplier and item masters with addresses and GSTINs
- PO form with items, GST taxes, cost overheads, payment and delivery terms
- Multi-currency
- `PUR-ORD/YY-YY/#####` numbering
- Created → Approved / Rejected workflow
- PDF PO sheet
- Email alerts
- Links to material requests and goods receipts, if those teams need them

Expect several weeks of developer time. That's why it shouldn't be the 5-day plan.

---

## 8. Open points

- **`pacific_group` code:** does NestorHawk release it? This decides how much of section 4's workaround you need.
- **Which print layout the team uses:** the default is "PDF PO".
- **Frappe Cloud:** whether it still offers v14 for new sites, and the current pricing (Option A).
- **Other teams:** whether they rely on material requests, receipts and gate entries on this site. Their data is in the backup either way.
- **India Compliance API account:** the site uses an India Compliance API secret for GST e-invoice / e-waybill. If that account belongs to NestorHawk, you'll need your own before go-live.
