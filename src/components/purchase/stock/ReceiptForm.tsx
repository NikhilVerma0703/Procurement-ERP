"use client";

// The Purchase Receipt form, editable (Phase II, owner 21-11-2026): the old form exactly — the
// captured layout drawn by doc/DocumentForm — with its behaviour as the old form scripts had it
// (ERPNext's transaction.js, buying.js and purchase_receipt.js, India Compliance, the add-on's
// purchase_receipt.js), each fetching from the server what the original fetched:
//   supplier → its name, address, contact, currency, price list, Tax Category and GST template;
//   supplier address → its text, GSTIN, Tax Category and GST template; contact → its text;
//   company / billing / shipping address → their texts, the company GSTIN, place of supply;
//   Accepted / Rejected Warehouse (header) → every row's; Taxes template → its rows;
//   Terms → the terms text; currency → the exchange rate;
//   item → name, description, UOM and factor, Item Tax Template, warehouse, accounts, HSN;
//   Accepted Qty → Received (when nothing is rejected) and Rejected = Received − Accepted;
//   Received or Rejected Qty → Accepted = Received − Rejected; UOM → conversion factor;
//   price list rate / discount / margin → the rate;
//   services row's item → its account (a repeated service item is dropped), its charges → the
//   Actual tax row on that account (the add-on's services_charges).
// Every figure is recomputed live by stock/receipt-doc.ts — the same code the server runs on save,
// where the browser's numbers are thrown away and computed again.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  accountFetch, addressFetch, companyFetch, contactFetch, exchangeRateFetch, itemFetch, overheadTaxFetch, serviceItemFetch,
  supplierAddressFetch, supplierFetch, taxCategoryFetch, taxRowsFetch, termsFetch, uomFactorFetch,
} from "@/app/purchase/orders/fetches";
import { saveReceiptAction } from "@/app/purchase/receipts/actions";
import { DocumentForm, type FormBinding, type LookupSpec } from "@/components/purchase/doc/DocumentForm";
import { pricedRate } from "@/components/purchase/form/rows";
import { dependsOn } from "@/lib/purchase/doc/depends-on";
import type { DoctypeLayout, LayoutField } from "@/lib/purchase/doc/layout";
import { newRowName } from "@/lib/purchase/doc/store";
import { transactionLabels } from "@/lib/purchase/doc/transaction";
import type { ChildLayouts } from "@/lib/purchase/doc/visible";
import { receiptPath } from "@/lib/purchase/routes";
import { computeReceipt, num, rowsOf, type Doc, type DocRow, type ReceiptMasters } from "@/lib/purchase/stock/receipt-doc";
import { SITE_PRECISION } from "@/lib/purchase/calc/settings";
import { flt } from "@/lib/purchase/calc/pymath";

type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };
const got = <T,>(r: Fetched<T>): T | undefined => {
  if (!r.ok) {
    toast.error(r.error);
    return undefined;
  }
  return r.value;
};
const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

interface TaxRowValues {
  category?: string;
  addDeductTax?: string;
  chargeType: string;
  rowId?: number | null;
  accountHead: string;
  description?: string;
  rate?: number;
  taxAmount?: number;
  includedInPrintRate?: boolean;
  costCenter?: string | null;
  servicePrice?: number;
}
const taxRowOf = (t: TaxRowValues, i: number): DocRow => ({
  __islocal: 1, name: newRowName(), idx: i + 1, category: t.category ?? "Total", add_deduct_tax: t.addDeductTax ?? "Add",
  charge_type: t.chargeType, row_id: t.rowId ? String(t.rowId) : "", included_in_print_rate: t.includedInPrintRate ? 1 : 0,
  account_head: t.accountHead, description: t.description || t.accountHead, rate: t.rate ?? 0, tax_amount: t.taxAmount ?? 0,
  cost_center: t.costCenter ?? "", service_price: t.servicePrice ?? 0,
});

/** set_query of the receipt form's links (what each Link field searches, with its filters). */
function lookupOf(doc: Doc, table: string | null, f: LayoutField, row?: DocRow): LookupSpec | null {
  if (f.fieldtype !== "Link") return null;
  const company = str(doc.company);
  const supplier = str(doc.supplier);
  switch (`${table ?? ""}.${f.fieldname}`) {
    case ".supplier_address": return { type: "supplierAddress", params: { supplier } };
    case ".contact_person": return { type: "supplierContact", params: { supplier } };
    case ".shipping_address":
    case ".billing_address": return { type: "companyAddress", params: { company } };
    case "items.uom": return { type: "uom", params: { item: str(row?.item_code) } };
    case "items.expense_account":
    case "items.provisional_expense_account": return { type: "expenseAccount", params: { company } };
    case "items.batch_no": return { type: "batch", params: { item: str(row?.item_code) } };
    case "services_items.service_item": return { type: "serviceItem" };
    case "services_items.account_head":
    case "taxes.account_head": return { type: "taxAccount", params: { company } };
    case ".gate_entry": return { type: "gateEntry", params: { supplier } };
  }
  switch (f.options) {
    case "Supplier": return { type: "supplier" };
    case "Item": return { type: "item" };
    case "Warehouse": return { type: "warehouse", params: { company } };
    case "Cost Center": return { type: "costCenter", params: { company } };
    case "Company": return { type: "company" };
    case "Currency": return { type: "currency" };
    case "Price List": return { type: "priceList" };
    case "Purchase Taxes and Charges Template": return { type: "taxTemplate", params: { company } };
    case "Tax Category": return { type: "taxCategory" };
    case "Terms and Conditions": return { type: "termsTemplate" };
    case "Letter Head": return { type: "letterHead" };
    case "Item Tax Template": return { type: "itemTaxTemplate" };
    case "UOM": return { type: "uom" };
    case "Purchase Order": return { type: "purchaseOrder", params: { supplier } };
    case "Gate Entry": return { type: "gateEntry", params: { supplier } };
    default: return null;
  }
}

export function ReceiptForm({ id, initial, modified, layout, childLayouts, masters, companyCurrency }: {
  /** The saved receipt's id; null for a new one. */
  id: string | null;
  initial: Doc;
  modified: string | null;
  layout: DoctypeLayout;
  childLayouts: ChildLayouts;
  masters: ReceiptMasters;
  companyCurrency: string;
}) {
  const router = useRouter();
  const recompute = useCallback((d: Doc) => computeReceipt(d, masters).doc, [masters]);
  const [doc, setDocState] = useState<Doc>(() => recompute(initial));
  const docRef = useRef(doc);
  const [dirty, setDirty] = useState(!id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();
  const modifiedRef = useRef(modified);

  /** Apply a change to the latest document, then recompute every figure (the form's calculate_taxes_and_totals). */
  const update = useCallback((fn: (d: Doc) => Doc) => {
    const next = recompute(fn(docRef.current));
    docRef.current = next;
    setDocState(next);
    setDirty(true);
  }, [recompute]);
  const patch = useCallback((p: Doc) => update((d) => ({ ...d, ...p })), [update]);
  const patchRow = useCallback((table: string, i: number, p: DocRow) =>
    update((d) => ({ ...d, [table]: rowsOf(d[table]).map((r, k) => (k === i ? { ...r, ...p } : r)) })), [update]);
  const now = () => docRef.current;

  const party = () => {
    const d = now();
    return { company: str(d.company), companyGstin: str(d.company_gstin) || null, placeOfSupply: str(d.place_of_supply) || null, isReverseCharge: Boolean(num(d.is_reverse_charge)) };
  };
  const applyPartyTaxes = (t: { taxesAndCharges: string | null; taxes: TaxRowValues[] | null } | undefined) => {
    if (!t || t.taxes === null || t.taxes === undefined) return;
    patch({ taxes_and_charges: t.taxesAndCharges ?? "", taxes: t.taxes.map(taxRowOf) });
  };
  const exchangeRate = async (currency: string) => {
    if (currency === companyCurrency) return patch({ conversion_rate: 1 });
    const rate = got(await exchangeRateFetch(currency, companyCurrency, str(now().posting_date)));
    if (rate) patch({ conversion_rate: rate });
    else if (rate === null) toast.error(`Unable to find exchange rate for ${currency} to ${companyCurrency}. Please create a Currency Exchange record manually`);
  };
  const itemTemplatesFor = async (taxCategory: string | null) => {
    const d = now();
    const r = got(await taxCategoryFetch(taxCategory, rowsOf(d.items).map((i) => ({ itemCode: str(i.item_code) })), {
      company: str(d.company), transactionDate: str(d.posting_date), setWarehouse: str(d.set_warehouse) || null, conversionRate: num(d.conversion_rate) || 1,
    }));
    if (!r) return null;
    update((x) => ({ ...x, items: rowsOf(x.items).map((it, i) => (it.item_code ? { ...it, item_tax_template: r.itemTemplates[i] ?? "" } : it)) }));
    return r;
  };

  const triggers: Record<string, (v: unknown) => Promise<void> | void> = {
    async supplier(v) {
      const code = str(v);
      if (!code) return patch({ supplier_name: "" });
      const before = now();
      const s = got(await supplierFetch(code, { ...party(), currentPriceList: str(before.buying_price_list) || null }));
      if (!s) return;
      patch({
        supplier_name: s.supplierName, supplier_address: s.address?.code ?? "", address_display: s.address?.display ?? "",
        supplier_gstin: s.address?.gstin ?? "", gst_category: s.gstCategory ?? "", contact_person: s.contact?.code ?? "",
        contact_display: s.contact?.display ?? "", contact_mobile: s.contact?.mobile ?? "", contact_email: s.contact?.email ?? "",
        buying_price_list: s.buyingPriceList ?? "", price_list_currency: s.priceListCurrency ?? "", tax_category: s.taxCategory ?? "",
      });
      applyPartyTaxes(s.taxes as never);
      if (s.currency !== str(before.currency)) {
        patch({ currency: s.currency });
        await exchangeRate(s.currency);
      }
      if ((s.taxCategory ?? "") !== str(before.tax_category)) await itemTemplatesFor(s.taxCategory);
    },
    async supplier_address(v) {
      const code = str(v);
      if (!code) return patch({ address_display: "", supplier_gstin: "" });
      const r = got(await supplierAddressFetch(code, str(now().supplier), party()));
      if (!r) return;
      const before = str(now().tax_category);
      patch({ address_display: r.address.display, supplier_gstin: r.address.gstin ?? "", gst_category: r.address.gstCategory ?? str(now().gst_category), tax_category: r.taxCategory ?? "" });
      applyPartyTaxes(r.taxes as never);
      if ((r.taxCategory ?? "") !== before) await itemTemplatesFor(r.taxCategory);
    },
    async contact_person(v) {
      const code = str(v);
      if (!code) return patch({ contact_display: "", contact_mobile: "", contact_email: "" });
      const c = got(await contactFetch(code));
      if (c) patch({ contact_display: c.display ?? "", contact_mobile: c.mobile ?? "", contact_email: c.email ?? "" });
    },
    async shipping_address(v) {
      const code = str(v);
      if (!code) return patch({ shipping_address_display: "" });
      const a = got(await addressFetch(code));
      if (a) patch({ shipping_address_display: a.display });
    },
    async billing_address(v) {
      const code = str(v);
      if (!code) return patch({ billing_address_display: "", company_gstin: "" });
      const a = got(await addressFetch(code));
      if (!a) return;
      patch({ billing_address_display: a.display, company_gstin: a.gstin ?? "", ...(a.gstStateNumber && a.gstState ? { place_of_supply: `${a.gstStateNumber}-${a.gstState}` } : {}) });
    },
    async company(v) {
      const code = str(v);
      if (!code) return;
      const c = got(await companyFetch(code));
      if (!c) return;
      patch({
        billing_address: c.billingAddress?.code ?? "", billing_address_display: c.billingAddress?.display ?? "",
        shipping_address: c.shippingAddress?.code ?? "", shipping_address_display: c.shippingAddress?.display ?? "",
        company_gstin: c.billingAddress?.gstin ?? "", place_of_supply: c.placeOfSupply ?? "", ...(c.letterHead ? { letter_head: c.letterHead } : {}),
      });
    },
    async currency(v) {
      if (str(v)) await exchangeRate(str(v));
    },
    set_warehouse(v) {
      update((d) => ({ ...d, items: rowsOf(d.items).map((r) => ({ ...r, warehouse: str(v) })) }));
    },
    rejected_warehouse(v) {
      update((d) => ({ ...d, items: rowsOf(d.items).map((r) => ({ ...r, rejected_warehouse: str(v) })) }));
    },
    async taxes_and_charges(v) {
      const template = str(v);
      if (!template) return;
      const rows = got(await taxRowsFetch(template));
      if (rows) patch({ taxes: (rows as TaxRowValues[]).map(taxRowOf) });
    },
    async tax_category(v) {
      const r = await itemTemplatesFor(str(v) || null);
      if (r?.taxesAndCharges && r.taxes) patch({ taxes_and_charges: r.taxesAndCharges, taxes: (r.taxes as TaxRowValues[]).map(taxRowOf) });
    },
    async tc_name(v) {
      if (!str(v)) return;
      const html = got(await termsFetch(str(v)));
      if (html !== undefined) patch({ terms: html ?? "" });
    },
    additional_discount_percentage() {
      patch({ discount_amount: 0 });
    },
    discount_amount() {
      patch({ additional_discount_percentage: 0 });
    },
  };

  const fp = SITE_PRECISION.float;
  const rowTriggers: Record<string, (i: number, v: unknown) => Promise<void> | void> = {
    async "items.item_code"(i, v) {
      const code = str(v);
      if (!code) return;
      const d = now();
      const r = got(await itemFetch(code, { company: str(d.company), taxCategory: str(d.tax_category) || null, transactionDate: str(d.posting_date), setWarehouse: str(d.set_warehouse) || null, conversionRate: num(d.conversion_rate) || 1 }));
      if (!r) return;
      if (r.refusal) {
        toast.error(r.refusal);
        return patchRow("items", i, { item_code: "" });
      }
      const row = rowsOf(now().items)[i] ?? {};
      const qty = num(row.qty) || 1;
      patchRow("items", i, {
        item_name: r.itemName, description: r.description, uom: r.uom, stock_uom: r.stockUom, conversion_factor: r.conversionFactor,
        item_tax_template: r.itemTaxTemplate ?? "", warehouse: r.warehouse ?? str(now().set_warehouse), expense_account: r.expenseAccount ?? "",
        cost_center: r.costCenter ?? "", weight_per_unit: r.weightPerUnit, gst_hsn_code: r.gstHsnCode ?? "", qty, received_qty: flt(qty + num(row.rejected_qty), fp),
      });
    },
    "items.qty"(i) {
      const r = rowsOf(now().items)[i];
      if (!r) return;
      const received = !num(r.rejected_qty) && num(r.qty) ? num(r.qty) : num(r.received_qty);
      patchRow("items", i, { received_qty: received, rejected_qty: flt(received - num(r.qty), fp) });
    },
    "items.received_qty"(i) {
      const r = rowsOf(now().items)[i];
      if (r) patchRow("items", i, { qty: flt(num(r.received_qty) - num(r.rejected_qty), fp) });
    },
    "items.rejected_qty"(i) {
      const r = rowsOf(now().items)[i];
      if (r) patchRow("items", i, { qty: flt(num(r.received_qty) - num(r.rejected_qty), fp) });
    },
    async "items.uom"(i, v) {
      const r = rowsOf(now().items)[i];
      if (!r || !str(v) || !str(r.item_code)) return;
      const factor = got(await uomFactorFetch(str(r.item_code), str(v)));
      if (factor) patchRow("items", i, { conversion_factor: factor });
    },
    ...Object.fromEntries(["price_list_rate", "discount_percentage", "discount_amount", "margin_type", "margin_rate_or_amount"].map((f) => [
      `items.${f}`,
      (i: number) => {
        const r = rowsOf(now().items)[i];
        if (!r) return;
        const next = { ...r };
        if (f === "discount_percentage") next.discount_amount = 0;
        if (f === "discount_amount") next.discount_percentage = 0;
        if (f === "margin_type" && !str(r.margin_type)) next.margin_rate_or_amount = 0;
        const p = pricedRate({
          priceListRate: num(next.price_list_rate), marginType: (str(next.margin_type) || null) as "Percentage" | "Amount" | null,
          marginRateOrAmount: num(next.margin_rate_or_amount), discountPercentage: num(next.discount_percentage), discountAmount: num(next.discount_amount),
        });
        patchRow("items", i, { ...next, rate: p.rate, discount_amount: p.discountAmount, discount_percentage: p.discountPercentage });
      },
    ])),
    async "taxes.account_head"(i, v) {
      if (!str(v)) return;
      const a = got(await accountFetch(str(v)));
      if (!a) return;
      const row = rowsOf(now().taxes)[i];
      patchRow("taxes", i, { description: a.description, ...(str(row?.charge_type) !== "Actual" ? { rate: a.taxRate } : {}) });
    },
    async "services_items.service_item"(i, v) {
      const code = str(v);
      const rows = rowsOf(now().services_items);
      if (code && rows.some((r, k) => k !== i && str(r.service_item) === code)) {
        update((d) => ({ ...d, services_items: rowsOf(d.services_items).filter((_, k) => k !== i) }));
        return;
      }
      if (!code) return;
      const r = got(await serviceItemFetch(code, str(now().company)));
      if (r?.accountHead) patchRow("services_items", i, { account_head: r.accountHead });
    },
    async "services_items.service_charges"(i) {
      const d = now();
      const row = rowsOf(d.services_items)[i];
      if (!row || !str(row.account_head)) return;
      const t = got(await overheadTaxFetch(
        rowsOf(d.services_items).map((r) => ({ serviceItem: str(r.service_item) || null, serviceCharges: num(r.service_charges), accountHead: str(r.account_head) || null })),
        str(row.account_head),
        str(d.company),
      ));
      if (!t) return;
      update((x) => {
        const kept = rowsOf(x.taxes).filter((tax) => !(str(tax.account_head) === str(row.account_head) && str(tax.charge_type) === (str(row.charge_type) || "Actual")));
        return {
          ...x,
          taxes: [...kept, taxRowOf({ category: "Total", addDeductTax: "Add", chargeType: "Actual", accountHead: t.accountHead, description: t.description, rate: 0, taxAmount: t.taxAmount, servicePrice: num(row.service_charges) }, kept.length)]
            .map((tax, k) => ({ ...tax, idx: k + 1 })),
        };
      });
    },
  };

  const editable = (table: string | null, f: LayoutField, row?: DocRow) => {
    const d = docRef.current;
    if (num(d.docstatus) !== 0) return false;
    if (f.readOnly || f.fieldtype === "Read Only") return false;
    if (f.readOnlyDependsOn && dependsOn(f.readOnlyDependsOn, { doc: row ?? d, parent: d })) return false;
    if (table === null && (f.fieldname === "posting_date" || f.fieldname === "posting_time")) return Boolean(num(d.set_posting_time));
    if (table === null && f.fieldname === "naming_series") return Boolean(d.__islocal);
    // taxes.js set_conditional_mandatory_rate_or_amount: an Actual row takes its amount, any other its rate.
    if (table === "taxes" && f.fieldname === "tax_amount") return str(row?.charge_type) === "Actual";
    if (table === "taxes" && f.fieldname === "rate") return str(row?.charge_type) !== "Actual";
    return true;
  };

  const binding: FormBinding = {
    editable,
    lookup: (table, f, row) => lookupOf(docRef.current, table, f, row),
    setField: (fieldname, value) => {
      patch({ [fieldname]: value });
      setErrors((e) => {
        const { [fieldname]: _gone, ...rest } = e;
        void _gone;
        return rest;
      });
      void triggers[fieldname]?.(value);
    },
    setCell: (table, index, fieldname, value) => {
      patchRow(table, index, { [fieldname]: value });
      void rowTriggers[`${table}.${fieldname}`]?.(index, value);
    },
    addRow: (table) => update((d) => {
      const rows = rowsOf(d[table]);
      const base: DocRow = { __islocal: 1, name: newRowName(), idx: rows.length + 1 };
      const row: DocRow =
        table === "items" ? { ...base, qty: 0, received_qty: 0, rejected_qty: 0, conversion_factor: 1, warehouse: str(d.set_warehouse), rejected_warehouse: str(d.rejected_warehouse) }
          : table === "taxes" ? { ...base, category: "Total", add_deduct_tax: "Add", charge_type: "", rate: 0, tax_amount: 0 }
            : table === "services_items" ? { ...base, charge_type: "Actual" }
              : base;
      return { ...d, [table]: [...rows, row] };
    }),
    deleteRows: (table, indexes) => update((d) => ({ ...d, [table]: rowsOf(d[table]).filter((_, i) => !indexes.includes(i)).map((r, i) => ({ ...r, idx: i + 1 })) })),
    errors,
  };

  const save = () =>
    startSaving(async () => {
      const r = await saveReceiptAction({ id, doc: docRef.current, modified: modifiedRef.current });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      setErrors({});
      setDirty(false);
      modifiedRef.current = r.value.modified;
      toast.success("Saved");
      if (!id) router.replace(receiptPath(r.value.id));
      else router.refresh();
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const labels = transactionLabels(doc, companyCurrency);
  return (
    <section className="po-card">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 sm:px-5">
        <span className={dirty ? "rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700" : "rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"}>
          {dirty ? "Not Saved" : "Draft"}
        </span>
        <button type="button" className="po-btn-primary px-4 py-1.5 text-[13px]" disabled={saving} onClick={save} title="Save (Ctrl+S)">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <DocumentForm
        layout={layout}
        childLayouts={childLayouts}
        doc={doc}
        binding={binding}
        options={{ currency: str(doc.currency) || companyCurrency, label: labels.label, hidden: labels.hidden }}
      />
    </section>
  );
}
