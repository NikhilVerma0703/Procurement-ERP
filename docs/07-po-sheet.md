# Step 7: the PO sheet (PDF)

**Status:** built and compared, 18-11-2026.
- Five of the old site's eleven PO print layouts are built: every layout the old site has reference PDFs for.
- All 16 comparable reference PDFs match word for word, except the words the old PDF of the 40-item PO garbled. One
  more captured PO was created after the backup.
- Text lines and borders land where the old PDFs had them, within 0.03pt in the heading box. Table columns are within
  about 2.5pt.
- **Not checked yet:** the print view, signed in, in the browser.

**Code:**
- **Route:** `src/app/api/purchase/orders/[id]/pdf/route.ts`
  `GET /api/purchase/orders/<id>/pdf?format=<layout>[&download=1]`
- **Print view:** `src/app/purchase/orders/[id]/print/page.tsx`, `src/components/purchase/print/PrintView.tsx`.
  It opens from the printer icon on a saved PO.
- **Sheet (`src/lib/purchase/pdf/`):**
  - `render.ts`: server only. pdfmake, Roboto, the logo, text widths, refusals.
  - `sheet.ts`: the stored PO, as the templates received it.
  - `pyfmt.ts`: values printed the way Jinja printed them.
  - `layouts/index.ts`: the layouts by Print Format name.
  - `layouts/pdf-po.ts`: "PDF PO".
  - `layouts/lined.ts`, `layouts/lined-heading.ts`: the four later layouts.
  - `layouts/parts.ts`: what the layouts share.
  - `layouts/css-table.ts`: the old browser's table widths and line breaks.
- **File store seam:** `src/lib/purchase/server/files.ts` (the logo)
- **Check script:** `scripts/check-sheets.ts`

**Tests:** `tests/purchase/sheet.test.ts`. They cover:
- Python/Jinja value formats.
- Terms paragraphs.
- Table widths and line breaks.
- What each layout prints, page breaks, and when the tax and Cost Overheads tables appear.

## 1. What prints

| | The old site | Here |
|---|---|---|
| Layouts | 11 Jinja Print Formats; default "PDF PO" | "PDF PO" (default), "Import PO", "PO print format", "Purchase Order 2025", "PURCHASE ORDER TEMPLATE" |
| Drafts | Print (Print Settings "Allow Print for Draft") | Print |
| Cancelled POs | "Not allowed to print cancelled documents" | The same message, title "Not Permitted" (HTTP 403) |
| Several POs at once (the list's Actions → Print) | One PDF, `Purchase-Order.pdf`: each PO's sheet in turn (`download_multi_pdf`) | The same, from each PO's own sheet, joined with pdf-lib ([05](05-list-screen.md) §2) |
| File name | The PO name, `/` → `-` | `PUR-ORD-25-26-02510.pdf` |
| Figures | As stored | As stored. Nothing is recomputed: an approved PO prints what was approved. |
| Paper | A4, 15 mm margins | The same |

- **Print view.** It works like ERPNext's: a Print Format select, then a **PDF** button (download) and **Print**. The
  sheet shows inline below them.
- **Access.** The route checks the module gate (`purchaseGate("view")`) like every API route. A layout name it does
  not know is refused with Frappe's "Print Format X not found".
- **Letter head.** The old print view offered the "Logo" letter head. The PO layouts draw their own logo, and the
  captured PDFs show no letter head above it, so there is nothing to choose. The view offers no letter-head select.
- **Not built:** "Drop Shipping Format", "Future Lab PO", "Purchase Order", "Purchase Order Print", "tecnosint" and
  "Test Future Lab PO" have no reference PDFs. Which layouts the team still prints is the owner's open question
  (plan §8.4). Each one would be a new file in `layouts/`, checked against a captured PDF.

## 2. Values, as the templates printed them

The templates were Jinja, given the PO as Frappe loaded it. `pyfmt.ts` prints the same text:

- **Numbers** print as Python's `str(float)`: `6.0`, `415799.5`, `44692.02`.
- **Fixed decimals.** `'%0.2f'` rounds the exact binary value, ties to even.
- **Dates** print as ISO (`2026-11-07`) in "PDF PO". `formatdate(…, "dd-MM-yyyy")` / `strftime('%d-%m-%Y')` prints
  `07-11-2026` in the later layouts.
- **Empty fields** print `None`: `DELIVERY TERM : None None` when neither terms template nor terms are set.
- **The rate** prints with its currency: `₹ 11,900.00`, `$ 2.50` (`get_formatted`).
- **The terms** keep their paragraphs. The old print style gave each `<p>` a 3px margin, so an empty editor
  (`<p><br></p>`) still prints an empty line with space around it (a bare bullet in the later layouts).

## 3. Drawn to the old PDFs' measurements

The captured PDFs were measured from their own drawing commands. wkhtmltopdf drew one CSS pixel as 0.75pt.

- **Type.** 6.75pt text (CSS `xx-small`). Lines are 10.5pt apart, or 9pt after the items table on the later
  layouts. Borders are 0.75pt lines.
- **Baseline.** The browser put a line's baseline 7.5pt below its top; pdfmake puts it 6.37pt below. Every text block
  is lowered by the difference (`raise`) and gives it back underneath, so the baselines match.
- **Heading.** The logo (153.7 × 40.5pt) and PURCHASE ORDER (13.5pt) sit where every layout put them.
- **Items table.**
  - It starts 3pt above the end of the heading box, as it did on the old sheets.
  - Its column widths follow WebKit's table layout (`css-table.ts`). Each column starts at its longest word. Columns
    with a heading percentage (`width: 8%` …) take that share. What is left is shared by percentage.
  - A cell wraps at spaces, and after a hyphen inside a word: `QUARTZ GRITS 0.6-` / `1.2MM PREMIUM`.
- **Later layouts' heading boxes.** Their templates used flexbox, which wkhtmltopdf's WebKit did not know, so
  everything stacked:
  - PO NO stands above PO DATE, with the short upright line the half-width box left.
  - PAYMENT TERMS stands under the shipping address, not beside it.
  - The suppliers received the stacked sheets, so that is what is drawn.
- **Pages.** Ten items to a page, with the heading box and column heads on every page, as the templates did. A PO
  without items still gets one page. The closing part follows the last items.
- **Font.** The old sheets were set in Open Sans. These use Roboto, the Main ERP's PDF font (pdfmake's own). Its bold is
  Roboto Medium, lighter than Open Sans Bold. Lines run a little shorter. Column widths come out within about 2.5pt of
  the old ones.

## 4. The layouts

**Common to all:** the heading box (logo, supplier, order details, shipping address, payment terms), the items table,
the tax rows (and Cost Overheads, when they add up to more than nothing), the totals, the five notes and the factory
address.

| Layout (last edited) | Heading box | Items | Closing |
|---|---|---|---|
| **PDF PO** (04-04-2024, the default) | Grid: PO NO / PO DATE, CURRENCY / DELIVERY DATE; "SHIPPING METHOD : BY ROAD"; DELIVERY TERM; PAYMENT TERMS beside the shipping address | Item **code**; ISO dates | Half-width tables; "Delivery Terms : DAP"; FOR … / AUTHORISED SIGNATORY on the right; 10.5pt lines |
| **Import PO** (29-05-2024) | Lined; "SHIPPING METHOD :" + the PO's mode of transport | Item **name**; figures right-aligned (DIS % left, as in the template) | FOR … / AUTHORISED SIGNATORY; "This is an electronically generated report, hence does not require a signature" |
| **PO print format** (04-09-2025) | Lined; MODE OF TRANSPORT, SHIPMENT TYPE, PURPOSE | Item name | REQUESTED BY / PREPARED BY / APPROVED BY down the page; the factory address usually lands on a second page, as it did |
| **Purchase Order 2025** (04-09-2025) | Lined; "Mode of Transport", "Shipment Type" | Item name | FOR … / AUTHORISED SIGNATORY |
| **PURCHASE ORDER TEMPLATE** (05-09-2025) | Lined; MODE OF TRANSPORT and PURPOSE, then SHIPMENT TYPE; the shipping row inside the same box | Item name | Full-width tax rows; totals, "TERMS & CONDITIONS:" notes and REMARKS in a box; three signature boxes; footer with "LIMITED" spelled right |

## 5. Old quirks kept, old defects not copied

**Kept, because they printed that way:**
- **TAXABLE VALUES** is the amount minus the discount *percentage*.
- **"PDF PO" fixed text.** It always prints "SHIPPING METHOD : BY ROAD" and "Delivery Terms : DAP".
- **REMARKS** prints the PO's status.
- **Typos.** The footer's "lIMITED", and the spacing in "SHIPPING METHOD :Ship" and "IN WORDS : …".
- **Template text.** Each layout keeps its own capitals and punctuation.

**Not copied: the browser lost or garbled content on these, and the replica prints it whole:**
- **The 40-item PO** (01426, "PDF PO"). The template opened each repeated heading inside the unclosed items table, so
  the old PDF drew the heading over the rows. Here each page's heading box comes before its table.
- **"FOR PACIFIC … LIMITED" in "PDF PO".** The old PDF right-aligned it past the page margin, which cut off its end.
  Here it ends at the margin.
- **The TEMPLATE's PAYMENT TERMS.** The old PDF shifted it left past the margin ("YMENT TERMS:"). Here it prints in
  full, under the shipping address.
- **The items table's right border.** The old PDF drew it 0.75pt past the margin, so it was cut off. Here it is drawn.

## 6. Checking against the old PDFs

```bash
npx tsx --conditions=react-server scripts/check-sheets.ts [--keep <dir>]
```

**How it works:**
- For every captured PO in a built layout (`docs/reference/live-capture/pdfs/manifest.json`), it renders the sheet.
- It extracts both texts with pdftotext and checks that every word of each is in the other.
- The two renderers wrap differently, so words are compared with spaces and line breaks taken out.
- pdftotext joins a word broken after a hyphen ("0.6-" / "1.2MM" → "0.61.2MM"); that counts as the same word.
- The cancelled PO must be refused with the old message.

**Result (18-11-2026):** 16 of 16 match.
- 12 in "PDF PO", including the refused cancelled PO.
- 01426 matches except the words its old PDF garbled.
- One each in the four later layouts.
- 02530 (a draft) was created after the backup, so it is not in the data.

**Result (19-11-2026, on the 19-11 backup):** 17 of 17 match.
- 02530, the draft created after the 16-11 backup, is now in the data.
- Two POs were saved on the old site after the PDFs were captured: 02419 was received (now "To Bill"), and 02530 was
  approved and received. Their sheets print the status as it is now, so only the status words differ ("Receive",
  "Draft"). The check accepts exactly that for a PO saved after the capture, and nothing else.
- Every PO created or saved since the 16-11 backup (18 new, 9 saved again) renders in all five layouts: 135 sheets,
  0 failed.

**Every PO, every layout (18-11-2026).** All 3,199 imported POs were rendered in all five layouts:
- 15,825 sheets rendered and 0 failed.
- 170 were refused: the 34 cancelled POs, in each of the five layouts.
- Most sheets are one page. "PO print format" runs to a second page on 1,221 POs, because its factory address moves
  over, as it did on the old site.
- The longest is five pages.

## 7. Not in this step

- **Email to supplier with the sheet attached:** Step 8, with the notifications.
- **The other six layouts:** if the owner wants them (plan §8.4).
