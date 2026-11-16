# Add-on (`pacific_group`) server functions — probed on the live site

**When:** 16-11-2026, before the shutdown, on https://pacificengineeredsurfaces.nestorhawk.com
**How:** each whitelisted function was called with the inputs of real, existing POs, exactly as the PO form calls it
(see `pacific_group_purchase_order.js`). The answers were then compared with the values those POs have stored.

**No side effects.** Record counts were identical before and after:
- Purchase Order 3,200
- Purchase Receipt 5,554
- Purchase Invoice 1
- Item 7,331
- Account 176
- Comment 25,027
- Version 44,484

The site already had more POs and receipts than the backup: data keeps changing, so a final backup is needed.

## 1. `item_tax(item_row, tax_category)` and `get_doc(doc)` → per-item GST columns

Input: PUR-ORD/25-26/02512 (In-State, template *Input GST In-state - PESPL*).

| Item | Amount | Item Tax Template | Answer | Stored on the PO |
|---|---|---|---|---|
| N95 Mask | 16,500 | GST 5% - PESPL | max_per 5, max_amt 825, min_per 2.5, min_amt 412.5 | sgst = cgst = 2.5; sgst_amt = cgst_amt = 412.5 ✓ |
| 3Ply mask | 5,550 | GST 5% - PESPL | max_per 5, max_amt 277.5, min_per 2.5, min_amt 138.75 | sgst = cgst = 2.5; amounts 138.75 ✓ |

`get_doc(doc)` returns the same figures keyed by item code, for every item of the PO.

Input: PUR-ORD/25-26/02510 (Out-State). Its items have **no** Item Tax Template.
- The function returned nothing, so `igst` and `igst_amt` stayed 0.
- India Compliance's own `igst_rate` still shows 5 (from the PO's tax template).

**Derived rule** (to be confirmed over all historical rows by the golden tests):
- From the item row's **Item Tax Template**:
  - `max_per` = the highest tax rate in the template (the IGST rate, e.g. 5)
  - `min_per` = the lowest (the CGST/SGST rate, e.g. 2.5)
  - `max_amt` = amount × max_per / 100 and `min_amt` = amount × min_per / 100
- On the form:
  - Tax Category **Out-State** (with a Taxes and Charges template set) → `igst` = max_per, `igst_amt` = max_amt
  - Tax Category **In-State** → `sgst` = `cgst` = min_per, and `sgst_amt` = `cgst_amt` = min_amt
- Triggers:
  - a new PO opened with items (`get_doc`)
  - a change of an item's code, quantity or rate (`item_tax`, after a 2-second delay). This also copies the PO's
    Required By date onto the row.
- No Item Tax Template on the item → the columns are not filled. This explains why only about 44% of historical
  item rows have them.

## 2. `get_account_head(row, company)` → Cost Overheads account

Input: PUR-ORD/25-26/02486.

| Service item | Answer |
|---|---|
| TCS | Installation Charge - PESPL |
| Insurance Amount | Insurance Expenses - PESPL |

Both equal the account stored on the row. The service item's account for the company is looked up when the
service item is chosen.

## 3. `services_charges(row, item)` → the tax row a Cost Overhead adds

Input: PUR-ORD/25-26/02486 (Out-State, items taxed at IGST 18%).

| Overhead rows (same account) | Charges | Answer |
|---|---|---|
| TCS (Installation Charge - PESPL) | 32,391 | [5,830.38, "Installation Charge - PESPL"] = 32,391 × 18% |
| Insurance Amount (Insurance Expenses - PESPL) | 274 | [49.32, "Insurance Expenses - PESPL"] = 274 × 18% |

What the PO stored in its taxes table:
- row 1: *On Net Total*, Input Tax IGST 18%, 300,296.662
- row 2: **Actual**, Insurance Expenses - PESPL, `tax_amount` **49.32**, `service_price` 274

The grand total adds the 49.32 only, so the service charge itself is not in the total. No TCS row was present, which
fits the form script: it adds a row only when the charge is typed in.

**Derived rule** (to be confirmed by the golden tests):
- `tax_amount` = Σ(service charges of the overhead rows sharing the account head) × the GST rate of the PO's items / 100.
  The rate source is assumed to be the highest item rate; confirm on mixed-rate POs.
- Typing a charge removes any existing taxes row with the same account head and charge type, then adds:
  - Actual, with that account
  - `tax_amount` as above
  - `service_price` = the charge typed
- Choosing a service item already present in the table removes the new duplicate row.
- The Service Item picker only lists items flagged `service_item` (14 items).

## 4. Server-side totals (seen on screen, not callable)

On PUR-ORD/25-26/02486 the saved PO shows two things:
- **Total Taxes and Charges** = the tax rows **plus** the Cost Overhead charges (3,00,345.982 + 32,665 = 3,33,010.982).
- A whole-rupee **Grand Total** (20,01,326.00, rounding adjustment 0.00).

This is the add-on's save-time (server) logic, which no captured file contains. Details are in `ui-notes.md`.

## 5. Checked against the backup (all 3,199 POs, 16-11-2026)

Computed from the database dump (`scratchpad addon_rules.py`; to be turned into golden tests in Step 4).

| Rule | Evidence |
|---|---|
| Per-item `igst` = highest rate of the Item Tax Template and `igst_amt` = amount × rate; `cgst` = `sgst` = lowest rate, amounts likewise | 2,713 of 3,835 filled rows match exactly. 285 have the right % but an amount from before a later qty/rate edit (the 2-second delayed update). 11 differ. |
| Template source | 826 filled rows have **no** `item_tax_template` on the row. The add-on probably reads the template from the **Item master's** taxes table. Confirm in Step 4. |
| Templates with a single rate | Some templates have only one rate (e.g. "GST 18% - PESPL - PESPL": [18]). Under the max/min rule an In-State PO would then show CGST = SGST = 18. Check what was stored. |
| `total_taxes_and_charges` = taxes added − deducted + **Σ Cost Overhead service charges** | 272 of 300 POs with Cost Overheads. 25 equal the tax rows only (probably before the rule existed, or charges entered later). POs without overheads: 2,894 of 2,899 equal the tax rows. |
| `grand_total` = `net_total` + `total_taxes_and_charges`; `rounded_total` = round(grand_total) | Examples: 24-25/00007, 00008 (rounding −0.36), 00010, 00016 (+0.18). 738 POs without overheads do not satisfy `gt == net + ttc`; additional discount on grand total is likely. **Must be explained in Step 4.** |
| Overhead tax row: Actual, `tax_amount` = charges × **the service item's GST rate** | 18% on 252 rows (including 73 where the PO's items had no template, and POs whose items were at 12% or 28%). 5% on 3 (freight). 2 outliers (30.24%, 77.19%) were edited by hand. |
| Overhead account = the service item's **Item Default expense account** for the company | 369 of 373 rows. 4 differ (account blank on one side). |
| Service items (Item flag `service_item`) | Duty Charges (3.19%), Fabrication Charge, FCA Custom Formalities, Hardware Charge, Installation Charges, Insurance Amount, ISF and Clearance Chrages, Ocean Freight Charges, Packing & Forwarding Charges, Service Charge, Service Charges(Nails Gun), Shipping Charges, TCS, TYRE PRESSING CHARGE |

## Open points to settle with the golden tests

- Rate source for overheads when items carry different GST rates.
- How the *PDF PO* layout presents service charges against the grand total. It prints a separate "SERVICE ITEMS /
  SERVICE CHARGES" table; check against `pdfs/PDF PO/PUR-ORD_25-26_02486.pdf`.
