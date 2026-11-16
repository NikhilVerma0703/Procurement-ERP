# ERPNext stopgap: the old PO system on this PC

**What it is:** the old site's software, restored from its backup, so purchase orders can still be raised after
NestorHawk switches the old site off and before the Procurement ERP takes over.
- It runs **without Docker**, inside **Ubuntu 22.04 on WSL** (Windows' built-in Linux).
- Versions are the same as the old site: Frappe 14.101.1, ERPNext 14.92.14. India Compliance is 14.36.1 (the old
  site had 14.34.6).

It is **temporary**. When the Procurement ERP is live, delete this folder and remove the Linux install
(`wsl --unregister Ubuntu-22.04`, which deletes everything inside it).

## Daily use

1. Double-click **`Start ERPNext (stopgap).cmd`** and keep its window open.
2. After about 30 seconds the browser opens **http://localhost:8000**.
3. Sign in with your **usual email and password from the old site**. Users and passwords came across with the backup.
4. To stop ERPNext, close the window.

The Administrator login's password is in `stopgap/.env`, on this PC only. Never commit that file.

## Set for safe use while the old site is still running

- **Outgoing email is muted:** no PO notification reaches a supplier twice.
- **The scheduler is off.**

At cut-over (below) you decide whether to switch email back on (`bench --site pacific.localhost set-config mute_emails 0`).

## What differs from the old site

The custom **`pacific_group` add-on** (NestorHawk's code) is not available.
- **Its records all came across:** Cost Overheads, Gate Entry, Proforma Invoice and so on. Its screens open without
  its custom logic.
- **Print layouts work:** the logo now comes from the uploaded file.

`scripts/04-addon-logic.py` brings back what the add-on did **on the PO form**:
- the per-item SGST/CGST/IGST columns (these print on the PO sheet)
- Cost Overhead tax rows and accounts
- removal of duplicate service items

It **cannot** bring back the add-on's save-time rule that adds Cost Overhead charges into *Total Taxes and Charges*
and the *Grand Total*. On a new PO with Cost Overheads, add the charge as an extra *Actual* tax row if it should
count in the total.

## Checked on 16-11-2026 (restored from the backup of 16-11-2026 11:02)

- **Record counts equal the backup's:**
  - 3,199 Purchase Orders, 625 Suppliers, 7,331 Items, 1,225 Addresses, 375 Contacts
  - 4,145 Material Requests, 5,552 Purchase Receipts, 4,641 Gate Entries, 28 users
- **PUR-ORD/25-26/02510 is as on the live site:** A & A Silicates, ₹4,15,799.50, Approved, To Receive and Bill.
- **PUR-ORD/25-26/02486 keeps the add-on's stored totals:** Total Taxes ₹3,33,010.982, Grand Total ₹20,01,326.
- **"PDF PO" prints for 02510:** 62 KB with the logo embedded; the live site's was 61 KB with the logo.
- **The restored add-on functions answer exactly as the live ones did this morning:**
  - per-item GST for N95 Mask: 5% / ₹825, or 2.5% / ₹412.50
  - Insurance ₹274 → ₹49.32
  - TCS ₹32,391 → ₹5,830.38 on "Installation Charge - PESPL"
- **The PO form opens with the same tabs and buttons, and no browser errors.** The restored form script is active.

**One-time notice:** ERPNext shows "End of Life reached", meaning version 14 no longer gets Frappe updates. That is
acceptable for a temporary system used on this PC only. Do not expose it to the internet.

## Final cut-over (the old site's last day)

1. On the old site, open `/app/backups`, then **⋯ → Download Files Backup**. Wait 1–2 minutes and refresh the page.
2. Download the new database file. Then download the two archives at
   `https://pacificengineeredsurfaces.nestorhawk.com/backups/<same name>-files.tar` and `…-private-files.tar`.
3. Put the three files in `data/erpnext-backup/`.
4. Restore the newest backup. This **replaces** the stopgap's data:
   ```bash
   wsl -d Ubuntu-22.04 -u frappe --cd "/mnt/c/Users/User/Desktop/Procurement ERP/stopgap" -- bash scripts/03-restore.sh "/mnt/c/Users/User/Downloads/20261116_110221-pacificengineeredsurfaces_m_frappe_cloud-site_config_backup.json"
   ```
5. Re-apply the add-on behaviour:
   ```bash
   wsl -d Ubuntu-22.04 -u frappe --cd ~/frappe-bench/sites -- ../env/bin/python "/mnt/c/Users/User/Desktop/Procurement ERP/stopgap/scripts/04-addon-logic.py" pacific.localhost "/mnt/c/Users/User/Desktop/Procurement ERP"
   ```
6. Tell everyone to use the stopgap from now on.

## Using it from another PC (the Procurement Manager's)

Out of the box it opens only on **this PC**, and only while this PC is on.

To reach it from another computer on the office network, IT must:
- let Windows forward ports 8000 and 9000 into WSL: WSL "mirrored" networking, or `netsh interface portproxy`
- allow those ports in the Windows firewall

Both are Windows network and security settings, so they are for you or IT to make.

## How it was set up (to rebuild it)

| Script | Runs as | Does |
|---|---|---|
| `scripts/01-system.sh` | root | MariaDB 10.6 (utf8mb4), Redis, wkhtmltopdf with patched Qt, the `frappe` user |
| `scripts/02-bench.sh` | frappe | Node 16 and the bench; Frappe, ERPNext and India Compliance (version-14 branches) |
| `scripts/03-restore.sh` | frappe | restores a backup (database + files); removes the add-on from the app list and applies `pacific-group-workarounds.sql`; sets the old encryption key, mutes email, turns off the scheduler, migrates |
| `scripts/04-addon-logic.py` | frappe (bench Python) | the add-on's PO form behaviour, as a Client Script plus API Server Scripts |
