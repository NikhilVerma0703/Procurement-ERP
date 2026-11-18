"use client";

// The full form of one table row ("Editing Row #n"), with the old row form's
// sections and fields. Computed values are shown read-only from the figures.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/purchase/format";
import { CHARGE_TYPES, TAX_CATEGORIES } from "@/lib/purchase/orders/form-schema";
import { useForm } from "./context";
import { CheckInput, DateInput, Field, LinkInput, NumberInput, ReadOnly, Section, SelectInput, TextArea, TextInput } from "./controls";
import { RowDialog } from "./Grid";
import type { Triggers } from "./triggers";

const pct = (x: number | undefined) => (x == null ? "" : Number.isInteger(x) ? formatNumber(x, 0) : formatNumber(x, 3));

function RowActions({ table, index, onClose }: { table: "items" | "taxes" | "costOverheads" | "paymentSchedule"; index: number; onClose: () => void }) {
  const f = useForm();
  if (!f.editable) return null;
  return (
    <button
      type="button"
      className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
      onClick={() => {
        f.removeRows(table, [index]);
        onClose();
      }}
    >
      Delete
    </button>
  );
}

export function ItemRowForm({ index, t, onClose, onMove }: { index: number; t: Triggers; onClose: () => void; onMove: (i: number) => void }) {
  const f = useForm();
  const row = f.values.items[index];
  const calc = f.figures?.items[index];
  const info = f.rowInfo[index];
  const e = f.errors;
  const ed = f.editable;
  const rowDate = ed || f.updatable;
  const p = (k: string) => e[`items.${index}.${k}`];
  const m = (x: number | undefined) => (x == null ? "" : formatCurrency(x, f.money.doc));
  const mb = (x: number | undefined) => (x == null ? "" : formatCurrency(x, f.money.base));
  const cur = `(${f.money.doc.code})`;
  const base = `(${f.money.base.code})`;
  const set = (x: Parameters<typeof f.setRow<"items">>[2]) => f.setRow("items", index, x);
  const nav = (
    <span className="flex items-center gap-1">
      <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40" disabled={index === 0} aria-label="Previous row" onClick={() => onMove(index - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40" disabled={index >= f.values.items.length - 1} aria-label="Next row" onClick={() => onMove(index + 1)}>
        <ChevronRight className="h-4 w-4" />
      </button>
      <RowActions table="items" index={index} onClose={onClose} />
    </span>
  );
  return (
    <RowDialog title={`Editing Row #${index + 1}`} onClose={onClose} actions={nav}>
      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Item Code" required error={p("itemCode")}>
            <LinkInput type="item" value={row.itemCode} onChange={(x) => t.itemCode(index, x)} disabled={!ed} error={p("itemCode")} />
          </Field>
          <Field label="Required By" required error={p("scheduleDate")}>
            <DateInput value={row.scheduleDate} onChange={(x) => t.itemScheduleDate(index, x)} disabled={!rowDate} error={p("scheduleDate")} />
          </Field>
          <Field label="Item Name" required error={p("itemName")}>
            <TextInput value={row.itemName} onChange={(x) => set({ itemName: x })} disabled={!ed} error={p("itemName")} />
          </Field>
          <Field label="Expected Delivery Date" error={p("expectedDeliveryDate")}>
            <DateInput value={row.expectedDeliveryDate} onChange={(x) => set({ expectedDeliveryDate: x })} disabled={!rowDate} />
          </Field>
        </div>
      </Section>
      <Section title="Description" collapsible defaultOpen>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Description" className="md:col-span-2">
            <TextArea value={row.description} onChange={(x) => set({ description: x })} disabled={!ed} rows={3} />
          </Field>
          <Field label="HSN/SAC">
            <ReadOnly value={info?.gstHsnCode} />
          </Field>
        </div>
      </Section>
      <Section title="Quantity and Rate">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Quantity" required error={p("qty")}>
            <NumberInput value={row.qty} onChange={(x) => set({ qty: x })} disabled={!ed} error={p("qty")} />
          </Field>
          <Field label="UOM" required error={p("uom")}>
            <LinkInput type="uom" params={{ item: row.itemCode }} value={row.uom} onChange={(x) => t.uom(index, x)} disabled={!ed} error={p("uom")} />
          </Field>
          <Field label="Stock UOM">
            <ReadOnly value={info?.stockUom} />
          </Field>
          <Field label="UOM Conversion Factor" required error={p("conversionFactor")}>
            <NumberInput value={row.conversionFactor} decimals={9} onChange={(x) => set({ conversionFactor: x })} disabled={!ed || row.uom === info?.stockUom} error={p("conversionFactor")} />
          </Field>
          <Field label="Qty in Stock UOM">
            <ReadOnly value={calc ? pct(calc.stockQty) : ""} />
          </Field>
        </div>
      </Section>
      <Section title="Rate">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label={`Price List Rate ${cur}`}>
            <NumberInput value={row.priceListRate} trim={false} onChange={(x) => t.pricing(index, { priceListRate: x })} disabled={!ed} />
          </Field>
          <Field label={`Last Purchase Rate ${cur}`}>
            <ReadOnly value={m(info?.lastPurchaseRate)} />
          </Field>
          <Field label="Margin Type">
            <SelectInput value={row.marginType} options={["Percentage", "Amount"] as const} blank onChange={(x) => t.pricing(index, { marginType: x })} disabled={!ed} />
          </Field>
          <Field label="Margin Rate or Amount">
            <NumberInput value={row.marginRateOrAmount} onChange={(x) => t.pricing(index, { marginRateOrAmount: x })} disabled={!ed || !row.marginType} />
          </Field>
          <Field label="Discount (%) on Price List Rate with Margin" error={p("discountPercentage")}>
            <NumberInput value={row.discountPercentage} onChange={(x) => t.pricing(index, { discountPercentage: x })} disabled={!ed} error={p("discountPercentage")} />
          </Field>
          <Field label={`Discount Amount ${cur}`}>
            <NumberInput value={row.discountAmount} trim={false} onChange={(x) => t.pricing(index, { discountAmount: x })} disabled={!ed} />
          </Field>
          <Field label={`Rate ${cur}`} required error={p("rate")}>
            <NumberInput value={row.rate} trim={false} onChange={(x) => set({ rate: x })} disabled={!ed} error={p("rate")} />
          </Field>
          <Field label={`Final Amount ${cur}`}>
            <ReadOnly value={m(calc?.amount)} />
          </Field>
          <Field label="Item Tax Template" error={p("itemTaxTemplate")}>
            <LinkInput type="itemTaxTemplate" value={row.itemTaxTemplate} onChange={(x) => set({ itemTaxTemplate: x })} disabled={!ed} error={p("itemTaxTemplate")} />
          </Field>
          <Field label="GST Treatment">
            <ReadOnly value={calc?.gstTreatment} />
          </Field>
          {f.money.doc.code !== f.money.base.code && (
            <>
              <Field label={`Rate ${base}`}>
                <ReadOnly value={mb(calc?.baseRate)} />
              </Field>
              <Field label={`Amount ${base}`}>
                <ReadOnly value={mb(calc?.baseAmount)} />
              </Field>
            </>
          )}
          <Field label={`Net Rate ${cur}`}>
            <ReadOnly value={m(calc?.netRate)} />
          </Field>
          <Field label={`Net Amount ${cur}`}>
            <ReadOnly value={m(calc?.netAmount)} />
          </Field>
          <CheckInput label="Apply TDS" checked={row.applyTds !== false} onChange={(x) => set({ applyTds: x })} disabled={!ed} />
        </div>
      </Section>
      <Section title="GST Details" collapsible defaultOpen={false}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
          <Field label={`Taxable Value ${base}`}>
            <ReadOnly value={mb(calc?.taxableValue)} />
          </Field>
          <Field label="IGST Rate"><ReadOnly value={pct(calc?.gst.igst_rate)} /></Field>
          <Field label="IGST Amount"><ReadOnly value={mb(calc?.gst.igst_amount)} /></Field>
          <Field label="CGST Rate"><ReadOnly value={pct(calc?.gst.cgst_rate)} /></Field>
          <Field label="CGST Amount"><ReadOnly value={mb(calc?.gst.cgst_amount)} /></Field>
          <Field label="SGST Rate"><ReadOnly value={pct(calc?.gst.sgst_rate)} /></Field>
          <Field label="SGST Amount"><ReadOnly value={mb(calc?.gst.sgst_amount)} /></Field>
          <Field label="CESS Rate"><ReadOnly value={pct(calc?.gst.cess_rate)} /></Field>
          <Field label="CESS Amount"><ReadOnly value={mb(calc?.gst.cess_amount)} /></Field>
        </div>
      </Section>
      <Section title="Tax And Charges">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
          <Field label="SGST %"><ReadOnly value={pct(calc?.sgst)} /></Field>
          <Field label="CGST %"><ReadOnly value={pct(calc?.cgst)} /></Field>
          <Field label="IGST %"><ReadOnly value={pct(calc?.igst)} /></Field>
          <Field label="SGST Amt"><ReadOnly value={pct(calc?.sgstAmt)} /></Field>
          <Field label="CGST Amt"><ReadOnly value={pct(calc?.cgstAmt)} /></Field>
          <Field label="IGST Amt"><ReadOnly value={pct(calc?.igstAmt)} /></Field>
        </div>
      </Section>
      <Section title="Warehouse and Accounting">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Target Warehouse" error={p("warehouse")}>
            <LinkInput type="warehouse" params={{ company: f.values.company }} value={row.warehouse} onChange={(x) => set({ warehouse: x })} disabled={!ed} error={p("warehouse")} />
          </Field>
          <Field label="Expense Account" error={p("expenseAccount")}>
            <LinkInput type="expenseAccount" params={{ company: f.values.company }} value={row.expenseAccount} onChange={(x) => set({ expenseAccount: x })} disabled={!ed} error={p("expenseAccount")} />
          </Field>
          <Field label="Cost Center" error={p("costCenter")}>
            <LinkInput type="costCenter" params={{ company: f.values.company }} value={row.costCenter} onChange={(x) => set({ costCenter: x })} disabled={!ed} error={p("costCenter")} />
          </Field>
        </div>
      </Section>
      <Section title="Item Weight Details" collapsible defaultOpen={false}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Weight Per Unit">
            <NumberInput value={row.weightPerUnit} onChange={(x) => set({ weightPerUnit: x })} disabled={!ed} />
          </Field>
          <Field label="Total Weight">
            <ReadOnly value={pct(calc?.totalWeight)} />
          </Field>
        </div>
      </Section>
      {f.doc.docStatus !== "Draft" && (
        <Section title="Billed, Received & Returned">
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <Field label="Received Qty"><ReadOnly value={pct(info?.receivedQty)} /></Field>
            <Field label={`Billed Amount ${cur}`}><ReadOnly value={m(info?.billedAmt)} /></Field>
          </div>
        </Section>
      )}
    </RowDialog>
  );
}

export function TaxRowForm({ index, t, onClose }: { index: number; t: Triggers; onClose: () => void }) {
  const f = useForm();
  const row = (f.values.taxes ?? [])[index];
  const calc = f.figures?.taxes[index];
  const ed = f.editable;
  const p = (k: string) => f.errors[`taxes.${index}.${k}`];
  const set = (x: Parameters<typeof f.setRow<"taxes">>[2]) => f.setRow("taxes", index, x);
  const m = (x: number | undefined) => (x == null ? "" : formatCurrency(x, f.money.doc));
  const previous = row.chargeType === "On Previous Row Amount" || row.chargeType === "On Previous Row Total";
  return (
    <RowDialog title={`Editing Row #${index + 1}`} onClose={onClose} actions={<RowActions table="taxes" index={index} onClose={onClose} />}>
      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Consider Tax or Charge for" required>
            <SelectInput value={row.category} options={TAX_CATEGORIES} onChange={(x) => x && set({ category: x })} disabled={!ed} />
          </Field>
          <Field label="Add or Deduct" required>
            <SelectInput value={row.addDeductTax} options={["Add", "Deduct"] as const} onChange={(x) => x && set({ addDeductTax: x })} disabled={!ed} />
          </Field>
          <Field label="Type" required error={p("chargeType")}>
            <SelectInput value={row.chargeType} options={CHARGE_TYPES} onChange={(x) => x && set({ chargeType: x, ...(x !== "On Previous Row Amount" && x !== "On Previous Row Total" ? { rowId: null } : {}) })} disabled={!ed} error={p("chargeType")} />
          </Field>
          {previous && (
            <Field label="Reference Row #" error={p("rowId")}>
              <NumberInput value={row.rowId ?? null} align="left" onChange={(x) => set({ rowId: x ? Math.trunc(x) : null })} disabled={!ed} error={p("rowId")} />
            </Field>
          )}
          <CheckInput label="Is this Tax included in Basic Rate?" checked={row.includedInPrintRate} onChange={(x) => set({ includedInPrintRate: x })} disabled={!ed} />
        </div>
      </Section>
      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Account Head" required error={p("accountHead")}>
            <LinkInput type="taxAccount" params={{ company: f.values.company }} value={row.accountHead} onChange={(x) => t.taxAccount(index, x)} disabled={!ed} error={p("accountHead")} />
          </Field>
          <Field label="Cost Center" error={p("costCenter")}>
            <LinkInput type="costCenter" params={{ company: f.values.company }} value={row.costCenter} onChange={(x) => set({ costCenter: x })} disabled={!ed} />
          </Field>
          <Field label="Description" required className="md:col-span-2">
            <TextArea value={row.description} onChange={(x) => set({ description: x })} disabled={!ed} rows={2} />
          </Field>
        </div>
      </Section>
      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Tax Rate">
            <NumberInput value={row.rate} onChange={(x) => set({ rate: x })} disabled={!ed || row.chargeType === "Actual"} />
          </Field>
          <Field label="GST Tax Type">
            <ReadOnly value={calc?.gstTaxType} />
          </Field>
          <Field label={`Amount (${f.money.doc.code})`}>
            {row.chargeType === "Actual" && ed ? <NumberInput value={row.taxAmount} trim={false} onChange={(x) => set({ taxAmount: x })} /> : <ReadOnly value={m(calc?.taxAmount)} />}
          </Field>
          <Field label={`Total (${f.money.doc.code})`}>
            <ReadOnly value={m(calc?.total)} />
          </Field>
          <Field label="Service Price">
            <ReadOnly value={row.servicePrice ? formatNumber(Number(row.servicePrice), Number.isInteger(Number(row.servicePrice)) ? 0 : 3) : ""} />
          </Field>
        </div>
      </Section>
    </RowDialog>
  );
}

export function OverheadRowForm({ index, t, onClose }: { index: number; t: Triggers; onClose: () => void }) {
  const f = useForm();
  const row = (f.values.costOverheads ?? [])[index];
  const ed = f.editable;
  const p = (k: string) => f.errors[`costOverheads.${index}.${k}`];
  return (
    <RowDialog title={`Editing Row #${index + 1}`} onClose={onClose} actions={<RowActions table="costOverheads" index={index} onClose={onClose} />}>
      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Service Item" error={p("serviceItem")}>
            <LinkInput type="serviceItem" value={row.serviceItem} onChange={(x) => t.serviceItem(index, x)} disabled={!ed} error={p("serviceItem")} />
          </Field>
          <Field label="Service Charges">
            <NumberInput value={row.serviceCharges ?? null} align="left" onChange={(x) => f.setRow("costOverheads", index, { serviceCharges: x })} onCommit={() => t.serviceCharges(index)} disabled={!ed} />
          </Field>
          <Field label="Account Head" error={p("accountHead")}>
            <LinkInput type="expenseAccount" params={{ company: f.values.company }} value={row.accountHead} onChange={(x) => f.setRow("costOverheads", index, { accountHead: x })} disabled={!ed} error={p("accountHead")} />
          </Field>
          <Field label="Charge Type">
            <TextInput value={row.chargeType} onChange={(x) => f.setRow("costOverheads", index, { chargeType: x })} disabled={!ed} />
          </Field>
        </div>
      </Section>
    </RowDialog>
  );
}

export function ScheduleRowForm({ index, t, onClose }: { index: number; t: Triggers; onClose: () => void }) {
  const f = useForm();
  const row = (f.values.paymentSchedule ?? [])[index];
  const calc = f.figures?.paymentSchedule[index];
  const ed = f.editable;
  const p = (k: string) => f.errors[`paymentSchedule.${index}.${k}`];
  const set = (x: Parameters<typeof f.setRow<"paymentSchedule">>[2]) => f.setRow("paymentSchedule", index, x);
  const m = (x: number | undefined) => (x == null ? "" : formatCurrency(x, f.money.doc));
  return (
    <RowDialog title={`Editing Row #${index + 1}`} onClose={onClose} actions={<RowActions table="paymentSchedule" index={index} onClose={onClose} />}>
      <Section>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Payment Term" error={p("paymentTerm")}>
            <LinkInput type="paymentTerm" value={row.paymentTerm} onChange={(x) => t.paymentTerm(index, x)} disabled={!ed} error={p("paymentTerm")} />
          </Field>
          <Field label="Due Date" required error={p("dueDate")}>
            <DateInput value={row.dueDate} onChange={(x) => set({ dueDate: x ?? "" })} disabled={!ed} error={p("dueDate")} />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <TextArea value={row.description} onChange={(x) => set({ description: x })} disabled={!ed} rows={2} />
          </Field>
          <Field label="Invoice Portion" error={p("invoicePortion")}>
            <NumberInput value={row.invoicePortion} onChange={(x) => set({ invoicePortion: x })} disabled={!ed} error={p("invoicePortion")} />
          </Field>
          <Field label="Mode of Payment">
            <TextInput value={row.modeOfPayment} onChange={(x) => set({ modeOfPayment: x })} disabled={!ed} />
          </Field>
          <Field label={`Payment Amount (${f.money.doc.code})`}>
            {Number(row.invoicePortion) ? <ReadOnly value={m(calc?.paymentAmount)} /> : <NumberInput value={row.paymentAmount} trim={false} onChange={(x) => set({ paymentAmount: x })} disabled={!ed} />}
          </Field>
          <Field label={`Outstanding (${f.money.doc.code})`}>
            <ReadOnly value={m(calc?.outstanding)} />
          </Field>
        </div>
      </Section>
      <Section title="Discount" collapsible defaultOpen={Boolean(row.discount)}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Discount Type">
            <SelectInput value={row.discountType} options={["Percentage", "Amount"] as const} onChange={(x) => set({ discountType: x })} disabled={!ed} />
          </Field>
          <Field label="Discount">
            <NumberInput value={row.discount} onChange={(x) => set({ discount: x })} disabled={!ed} />
          </Field>
          <Field label="Discount Date">
            <DateInput value={row.discountDate} onChange={(x) => set({ discountDate: x })} disabled={!ed} />
          </Field>
        </div>
      </Section>
    </RowDialog>
  );
}
