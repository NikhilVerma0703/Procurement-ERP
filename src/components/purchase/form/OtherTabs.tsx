"use client";

// The PO form's other tabs, as on the old form: Address & Contact, Drop Ship,
// Terms, More Info (Auto Repeat left out: unused, plan §5) and Connections.
import Link from "next/link";
import { useState } from "react";
import { addressLines } from "@/lib/purchase/address";
import { formatCurrency, formatDate } from "@/lib/purchase/format";
import { PLACES_OF_SUPPLY } from "@/lib/purchase/orders/options";
import { useForm } from "./context";
import { CheckInput, DateInput, Field, LinkInput, NumberInput, ReadOnly, Section, SelectInput, TextInput } from "./controls";
import { Grid } from "./Grid";
import { HtmlEditor } from "./HtmlEditor";
import { ScheduleRowForm } from "./RowForms";
import { emptyScheduleRow } from "./rows";
import type { Triggers } from "./triggers";

const shownAddress = (display: string | null | undefined) => addressLines(display).join("\n");

export function AddressTab({ t }: { t: Triggers }) {
  const f = useForm();
  const { values: v, displays: d, errors: e, editable: ed } = f;
  return (
    <>
      <Section title="Supplier Address">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="Supplier Address" error={e.supplierAddress}>
              <LinkInput type="supplierAddress" params={{ supplier: v.supplier }} value={v.supplierAddress} onChange={t.supplierAddress} disabled={!ed} error={e.supplierAddress} />
            </Field>
            <Field label="Supplier Address Details">
              <ReadOnly value={shownAddress(d.addressDisplay)} multiline className="min-h-[90px]" />
            </Field>
            <Field label="Supplier GSTIN">
              <ReadOnly value={d.supplierGstin} />
            </Field>
            <Field label="GST Category">
              <ReadOnly value={d.gstCategory} />
            </Field>
          </div>
          <div className="space-y-3">
            <Field label="Supplier Contact" error={e.contactPerson}>
              <LinkInput type="supplierContact" params={{ supplier: v.supplier }} value={v.contactPerson} onChange={t.contactPerson} disabled={!ed} error={e.contactPerson} />
            </Field>
            {v.contactPerson && (
              <>
                <Field label="Contact Name"><ReadOnly value={d.contactDisplay} /></Field>
                <Field label="Contact Mobile No"><ReadOnly value={d.contactMobile} /></Field>
                <Field label="Contact Email"><ReadOnly value={d.contactEmail} /></Field>
              </>
            )}
          </div>
        </div>
      </Section>
      <Section title="Shipping Address">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Shipping Address" error={e.shippingAddress}>
            <LinkInput type="companyAddress" params={{ company: v.company }} value={v.shippingAddress} onChange={t.shippingAddress} disabled={!ed} error={e.shippingAddress} />
          </Field>
          <Field label="Shipping Address Details">
            <ReadOnly value={shownAddress(d.shippingAddressDisplay)} multiline className="min-h-[90px]" />
          </Field>
        </div>
      </Section>
      <Section title="Company Billing Address">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="Company Billing Address" error={e.billingAddress}>
              <LinkInput type="companyAddress" params={{ company: v.company }} value={v.billingAddress} onChange={t.billingAddress} disabled={!ed} error={e.billingAddress} />
            </Field>
            <Field label="Company GSTIN">
              <ReadOnly value={d.companyGstin} />
            </Field>
            <Field label="Place of Supply" error={e.placeOfSupply}>
              <SelectInput value={v.placeOfSupply} options={PLACES_OF_SUPPLY} blank onChange={(x) => f.set("placeOfSupply", x)} disabled={!ed} error={e.placeOfSupply} />
            </Field>
          </div>
          <Field label="Billing Address Details">
            <ReadOnly value={shownAddress(d.billingAddressDisplay)} multiline className="min-h-[90px]" />
          </Field>
        </div>
      </Section>
    </>
  );
}

export function DropShipTab({ t }: { t: Triggers }) {
  const { values: v, displays: d, errors: e, editable: ed } = useForm();
  return (
    <Section>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Customer" error={e.customer}>
            <LinkInput type="customer" value={v.customer} onChange={t.customer} disabled={!ed} error={e.customer} />
          </Field>
          <Field label="Customer Name">
            <ReadOnly value={d.customerName} />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Customer Contact" error={e.customerContactPerson}>
            <LinkInput type="customerContact" params={{ customer: v.customer }} value={v.customerContactPerson} onChange={t.customerContact} disabled={!ed || !v.customer} error={e.customerContactPerson} />
          </Field>
          {v.customerContactPerson && (
            <>
              <Field label="Customer Contact"><ReadOnly value={d.customerContactDisplay} /></Field>
              <Field label="Customer Mobile No"><ReadOnly value={d.customerContactMobile} /></Field>
              <Field label="Customer Contact Email"><ReadOnly value={d.customerContactEmail} /></Field>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

export function TermsTab({ t }: { t: Triggers }) {
  const f = useForm();
  const { values: v, errors: e, editable: ed } = f;
  const [row, setRow] = useState<number | null>(null);
  const m = (x: number | undefined) => (x == null ? "" : formatCurrency(x, f.money.doc));
  return (
    <>
      <Section title="Payment Terms">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Payment Terms Template" error={e.paymentTermsTemplate}>
            <LinkInput type="paymentTermsTemplate" value={v.paymentTermsTemplate} onChange={t.paymentTermsTemplate} disabled={!ed} error={e.paymentTermsTemplate} />
          </Field>
        </div>
        <div className="mt-4">
          {e.paymentSchedule && <p className="mb-2 text-xs text-red-600">{e.paymentSchedule}</p>}
          <Grid
            label="Payment Schedule"
            rows={v.paymentSchedule ?? []}
            editable={ed}
            rowError={(i) => Object.keys(e).some((k) => k.startsWith(`paymentSchedule.${i}.`))}
            onAdd={() => f.addRow("paymentSchedule", emptyScheduleRow())}
            onDelete={(rows) => f.removeRows("paymentSchedule", rows)}
            onEdit={setRow}
            columns={[
              { key: "term", label: "Payment Term", width: "min-w-[160px]", cell: (r, i) => <LinkInput type="paymentTerm" value={r.paymentTerm} onChange={(x) => t.paymentTerm(i, x)} disabled={!ed} /> },
              { key: "desc", label: "Description", width: "min-w-[140px]", cell: (r, i) => <TextInput value={r.description} onChange={(x) => f.setRow("paymentSchedule", i, { description: x })} disabled={!ed} /> },
              { key: "due", label: "Due Date", required: true, width: "w-36", cell: (r, i) => <DateInput value={r.dueDate} onChange={(x) => f.setRow("paymentSchedule", i, { dueDate: x ?? "" })} disabled={!ed} error={e[`paymentSchedule.${i}.dueDate`]} /> },
              { key: "portion", label: "Invoice Portion", align: "right", width: "w-32", cell: (r, i) => <NumberInput value={r.invoicePortion} onChange={(x) => f.setRow("paymentSchedule", i, { invoicePortion: x })} disabled={!ed} error={e[`paymentSchedule.${i}.invoicePortion`]} /> },
              {
                key: "amount", label: `Payment Amount (${f.money.doc.code})`, align: "right", width: "w-40", cell: (r, i) =>
                  Number(r.invoicePortion) || !ed ? (
                    <div className="px-2 py-1 text-right text-gray-900">{m(f.figures?.paymentSchedule[i]?.paymentAmount)}</div>
                  ) : (
                    <NumberInput value={r.paymentAmount} trim={false} onChange={(x) => f.setRow("paymentSchedule", i, { paymentAmount: x })} />
                  ),
              },
            ]}
          />
        </div>
      </Section>
      <Section title="Terms & Conditions">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Terms" error={e.termsTemplate}>
            <LinkInput type="termsTemplate" value={v.termsTemplate} onChange={t.termsTemplate} disabled={!ed} error={e.termsTemplate} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Terms and Conditions">
            <HtmlEditor value={v.terms ?? ""} onChange={(x) => f.set("terms", x)} disabled={!ed} />
          </Field>
        </div>
      </Section>
      {row !== null && v.paymentSchedule?.[row] && <ScheduleRowForm index={row} t={t} onClose={() => setRow(null)} />}
    </>
  );
}

export function MoreInfoTab() {
  const f = useForm();
  const { values: v, doc, errors: e } = f;
  const print = f.editable || f.updatable;
  return (
    <>
      <Section title="Order Status" collapsible defaultOpen={false}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
          <Field label="Status"><ReadOnly value={doc.status} /></Field>
          <Field label="% Billed"><ReadOnly value={`${doc.perBilled.toFixed(2)}`} /></Field>
          <Field label="% Received"><ReadOnly value={`${doc.perReceived.toFixed(2)}`} /></Field>
        </div>
      </Section>
      <Section title="Printing Settings" collapsible defaultOpen={false}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <Field label="Letter Head" error={e.letterHead}>
            <LinkInput type="letterHead" value={v.letterHead} onChange={(x) => f.set("letterHead", x)} disabled={!print} error={e.letterHead} />
          </Field>
          <Field label="Print Heading">
            <TextInput value={v.selectPrintHeading} onChange={(x) => f.set("selectPrintHeading", x || null)} disabled={!print} />
          </Field>
          <CheckInput label="Group same items" checked={v.groupSameItems} onChange={(x) => f.set("groupSameItems", x)} disabled={!print} />
          <Field label="Print Language">
            <TextInput value={v.language} onChange={(x) => f.set("language", x || null)} disabled={!f.editable} />
          </Field>
        </div>
      </Section>
      <Section title="Additional Info" collapsible defaultOpen={false}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <CheckInput label="Is Internal Supplier" checked={false} onChange={() => undefined} disabled />
          {doc.amendedFrom && (
            <Field label="Amended From">
              <ReadOnly value={doc.amendedFrom.number} />
            </Field>
          )}
        </div>
      </Section>
    </>
  );
}

/** The old form's Connections groups; a count shows where documents exist. */
const GROUPS: [string, string[]][] = [
  ["Related", ["Purchase Receipt", "Purchase Invoice"]],
  ["Payment", ["Payment Entry", "Journal Entry", "Payment Request"]],
  ["Reference", ["Supplier Quotation", "Project", "Auto Repeat"]],
  ["Manufacturing", ["Material Request", "BOM", "Production Plan", "Blanket Order"]],
  ["Sub-contracting", ["Subcontracting Order", "Stock Entry"]],
  ["Internal", ["Proforma Invoice"]],
];

export function ConnectionsTab() {
  const { doc } = useForm();
  const by = new Map<string, typeof doc.links>();
  for (const l of doc.links) by.set(l.docType, [...(by.get(l.docType) ?? []), l]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map(([group, types]) => (
          <div key={group}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</h4>
            <ul className="space-y-1.5">
              {types.map((type) => {
                const list = by.get(type) ?? [];
                return (
                  <li key={type}>
                    <button type="button" className="flex w-full items-center gap-2 text-left text-[13px] text-gray-800 disabled:cursor-default" disabled={!list.length} onClick={() => setOpen(open === type ? null : type)}>
                      {list.length > 0 && <span className="rounded-full bg-gray-100 px-1.5 text-[11px] font-medium text-gray-700">{list.length}</span>}
                      <span className={list.length ? "font-medium" : "text-gray-500"}>{type}</span>
                    </button>
                    {open === type && (
                      <ul className="mt-1 space-y-0.5 border-l border-gray-200 pl-3 text-[12px] text-gray-600">
                        {list.map((l) => (
                          <li key={l.docName}>
                            {l.docName} · {formatDate(l.docDate)} · {l.docStatus}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {doc.amendedFrom && (
        <p className="mt-4 text-xs text-gray-500">
          Amended from <Link className="font-medium text-brand-700 hover:underline" href={`/purchase/orders/${encodeURIComponent(doc.amendedFrom.id)}`}>{doc.amendedFrom.number}</Link>
        </p>
      )}
    </Section>
  );
}

