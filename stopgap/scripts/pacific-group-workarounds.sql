-- Make the restored site work WITHOUT the pacific_group add-on's code.
--
-- The add-on (built for Pacific by NestorHawk) is not available. Its records
-- are in the backup, but Frappe looks for its Python files whenever it loads
-- one of its DocTypes, print formats or reports, and `bench migrate` deletes
-- "orphan" DocTypes whose files are missing. Marking them custom makes Frappe
-- load them from the database alone, as if they had been made in the UI.
-- Run after the restore and BEFORE migrate (03-restore.sh does).
--
-- What this keeps working: the PO's Cost Overheads table (Services Items),
-- Gate Entry, Proforma Invoice, Port Master, Defects, Sample Item and their
-- data; all PO print layouts, with the logo read from the uploaded file.
-- What it cannot bring back on its own: the add-on's automatic calculations
-- (04-addon-logic.py restores the form-side ones) — see stopgap/README.md.

-- `bench mariadb` opens the client in safe-update mode, which refuses an
-- UPDATE whose WHERE is not on an indexed column (module, doc_type are not).
SET SQL_SAFE_UPDATES = 0;

UPDATE `tabDocType` SET custom = 1 WHERE module = 'Pacific Group';
UPDATE `tabModule Def` SET custom = 1 WHERE name = 'Pacific Group';

-- Print formats and reports of the add-on's module: keep them, served from the
-- database instead of the missing app folder.
UPDATE `tabPrint Format` SET standard = 'No', module = 'Buying'
  WHERE module = 'Pacific Group' AND doc_type = 'Purchase Order';
UPDATE `tabPrint Format` SET standard = 'No'
  WHERE module = 'Pacific Group';
UPDATE `tabReport` SET is_standard = 'No' WHERE module = 'Pacific Group';

-- The PO layouts load the logo from the add-on's assets; the same logo is an
-- uploaded file of the site (the "Logo" letter head uses it).
UPDATE `tabPrint Format`
  SET html = REPLACE(html, '/assets/pacific_group/images/pacific_logo.png', '/files/pacific_logo.png')
  WHERE html LIKE '%/assets/pacific_group/images/pacific_logo.png%';
