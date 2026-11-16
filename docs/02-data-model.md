# Step 2: data model

**Status:** done for review (16-11-2026)
**Schema:** `prisma/schema.prisma`
**First migration:** `prisma/migrations/20261116072817_init_purchase_module`
**Checked by:** `tests/purchase/schema.test.ts`

The model reproduces the old ERPNext site's **Buying → Purchase Order** and everything it points at. It was designed
from the backup's own table definitions (`docs/reference/erpnext-schema/*.sql`, extracted by
`scripts/analysis/erpnext_schema.py`) and from how often each column was ever filled.

Result:
- 43 tables (`purchase_*`)
- 12 enum types (`purchase_*`)
- 82 foreign keys
- applied to the local PostgreSQL 18 database `procurement_erp`

## Design rules

1. **Same structure, real relations.**
   - Every ERPNext table the PO screen uses has a counterpart.
   - Links ERPNext held only as names are foreign keys here, for example PO → supplier, line → item, PO → address.
   - Child rows belong to their PO and are deleted with it. Nothing the PO merely points at is.
2. **Nothing lost.**
   - Every migrated record keeps its complete original row in `legacy` (JSON).
   - A column exists for every field the PO form **shows**, and for every field its **calculations, statuses or
     printouts** need.
   - Columns that were never filled and never shown live only in `legacy`.
3. **Original identities kept.**
   - A PO's `number` **is** its ERPNext name (`PUR-ORD/25-26/02510`, amended `…-1`).
   - Masters keep theirs in `code`, and child rows in `erpnext_name`.
   - The importer can therefore be re-run on the final backup and update records in place.
4. **Exact numbers.** Money, quantities and rates are `numeric(21,9)`, the same type ERPNext used. No float anywhere.
5. **Readable values.**
   - System lists are enums stored with ERPNext's labels (status "To Receive and Bill", workflow "Approved").
   - The add-on's choice fields (Shipment Type, Mode Of Transport, Purpose) are **text**, as ERPNext stored them.
     Their option lists changed over time, and 16 older POs keep "Air / Ship". Today's options are in
     `src/lib/purchase/orders/options.ts`.
   - Payment-term names are kept as written beside the link (`payment_term_name`), because 7 rows name terms that
     were renamed later.
   - Both changes came out of the Step 3 dry run (migration `text_selects_and_payment_term_names`).
6. **Codes for code-like lookups.**
   - Currency and UOM are referenced by their codes (`INR`, `Nos`).
   - Everything else is referenced by an ID, with the ERPNext name kept as a unique key.
7. **UTC timestamps.** The old site stored Asia/Kolkata wall-clock times; the importer converts them.
8. **Merge-ready names.** `Purchase*` models, `purchase_*` tables and enum types, snake_case columns: the Main ERP's
   module rule.

## ERPNext → new tables

Rows are the counts in the backup of 16-11-2026.

### The Purchase Order

| ERPNext | Rows | New table | Notes |
|---|---|---|---|
| Purchase Order | 3,199 | `purchase_orders` | 111 columns: every tab of the form, totals in both currencies, status, workflow, the add-on's custom fields, and the 6 POs' removed proforma-invoice fields |
| Purchase Order Item | 8,709 | `purchase_order_items` | 89 columns: quantities, UOM conversion, rates, discounts, India Compliance GST, the add-on's SGST/CGST/IGST columns, received/billed quantities, source-document references |
| Purchase Taxes and Charges (of POs) | 4,707 | `purchase_order_taxes` | charge types as an enum, row references, per-item tax split (JSON), the add-on's `service_price` |
| Services Items, the add-on's *Cost Overheads* (of POs) | 373 | `purchase_order_cost_overheads` | charges stored as text by the add-on, numeric here |
| Payment Schedule (of POs) | 3,219 | `purchase_order_payment_schedules` | |
| Purchase Receipt / Invoice Item, Material Request (links to POs) | 11,253 / 8 / 4,145 | `purchase_order_links` | what the *Connections* tab lists, with key facts; those modules are not replicated |
| Version / Comment / Communication (of POs) | 9,216 / 7,361 / 95 | `purchase_order_events` | the PO timeline. Includes 2,657 workflow actions and the 68 deleted drafts, whose last content is kept. |
| File (of POs) | 5 | `purchase_attachments` | bytes come from the backup's file archives |

### Parties

| ERPNext | Rows | New table |
|---|---|---|
| Supplier (+ Supplier Group) | 625 (15) | `purchase_suppliers`, `purchase_supplier_groups` |
| Customer (drop-ship only) | 422 | `purchase_customers` |
| Company | 2 | `purchase_companies` |
| Address + its Dynamic Links | 1,225 | `purchase_addresses`, `purchase_address_links` (supplier / customer / company as FKs) |
| Contact + emails, phones, Dynamic Links | 375 (230 / 196) | `purchase_contacts`, `purchase_contact_emails`, `purchase_contact_phones`, `purchase_contact_links` |

### Items

| ERPNext | Rows | New table |
|---|---|---|
| Item (+ Item Group) | 7,331 (27) | `purchase_items` (variants self-related; `service_item` flag), `purchase_item_groups` |
| UOM Conversion Detail | 12,425 | `purchase_item_uom_conversions` |
| Item Default | 7,334 | `purchase_item_defaults` (warehouse, expense account, the Cost Overhead account source) |
| Item Tax | 5,447 | `purchase_item_taxes` (which Item Tax Template applies, by tax category) |
| UOM | 301 | `purchase_uoms` |

### Templates and lookups

| ERPNext | Rows | New table |
|---|---|---|
| Purchase Taxes and Charges Template (+ rows) | 6 | `purchase_tax_templates`, `purchase_tax_template_rows` |
| Item Tax Template (+ rates) | 51 (149) | `purchase_item_tax_templates`, `purchase_item_tax_template_rates` |
| Payment Terms Template (+ rows), Payment Term | 219 (221), 206 | `purchase_payment_terms_templates`, `purchase_payment_terms_template_rows`, `purchase_payment_terms` |
| Terms and Conditions (the PO's delivery term) | 118 | `purchase_terms_templates` |
| Tax Category, Account, Cost Center, Warehouse | 5, 176, 4, 34 | `purchase_tax_categories`, `purchase_accounts`, `purchase_cost_centers`, `purchase_warehouses` |
| Currency, Currency Exchange, Price List | 148, 4, 9 | `purchase_currencies`, `purchase_currency_exchanges`, `purchase_price_lists` |
| Letter Head | 1 | `purchase_letter_heads` |
| Series (`PUR-ORD/25-26/` and others) | 132 | `purchase_naming_series` (the PO series only) |

### People and the migration itself

| ERPNext | Rows | New table |
|---|---|---|
| User + Has Role | 28 | `purchase_users` (history refers to people by email, as ERPNext did) |
| (none) | n/a | `purchase_import_runs`: each import, its source file checksum, counts and reconciliation verdict |

## Deliberately not modelled

The data stays in the backup and in each PO's `legacy` copy.

- **Purchase Order Item Supplied, Pricing Rule Detail, Item Supplier, Project:** **0 rows** in the backup.
- **Custom field `custom_mode_of_shipping`:** a removed field, never filled.
- **Unused internal fields:** inter-company reference, supplier-quotation reference, old-subcontracting flag. They are
  kept in `legacy` only.
- **Workflow and notification definitions:** these become module configuration in code, as the plan says. They are
  three states, two transitions and three emails, and editing them was never part of the PO screen.
- **Sign-in accounts:** the standalone app's logins come with the screens. After the merge, the Main ERP's users
  apply. `purchase_users` is the history's directory of people, not a login table.

## Open points (they affect later steps, not this schema)

- **New goods receipts.** Historical received quantities are kept per line (`received_qty`) and per receipt
  (`purchase_order_links`). How *new* receipts are recorded is the plan's open decision; the schema can take either
  answer.
- **Cost Overhead fold-in rule.** How the add-on folded overhead charges into the totals is settled by the golden
  tests in Step 4. It changes calculations, not columns.
