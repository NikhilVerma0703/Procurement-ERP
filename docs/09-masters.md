# Step 8 (part 2): the masters screens

**Status:** built and checked in the browser, 19-11-2026. With part 1 ([08-activity-and-email.md](08-activity-and-email.md)),
Step 8 is complete.

The screens of the records a PO links to, each with its list and its form, as ERPNext 14 drew them:

| Screen | Path | Old site's records |
|---|---|---|
| Supplier | `/purchase/suppliers` | 625 |
| Item | `/purchase/items` | 7,331 (454 templates, 1,530 variants) |
| Address | `/purchase/addresses` | 1,225 |
| Contact | `/purchase/contacts` | 375 |
| Purchase Taxes and Charges Template | `/purchase/tax-templates` | 6 |
| Payment Terms Template | `/purchase/payment-terms-templates` | 219 |
| Payment Term (the rows of a payment terms template pick one) | `/purchase/payment-terms` | 206 |
| Terms and Conditions | `/purchase/terms` | 118 |

Who may change them: the `masters` action (`src/lib/purchase/access.ts`). PURCHASE and ADMIN edit; APPROVER only views.

## Checked in the browser

All test records were made with made-up data. They were removed afterwards, and the local data re-imported (`npm run import:erpnext`), so it is again the import's.

- **Supplier:**
  - The list loads all 625.
  - A record shows its addresses, contacts and Purchase Orders.
  - The quick entry made a supplier with its primary address and contact, named as Frappe named them ("…-Billing", "{first} {last}-{supplier}"). Its GSTIN set the Supplier Type, GST Category and PAN.
  - Block Supplier set Hold Type to All on save. The record then showed On Hold.
  - Delete removed the supplier with its own address and contact. A supplier with POs was refused, with Frappe's message.
- **Address:**
  - New Address from a supplier was linked to it, and went back to the supplier after saving.
  - A postal code outside its state was refused (India Compliance).
  - Delete worked.
- **Contact:**
  - Two primary emails were refused.
  - Email Address and Mobile No come from the rows marked primary.
  - Changing the primary row moved Email Address.
- **Item:**
  - A template shows its intro line, View → Show Variants, and Create → Single / Multiple Variants.
  - Single Variant found an existing combination. It opened a new one as `{template code}-Polish-Super Jumbo-30mm-Broken`, named `{template name}-Polish-Super Jumbo-30mm-Broken`. Saved, it took the template's UOMs and defaults.
  - Multiple Variants made 2 ("2 variants created.").
  - Saving the template copied its Lead Time to all 4 variants ("Item Variants updated").
- **Templates:**
  - A payment terms row filled itself from the Payment Term picked.
  - The template saved.
  - Rename kept the page and changed the name.

## Code

**Engine:**
- `src/lib/purchase/masters/spec.ts`: a layout made of tabs, sections, columns, fields and child tables, with conditions.
- `values.ts`: Frappe's checks on any save:
  - Select options
  - 140-character Data fields
  - Email and Phone formats
  - dates
  - mandatory fields
  - `validate_name`
- `kit.ts` (server):
  - refusals
  - the stale-form check
  - link checks
  - child rows kept by id
  - created / edited stamps
- `gated.ts`: the gate every master action passes.
- `components/purchase/masters/`:
  - `MasterForm.tsx`, `MasterScreen.tsx` (the lists: `components/purchase/doc/DocList.tsx`, below)
  - `QuickEntryDialog.tsx`, `RenameDialog.tsx`
  - `PartyCards.tsx`, `MasterFooter.tsx`
  - `screens.ts`: each screen's layout and triggers

**Each master:**
- `src/lib/purchase/masters/<name>/{spec.ts (pure), server.ts}`
- `src/app/purchase/<path>/{page.tsx, new/, [id]/, actions.ts}`

**Shared:**
- `parties.ts`: address and contact naming, links, preferred-address flags, party cards, delete rules.
- `party-links.ts`: the Links table.
- `prefill.ts`: New Address / Contact from a party.
- `rename.ts`: Rename.
- `src/lib/purchase/gstin.ts`: India Compliance's GSTIN, PAN, category, state and postal-code rules.
- `src/lib/purchase/countries.ts`: the old site's 251 countries.

**Data (migrations `20261118160343_master_stamps`, `20261118204039_item_variants_and_hsn`; the importer reads them):**
- created/updated by and at on every master
- Item Attribute and its values (5 / 29)
- items' Variant Attributes (7,637)
- India Compliance's HSN/SAC list (21,923)

**Tests:** `tests/purchase/masters.test.ts`.

## How they behave (the old site's rules)

- **The lists are the old list view** (since 25-11-2026, owner: "the Item section … should look exactly same as
  website. Similarly all these built sections"): the same component as every Stock list ([14](14-stock-screens-and-reports.md)
  §2), fed by `doc/screens.ts` `MASTER_SCREENS`. Each reads the record's old row overlaid with its current values
  (the forms save typed columns, not the old row). Read off the old site's lists the same day and held by
  `tests/purchase/stock-screens.test.ts`:
  - **Columns** (at up to 1,366 px): Item — Item Name, Status, Item Group, ID; Supplier — Supplier Name, Status,
    Supplier Group, ID; Address — ID, Status, Address Type (City from 1,367 px); Contact — ID, Email Address, Status
    (Phone); Tax Template — Title, Status, Default, ID (Disabled, Company); Terms and Conditions — ID, Status, Selling
    (Buying); Payment Terms Template and Payment Term — ID.
  - **Standard filters:** Item — ID, Item Name, Item Group, Has Variants (a tick), Variant Of; Supplier — ID, Supplier
    Name, Supplier Group; Address — ID, Address Type, Country; Contact — ID, Status; Tax Template — ID, Title, Company;
    the rest — ID.
  - **Status:** Item's Disabled / Expired / Template / Variant / Enabled and Supplier's On Hold / Enabled (their
    `_list.js` files); Enabled / Disabled elsewhere.
  - **Sort:** as Thiru R had each list: Item by Default Unit of Measure, ascending; Supplier, Contact and Terms by
    Last Updated On, ascending; the rest newest first.
  - **Above:** List View ▾, ↻, ⋯ › Export, "+ Add …" (Supplier: its quick entry; `?new=1` opens it).
  - The search box's "Find <text> in Item" filters ID like %text%, and on the list itself the title field (Item
    Name, Supplier Name, Title), as the old awesome bar's route options did.
  - **Where it differs:** rows with the same sort value (Item: all those of one unit, such as Box or Nos) come in another order — the
    old database returned ties in its own internal order, which no field records.
- **Every list** (added by owner decision 19-11-2026, as on the PO list, [05](05-list-screen.md) §2):
  - a checkbox and a ♥ before each title; the heading's checkbox ticks every row shown, and its ♥ shows only what you
    liked (`?_liked_by=<you>`, Frappe's "Liked By like %you%");
  - while rows are ticked, "Add …" gives way to **Actions**:
    - **Export:** the ticked rows as `<Master>.csv`, with the list's columns (ID, title and the list's own columns).
      Frappe's Data Export let you pick the fields, in Excel or CSV.
    - **Delete:** each record through its own Delete, with its link checks ("Cannot delete or cancel because …"), in
      rounds as Frappe's `delete_bulk` ran them. What was refused is listed afterwards.
  - not offered: Frappe's **Edit** (one field set on every ticked record), **Print** (no master layouts here), Assign
    To, Apply Assignment Rule and Add Tags. See "For the owner to decide".

- **Supplier:**
  - Named by Supplier Name (Buying Settings). A name already in use is refused.
  - "Add Supplier" opens India Compliance's quick entry: GSTIN, the mandatory fields, Primary Contact Details and Primary Address Details. 545 of the 561 suppliers with a primary address got it in the same second as the supplier, so this is how suppliers were made. Edit Full Form carries the values over.
  - Save follows India Compliance's `validate_party`: the GSTIN is checked, GST Category is set from it (with a "GST Category updated to …" note), and PAN is taken from it.
  - Save follows ERPNext's `before_save`: an unblocked supplier has no hold; a blocked one defaults to All.
  - Mobile No and Email Id come from the primary contact (`fetch_from`). Primary Address is written when the address is picked.
- **Address:**
  - Named "{title}-{type}", or with a number after it when taken. The title defaults to the first link's party.
  - Preferred Billing / Shipping takes the flag from the party's other addresses.
  - India Compliance's checks apply: state required in India, GSTIN state number, postal code against the state, Overseas outside India.
  - Lead links that came across are kept, but cannot be added (no Lead here).
- **Contact:**
  - Named "{first} {last}-{first link}", with a number when taken.
  - Only one row may be marked primary for each of email, phone and mobile.
  - User Id is taken from the email when not given.
- **Item:**
  - Named by Item Code (Stock Settings).
  - Item Name defaults to the code, and Description to the Item Name.
  - The stock UOM's conversion row is added at 1. Changing the stock UOM clears the table, with ERPNext's note.
  - HSN/SAC is required, 6 or 8 digits, and must be in India Compliance's list.
  - Item Taxes: a template once per tax category; Maximum Net Rate not below the minimum.
  - Item Defaults: one row per company; the warehouse, cost centre and account must be the company's.
  - Maintain Stock cannot change once a submitted PO has the item. Batch / serial flags cannot change once the item has been received.
  - Variants:
    - Named `{template}-{abbreviations}`.
    - A variant cannot duplicate another's values.
    - A template's save copies Item Variant Settings' fields to every variant (the old site had `do_not_update_variants` off).
- **Purchase Taxes and Charges Template:**
  - Named "{title} - {company abbreviation}". A default template is the company's only default, and cannot be disabled.
  - One enabled template per tax category.
  - Each row is checked as ERPNext checked it: reference rows, inclusive taxes, and an account of the company.
- **Payment Terms Template:**
  - Portions must total 100%. Duplicate rows are refused.
  - A row takes its Payment Term's fields: Description always, the others when empty.
- **Terms and Conditions:** at least one module (Selling / Buying) unless disabled.
- **Delete** is refused while a PO (or a supplier, a variant, a template row) points at the record, with Frappe's "Cannot delete or cancel because …". A supplier's own addresses and contacts go with it.
- **Rename** (⋯ → Rename):
  - The page stays the same.
  - A field-named doctype takes the new name in that field.
  - A supplier takes it as its Supplier Name.
  - Text copies of the name are updated: PO lines' Item Code, variants' template, address / contact links, payment schedules' term.

## Left out (none of the old site's records used them, or they belong to other modules)

- **Supplier:**
  - Internal Supplier, More Information (website, language, details), Default Company Bank Account
  - GST Transporter ID, Reverse Charge Applicable (0 suppliers)
  - the Accounting tab, and the View / Create buttons (ledgers, bank accounts, pricing rules)
  - "Get Supplier Group Details" (supplier groups carry no defaults here)
  - Dashboard's billing figures (1 purchase invoice ever)
- **Item:**
  - stock settings and stock (the Store module)
  - selling, assets, Quality, Manufacturing, deferred accounting
  - Brand (0), Item Color (1), Supplier Items (none came across)
  - the add-on's Tax Type / Tax Rule, hidden on the old form
  - "Item Variant Settings" and "Variant Details Report" under View
  - Item Group defaults (not imported)
- **Contact:** Address link, Google Contacts, Department, Unsubscribed (0 contacts).
- **Payment terms:** Mode of Payment and Discount Settings (0 of 206 terms, 0 of 221 rows).
- **Everywhere:**
  - "Merge with existing" on Rename (used once)
  - a master's own timeline, comments and attachments
  - Terms' Jinja check

## For the owner to decide

1. **Masters' history.** The old site kept 844 supplier and 4,438 item versions, 36 item files and 36 item emails. The renames are recorded only as comments. None of these were imported. The screens show who created and last edited each record. Should the history come across and show as a timeline, as it does on a PO?
2. **Merge on Rename.** It was used once, on an address. It is left out unless needed.
3. **Bulk Edit and Print on the master lists.** Frappe's list Actions also had Edit (set one field on every ticked
   record) and Print (its standard layout). They are left out unless the team used them.
4. **Item Group defaults and taxes.** 4 Item Tax rows on item groups were not imported. A new item does not take its group's defaults (ERPNext's `update_defaults_from_item_group`). Is this needed?
