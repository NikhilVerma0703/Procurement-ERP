# Step 4: calculation, GST and status engine

**Status:** done (16-11-2026). The engine reproduces the stored figures of all 3,199 historical POs; every difference
is explained (golden check below). Re-run on the 19-11-2026 backup: 3,217 POs, 0 unexplained differences. The owner decided on 16-11-2026 to correct the old site's defects, not copy them
(§6).

**Code:** `src/lib/purchase/calc/`
**Run the golden check with:** `npm run golden` (needs the imported local data; report in `data/reports/`)
**Tests:** `tests/purchase/calc.test.ts`

## 1. What it is

One pure function, `calculatePurchaseOrder(input)` in `calc/index.ts`, computes every PO figure that is not typed:

- item rates, amounts, net amounts and base (INR) values
- tax rows, the item-wise tax breakup, totals, discount, Grand Total, Rounded Total, rounding adjustment, In Words
- payment schedule amounts
- GST per row (taxable value, rates, amounts, treatment) and the add-on's GST columns of the PO sheet

The PO form will run it live. The server action will run it again and store only its own result (server authority,
`CLAUDE.md`). `purchaseOrderStatus()` sets the status.

| File | Rules | Source |
|---|---|---|
| `pymath.ts` | Python/Frappe number behaviour: exact `round()`, `flt()` with "Banker's Rounding (legacy)", `%`, rounding to the currency's smallest fraction, MariaDB `DECIMAL(21,9)` text | Frappe 14.101.1 `utils/data.py` |
| `totals.ts` | `calculate_taxes_and_totals` for a PO, step by step: items, margin, inclusive taxes, net total, taxes, discount, totals, rounding. Cost Overheads inside the totals step (add-on). | ERPNext 14.92.14 `controllers/taxes_and_totals.py` |
| `words.ts` | `money_in_words` and num2words (lakh/crore for INR, million for other currencies) | Frappe, num2words |
| `schedule.ts` | Payment schedule rows from a terms template, due dates, amounts | ERPNext `accounts_controller.py` |
| `gst.ts` | Taxable value, GST rate/amount per row, GST treatment | India Compliance 14.36 `overrides/transaction.py` |
| `addon.ts` | The add-on's IGST / CGST / SGST columns printed on the PO sheet | live probes + backup |
| `status.ts` | PO status (Draft, To Receive and Bill, …, Closed, On Hold) | ERPNext `status_updater.py` |
| `settings.ts` | The old site's settings: precision, rounding method, GST tax types, and their 2024 history | backup |
| `golden.ts` | The golden check (reads the database; not part of the engine) | — |

The ERPNext rules are re-implemented, not copied: same steps, same rounding points, same float arithmetic. That is
the only way to match ERPNext's stored figures to the last decimal.

## 2. The old site's settings

- **Rounding:** "Banker's Rounding (legacy)". With decimals, a half rounds up after Python's `round(x, 8)`. To whole
  units, a half rounds to even: 415,799.50 → 415,800; 23,152.50 → 23,152.
- **Rounded Total:** to the currency's smallest fraction. INR, JPY: whole units. USD, EUR: 0.01.
- **Precision:** 3 decimals for every Currency, Float and Percent field today, except the conversion rates (9). The
  settings changed in 2024, and each stored PO keeps the precision of its last save. Times are UTC.

  | From | Currency fields | Float / Percent fields |
  |---|---|---|
  | site start (23-03-2024) | 2 | 3 |
  | 24-07-2024 11:40, then 11:42, 11:43, 11:45 (six minutes of trials) | 5, 5, 3, 3 | 3, 5, 3, 2 |
  | 24-07-2024 11:46 | 2 | 2 |
  | 27-07-2024 05:54 | 2 | 4 |
  | 13-11-2024 10:34 | 3 | 4 |
  | 23-12-2024 13:02 | 3 | 3 |

## 3. The add-on's rules (`pacific_group`, no source available)

1. **Cost Overheads** are added to the Grand Total inside ERPNext's totals step. So they also:
   - count in Total Taxes and Charges when the PO has tax rows;
   - count in a percentage discount on the Grand Total;
   - count in the Rounded Total and In Words.

   The GST on a service charge is a separate Actual tax row, which the form adds when the charge is typed (Step 6).
2. **GST columns of the PO sheet** (`igst`, `cgst`, `sgst` and their amounts) come from the row's Item Tax Template:
   - the highest rate is IGST; the lowest is CGST = SGST;
   - amount = row amount × rate / 100;
   - Out-State POs fill IGST; In-State POs fill CGST and SGST; any other tax category, or a row without a template,
     gets none.

   The PDF PO prints them, with a per-row total of amount + CGST + SGST + IGST.

The old form filled these columns in the browser, 2 seconds after an item, qty or rate was typed. Rows added any
other way were never filled. Rows edited within those 2 seconds kept old amounts. The replica computes the columns on
every save (§6, D4).

## 4. How the old site's code changed

The old site's patch log shows four app versions:

| Period (last save) | POs | What matters for the figures |
|---|---:|---|
| up to 15-10-2024 11:46 | 248 | ERPNext keeps its working difference in the PO's `rounding_adjustment` field and adds the rounding to it (`+=`). Discount: whole rounding loss on the last item. |
| up to 03-12-2025 08:05 | 1,324 | Same field, now overwritten (`=`). Same discount code. India Compliance without its later rounding correction. |
| up to 24-04-2026 01:26 | 602 | ERPNext #46829 moves the working difference out of the field and stops resetting it. New discount code (#46720). |
| from 24-04-2026 (today: ERPNext 14.92.14) | 1,025 | As above, plus #51787. |

**The add-on replaced ERPNext's `calculate_totals`** with a copy of ERPNext's 2023 code plus the Cost Overheads, and
that copy reads its working difference from the PO's `rounding_adjustment` field. Two defects follow:

- **Until 03-12-2025:** a discount on the Grand Total put the leftover in that field, and the copy added the Cost
  Overheads on top. The overheads were therefore counted twice.
- **From 03-12-2025:** ERPNext no longer reset the field before each calculation. The copy then added whatever
  rounding adjustment the form held at save time to the Grand Total. The Grand Total was shifted by up to ±0.50, and
  sometimes the Rounded Total by ₹1.

  The adjustment the form held is not stored, and it changed with every save. Re-saving a PO without changes could
  flip its Grand Total, for example between 2,389.38 and 2,389.12.

## 5. Golden check

`npm run golden` recomputes every PO with **the old site's own code for the period of its last save**: the precision
of the time, the ERPNext and India Compliance version, and the add-on's copy, defects included. This is
`OldSiteMode` in `totals.ts`; the golden check is its only user.

For saves from 03-12-2025, the check finds the one carried-over rounding adjustment that reproduces the stored Grand
Total, then requires every other figure to follow from it. The check then compares every computed figure with the
stored one.

**Result (16-11-2026):**
- **3,199 POs checked.** Totals, taxes, discount, Rounded Total, In Words, payment schedule and status match on
  **every** PO.
- **2,580 POs** match on every figure, row figures included. **0 unexplained differences.**
- **821 POs** saved from 03-12-2025 needed a carried-over rounding adjustment, always between −0.50 and +0.50.

**Re-run on the 19-11-2026 backup:** 3,217 POs checked, **2,596** match on every figure, **0 unexplained differences**,
833 with the carried-over rounding adjustment. The differences have the same causes as below
(`data/reports/golden-20261119-100001.md`).

**The remaining differences are figures the old site never refreshed:**

| Cause | Figures |
|---|---:|
| Add-on GST columns on a PO whose Tax Category is now neither In-State nor Out-State | 1,531 |
| Add-on GST rate from an earlier template or tax category of the row (or none on it now) | 464 |
| Add-on GST amount from an earlier qty or rate (filled 2 s after typing) | 301 |
| Rows changed after submit ("Update Items"): taxable value, GST per row and rate per stock unit not refreshed | 274 |
| Add-on GST columns never filled | 145 |
| The Item Tax Template's GST treatment was set after the PO's last save | 2 |

**Notes for reading the report:**
- Key order in the item-wise tax breakup is ignored. Postgres `jsonb` re-sorts keys, and the order has no meaning.
- The report also lists, per field, the POs whose stored figure differs from **today's rules** (§6).

## 6. Defects not carried over (owner decision, 16-11-2026)

The engine follows today's ERPNext (14.92.14) and the add-on's evident intent, without the defects below. The owner
approved correcting them, not copying them, on 16-11-2026. **This only affects POs saved in the replica.** Imported POs
keep their stored figures (as-is migration).

| # | Old-site defect | The replica | Historical POs affected |
|---|---|---|---:|
| D1 | From 03-12-2025, the Grand Total carried the form's previous rounding adjustment (±0.50), and sometimes the Rounded Total, In Words and payment schedule were ₹1 off. **The PDF PO prints that Grand Total.** | Grand Total = net + taxes + overheads; Rounded Total from that. | Grand Total 821, Rounded Total 147 |
| D2 | Cost Overheads counted twice when the Grand Total was discounted. | Counted once. They are fixed charges, not spread over the items. | 4 |
| D3 | On a PO without tax rows, the company-currency Grand Total left the Cost Overheads out, while the Rounded Total kept them. | Kept in. | 25 |
| D4 | The add-on's GST columns were filled by the browser and often stale or empty. | Computed on every save by the same rule. | ≈ 2,400 figures |
| D5 | "Update Items" after submit left the taxable value and GST per row stale. | Refreshed with the totals. | 274 figures |

**Why corrected:**
- **D1 and D2** change the amount a supplier is shown and paid. D1 also depends on what the browser held, not on the
  PO, so saving an unchanged PO could change its Grand Total.
- **D3** made the company-currency Grand Total disagree with the Rounded Total.

**Kept as on the old site (no change requested):**
- **D4** still follows the add-on's rule (template, In-State / Out-State). The 1,203 POs that charged GST without a Tax
  Category therefore print no GST in those columns, as on the old site. Filling them from the PO's GST rows instead
  would be a change.

## 7. Left for later steps

- **Step 6 (PO form), deliberately not in the engine:**
  - choosing the Item Tax Template from the Item master (`validate_item_tax_template`);
  - adding the Actual tax row for a Cost Overhead charge;
  - the GST account → GST type map and tax-withholding accounts (masters passed in).
- **Pricing rules:** none are used on the site (0 rows), so they are not implemented.
- **Rare tax set-ups:**
  - Taxes included in the rate: two historical POs.
  - A tax "On Previous Row Total": one PO.

  All three match on every engine figure.
- **Status:** `per_received` and `per_billed` come from receipts and invoices, which depend on the open decision on
  how goods receipts are recorded (plan §5).
