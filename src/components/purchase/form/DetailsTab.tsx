"use client";

// The Details tab, top to bottom as on the old form: Supplier / Date /
// Company; Shipment Type / Required By / the three checks (Is Subcontracted
// left out: unused, plan §5); Mode Of Transport / Purpose; Accounting
// Dimensions and Currency and Price List (collapsed); Set Target Warehouse;
// the Items grid with Total Quantity and Total; Cost Overhead; Taxes and
// Charges; Totals; Additional Discount, Tax Breakup and GST Breakup
// (collapsed). Shipping Rule, Incoterm, Project, Scan Barcode and Order
// Confirmation No are left out (unused in 2.5 years, plan §5).
import { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/purchase/format";
import { CHARGE_TYPES } from "@/lib/purchase/orders/form-schema";
import { MODES_OF_TRANSPORT, PURPOSES, SHIPMENT_TYPES } from "@/lib/purchase/orders/options";
import { emptyItemRow, emptyOverheadRow, emptyTaxRow } from "./rows";
import { useForm } from "./context";
import { CheckInput, DateInput, Field, LinkInput, NumberInput, ReadOnly, Section, SelectInput } from "./controls";
import { Grid } from "./Grid";
import { ItemRowForm, OverheadRowForm, TaxRowForm } from "./RowForms";
import type { Triggers } from "./triggers";
import { TaxBreakup, GstBreakup } from "./Breakup";

export function DetailsTab({ t }: { t: Triggers }) {
  const f = useForm();
  const { values: v, errors: e, editable: ed, money } = f;
  const fig = f.figures;
  const m = (x: number | undefined | null) => (x == null ? "" : formatCurrency(x, money.doc));
  const mb = (x: number | undefined | null) => (x == null ? "" : formatCurrency(x, money.base));
  const cur = `(${money.doc.code})`;
  const base = `(${money.base.code})`;
  const foreign = money.doc.code !== money.base.code;
  const [itemRow, setItemRow] = useState<number | null>(null);
  const [taxRow, setTaxRow] = useState<number | null>(null);
  const [overheadRow, setOverheadRow] = useState<number | null>(null);
  const rowDate = ed || f.updatable;

  return (
    <>
      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
          <Field label="Supplier" required error={e.supplier}>
            <LinkInput type="supplier" value={v.supplier} onChange={t.supplier} disabled={!ed} error={e.supplier} />
          </Field>
          <Field label="Date" required error={e.transactionDate}>
            <DateInput value={v.transactionDate} onChange={t.transactionDate} disabled={!ed} error={e.transactionDate} />
          </Field>
          <Field label="Company" required error={e.company}>
            <LinkInput type="company" value={v.company} onChange={t.company} disabled={!ed} error={e.company} />
          </Field>
          <Field label="Shipment Type" error={e.shipmentType}>
            <SelectInput value={v.shipmentType} options={SHIPMENT_TYPES} onChange={(x) => f.set("shipmentType", x)} disabled={!ed} error={e.shipmentType} />
          </Field>
          <Field label="Required By" error={e.scheduleDate}>
            <DateInput value={v.scheduleDate} onChange={t.scheduleDate} disabled={!rowDate} error={e.scheduleDate} />
          </Field>
          <div className="space-y-0.5 md:row-span-2">
            <CheckInput label="Apply Tax Withholding Amount" checked={v.applyTds} onChange={t.applyTds} disabled={!ed} />
            {v.applyTds && (
              <Field label="Tax Withholding Category" className="pb-1">
                <ReadOnly value={v.taxWithholdingCategory} />
              </Field>
            )}
            <CheckInput label="Is Reverse Charge" checked={v.isReverseCharge} onChange={t.isReverseCharge} disabled={!ed} />
          </div>
          <Field label="Mode Of Transport" error={e.modeOfTransport}>
            <SelectInput value={v.modeOfTransport} options={MODES_OF_TRANSPORT} onChange={(x) => f.set("modeOfTransport", x)} disabled={!ed} blank error={e.modeOfTransport} />
          </Field>
          <Field label="Purpose" error={e.purposeOfPurchase}>
            <SelectInput value={v.purposeOfPurchase} options={PURPOSES} onChange={(x) => f.set("purposeOfPurchase", x)} disabled={!ed} error={e.purposeOfPurchase} />
          </Field>
        </div>
      </Section>

      <Section title="Accounting Dimensions" collapsible defaultOpen={false}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
          <Field label="Cost Center" error={e.costCenter}>
            <LinkInput type="costCenter" params={{ company: v.company }} value={v.costCenter} onChange={(x) => f.set("costCenter", x)} disabled={!ed} error={e.costCenter} />
          </Field>
        </div>
      </Section>

      <Section title="Currency and Price List" collapsible defaultOpen={Boolean(e.currency || e.conversionRate)}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Currency" required error={e.currency}>
            <LinkInput type="currency" value={v.currency} onChange={t.currency} disabled={!ed} error={e.currency} />
          </Field>
          <Field label="Price List" error={e.buyingPriceList}>
            <LinkInput type="priceList" value={v.buyingPriceList} onChange={t.buyingPriceList} disabled={!ed} error={e.buyingPriceList} />
          </Field>
          {foreign ? (
            <Field label="Exchange Rate" required error={e.conversionRate} description={`Rate at which supplier's currency is converted to company's base currency`}>
              <NumberInput value={v.conversionRate} decimals={9} onChange={(x) => f.set("conversionRate", x)} disabled={!ed} error={e.conversionRate} />
            </Field>
          ) : (
            <div className="hidden md:block" />
          )}
          <Field label="Price List Currency">
            <ReadOnly value={f.displays.priceListCurrency} />
          </Field>
          <div className="hidden md:block" />
          {f.displays.priceListCurrency && f.displays.priceListCurrency !== money.base.code && (
            <Field label="Price List Exchange Rate" error={e.plcConversionRate}>
              <NumberInput value={v.plcConversionRate} decimals={9} onChange={(x) => f.set("plcConversionRate", x)} disabled={!ed} />
            </Field>
          )}
          <CheckInput label="Ignore Pricing Rule" checked={v.ignorePricingRule} onChange={(x) => f.set("ignorePricingRule", x)} disabled={!ed} />
        </div>
      </Section>

      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="hidden md:block" />
          <Field label="Set Target Warehouse" error={e.setWarehouse}>
            <LinkInput type="warehouse" params={{ company: v.company }} value={v.setWarehouse} onChange={t.setWarehouse} disabled={!ed} error={e.setWarehouse} />
          </Field>
        </div>
        <div className="mt-4">
          {e.items && <p className="mb-2 text-xs text-red-600">{e.items}</p>}
          <Grid
            label="Items"
            rows={v.items}
            editable={ed}
            rowError={(i) => Object.keys(e).some((k) => k.startsWith(`items.${i}.`))}
            onAdd={() => f.addRow("items", emptyItemRow(v.scheduleDate ?? (v.items[0]?.scheduleDate || null)))}
            onDelete={(rows) => f.removeRows("items", rows)}
            onEdit={setItemRow}
            columns={[
              { key: "item", label: "Item Code", required: true, width: "min-w-[220px]", cell: (row, i) => <LinkInput type="item" value={row.itemCode} onChange={(x) => t.itemCode(i, x)} disabled={!ed} error={e[`items.${i}.itemCode`]} /> },
              { key: "date", label: "Required By", required: true, width: "w-36", cell: (row, i) => <DateInput value={row.scheduleDate} onChange={(x) => t.itemScheduleDate(i, x)} disabled={!rowDate} error={e[`items.${i}.scheduleDate`]} /> },
              { key: "qty", label: "Quantity", required: true, align: "right", width: "w-28", cell: (row, i) => <NumberInput value={row.qty} onChange={(x) => f.setRow("items", i, { qty: x })} disabled={!ed} error={e[`items.${i}.qty`]} /> },
              { key: "uom", label: "UOM", required: true, width: "w-28", cell: (row, i) => <LinkInput type="uom" params={{ item: row.itemCode }} value={row.uom} onChange={(x) => t.uom(i, x)} disabled={!ed} error={e[`items.${i}.uom`]} /> },
              { key: "rate", label: `Rate ${cur}`, align: "right", width: "w-36", cell: (row, i) => <NumberInput value={row.rate} trim={false} onChange={(x) => f.setRow("items", i, { rate: x })} disabled={!ed} error={e[`items.${i}.rate`]} /> },
              { key: "amount", label: `Final Amount ${cur}`, align: "right", width: "w-40", cell: (_, i) => <div className="px-2 py-1 text-right text-gray-900">{m(fig?.items[i]?.amount)}</div> },
            ]}
          />
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Total Quantity">
            <ReadOnly value={fig ? formatQty(fig.totalQty) : ""} />
          </Field>
          <Field label={`Total ${cur}`}>
            <ReadOnly value={m(fig?.total)} />
          </Field>
          {foreign && (
            <>
              <div className="hidden md:block" />
              <Field label={`Total ${base}`}>
                <ReadOnly value={mb(fig?.baseTotal)} />
              </Field>
            </>
          )}
          {fig && fig.totalNetWeight > 0 && (
            <Field label="Total Net Weight">
              <ReadOnly value={formatQty(fig.totalNetWeight)} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Cost Overhead">
        <Grid
          label="Cost Overheads"
          rows={v.costOverheads ?? []}
          editable={ed}
          rowError={(i) => Object.keys(e).some((k) => k.startsWith(`costOverheads.${i}.`))}
          onAdd={() => f.addRow("costOverheads", emptyOverheadRow())}
          onDelete={(rows) => f.removeRows("costOverheads", rows)}
          onEdit={setOverheadRow}
          columns={[
            { key: "item", label: "Service Item", cell: (row, i) => <LinkInput type="serviceItem" value={row.serviceItem} onChange={(x) => t.serviceItem(i, x)} disabled={!ed} error={e[`costOverheads.${i}.serviceItem`]} /> },
            {
              key: "charges", label: "Service Charges", cell: (row, i) => (
                <NumberInput value={row.serviceCharges ?? null} align="left" onChange={(x) => f.setRow("costOverheads", i, { serviceCharges: x })} onCommit={() => t.serviceCharges(i)} disabled={!ed} />
              ),
            },
          ]}
        />
      </Section>

      <Section title="Taxes and Charges">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
          <Field label="Tax Category" error={e.taxCategory}>
            <LinkInput type="taxCategory" value={v.taxCategory} onChange={t.taxCategory} disabled={!ed} error={e.taxCategory} />
          </Field>
          <div className="hidden md:col-span-2 md:block" />
          <Field label="Purchase Taxes and Charges Template" error={e.taxesAndCharges}>
            <LinkInput type="taxTemplate" params={{ company: v.company }} value={v.taxesAndCharges} onChange={t.taxesAndCharges} disabled={!ed} error={e.taxesAndCharges} />
          </Field>
        </div>
        <div className="mt-4">
          {e.taxes && <p className="mb-2 text-xs text-red-600">{e.taxes}</p>}
          <Grid
            label="Purchase Taxes and Charges"
            rows={v.taxes ?? []}
            editable={ed}
            rowError={(i) => Object.keys(e).some((k) => k.startsWith(`taxes.${i}.`))}
            onAdd={() => f.addRow("taxes", emptyTaxRow())}
            onDelete={(rows) => f.removeRows("taxes", rows)}
            onEdit={setTaxRow}
            columns={[
              { key: "type", label: "Type", required: true, width: "w-48", cell: (row, i) => <SelectInput value={row.chargeType} options={CHARGE_TYPES} onChange={(x) => x && f.setRow("taxes", i, { chargeType: x, ...(x !== "On Previous Row Amount" && x !== "On Previous Row Total" ? { rowId: null } : {}) })} disabled={!ed} error={e[`taxes.${i}.chargeType`]} /> },
              { key: "account", label: "Account Head", required: true, width: "min-w-[220px]", cell: (row, i) => <LinkInput type="taxAccount" params={{ company: v.company }} value={row.accountHead} onChange={(x) => t.taxAccount(i, x)} disabled={!ed} error={e[`taxes.${i}.accountHead`]} /> },
              {
                key: "amount", label: `Amount ${cur}`, align: "right", width: "w-40", cell: (row, i) =>
                  row.chargeType === "Actual" && ed ? (
                    <NumberInput value={row.taxAmount} trim={false} onChange={(x) => f.setRow("taxes", i, { taxAmount: x })} />
                  ) : (
                    <div className="px-2 py-1 text-right text-gray-900">{m(fig?.taxes[i]?.taxAmount)}</div>
                  ),
              },
              { key: "total", label: `Total ${cur}`, align: "right", width: "w-40", cell: (_, i) => <div className="px-2 py-1 text-right text-gray-900">{m(fig?.taxes[i]?.total)}</div> },
            ]}
          />
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="hidden md:block" />
          <div className="space-y-3">
            <Field label={`Taxes and Charges Added ${cur}`}>
              <ReadOnly value={m(fig?.taxesAndChargesAdded)} />
            </Field>
            {fig && fig.taxesAndChargesDeducted !== 0 && (
              <Field label={`Taxes and Charges Deducted ${cur}`}>
                <ReadOnly value={m(fig.taxesAndChargesDeducted)} />
              </Field>
            )}
            <Field label={`Total Taxes and Charges ${cur}`}>
              <ReadOnly value={m(fig?.totalTaxesAndCharges)} />
            </Field>
            {foreign && (
              <Field label={`Total Taxes and Charges ${base}`}>
                <ReadOnly value={mb(fig?.baseTotalTaxesAndCharges)} />
              </Field>
            )}
          </div>
        </div>
      </Section>

      <Section title="Totals">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="space-y-3">
            {foreign && (
              <>
                <Field label={`Grand Total ${base}`}>
                  <ReadOnly value={mb(fig?.baseGrandTotal)} />
                </Field>
                <Field label={`Rounding Adjustment ${base}`}>
                  <ReadOnly value={mb(fig?.baseRoundingAdjustment)} />
                </Field>
                <Field label={`Rounded Total ${base}`}>
                  <ReadOnly value={mb(fig?.baseRoundedTotal)} />
                </Field>
                <Field label={`In Words ${base}`}>
                  <ReadOnly value={fig?.baseInWords} />
                </Field>
              </>
            )}
          </div>
          <div className="space-y-3">
            <Field label={`Grand Total ${cur}`}>
              <ReadOnly value={m(fig?.grandTotal)} />
            </Field>
            <Field label={`Rounding Adjustment ${cur}`}>
              <ReadOnly value={m(fig?.roundingAdjustment)} />
            </Field>
            <Field label={`Rounded Total ${cur}`}>
              <ReadOnly value={m(fig?.roundedTotal)} />
            </Field>
            <CheckInput label="Disable Rounded Total" checked={v.disableRoundedTotal} onChange={(x) => f.set("disableRoundedTotal", x)} disabled={!ed} />
            <Field label={`In Words ${cur}`}>
              <ReadOnly value={fig?.inWords} />
            </Field>
            <Field label="Advance Paid">
              <ReadOnly value={mb(f.doc.advancePaid)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Additional Discount" collapsible defaultOpen={Boolean(v.additionalDiscountPercentage || v.discountAmount)}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Apply Additional Discount On" error={e.applyDiscountOn}>
            <SelectInput value={v.applyDiscountOn} options={["Grand Total", "Net Total"] as const} onChange={(x) => x && f.set("applyDiscountOn", x)} disabled={!ed} />
          </Field>
          <Field label="Additional Discount Percentage" error={e.additionalDiscountPercentage}>
            <NumberInput value={v.additionalDiscountPercentage} onChange={t.additionalDiscountPercentage} disabled={!ed} error={e.additionalDiscountPercentage} />
          </Field>
          <Field label={`Additional Discount Amount ${base}`}>
            <ReadOnly value={mb(fig?.baseDiscountAmount)} />
          </Field>
          <Field label={`Additional Discount Amount ${cur}`} error={e.discountAmount}>
            <NumberInput value={v.additionalDiscountPercentage ? (fig?.discountAmount ?? 0) : v.discountAmount} trim={false} onChange={t.discountAmount} disabled={!ed} error={e.discountAmount} />
          </Field>
        </div>
      </Section>

      <Section title="Tax Breakup" collapsible defaultOpen={false}>
        <TaxBreakup />
      </Section>
      <Section title="GST Breakup" collapsible defaultOpen={false}>
        <GstBreakup />
      </Section>

      {itemRow !== null && v.items[itemRow] && <ItemRowForm index={itemRow} t={t} onClose={() => setItemRow(null)} onMove={setItemRow} />}
      {taxRow !== null && v.taxes?.[taxRow] && <TaxRowForm index={taxRow} t={t} onClose={() => setTaxRow(null)} />}
      {overheadRow !== null && v.costOverheads?.[overheadRow] && <OverheadRowForm index={overheadRow} t={t} onClose={() => setOverheadRow(null)} />}
    </>
  );
}

/** A Float field's display: whole numbers without decimals, else three (Frappe's format_value). */
export function formatQty(x: number) {
  return Number.isInteger(x) ? formatNumber(x, 0) : formatNumber(x, 3);
}
