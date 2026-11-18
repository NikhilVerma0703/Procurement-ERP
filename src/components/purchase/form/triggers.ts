"use client";

// What happens when a PO field changes — the old form's triggers (ERPNext's
// transaction.js, buying.js and purchase_order.js, India Compliance, the
// add-on), each fetching from the server what the original fetched:
//   supplier → address, contact, currency, price list, payment terms, Tax
//     Category and the GST template it implies;
//   supplier address → its texts, Tax Category and GST template;
//   Required By (header) → copied into the rows that have none;
//   item → name, description, UOM and factor, Item Tax Template, warehouse,
//     accounts, weight; price list rate / discount / margin → the rate
//     (apply_pricing_rule_on_item); UOM → conversion factor;
//   currency or date → exchange rate; Tax Category → its template and the
//     items' Item Tax Templates; template → its tax rows; account → row text;
//   Cost Overhead item → its account; its charge → the Actual GST tax row;
//   Payment Terms Template → the schedule; Terms → the terms text.
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  accountFetch, addressFetch, companyFetch, contactFetch, customerFetch, exchangeRateFetch, itemFetch, overheadTaxFetch,
  paymentScheduleFetch, paymentTermFetch, priceListFetch, serviceItemFetch, supplierAddressFetch, supplierFetch,
  taxCategoryFetch, taxRowsFetch, termsFetch, uomFactorFetch,
} from "@/app/purchase/orders/fetches";
import type { ItemRowValues, OrderFormValues } from "@/lib/purchase/orders/form-schema";
import type { FormCtx } from "./context";
import { pricedRate } from "./rows";
import { toDmy } from "./controls";

type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };
const got = <T,>(r: Fetched<T>): T | undefined => {
  if (!r.ok) {
    toast.error(r.error);
    return undefined;
  }
  return r.value;
};

export type Triggers = ReturnType<typeof useTriggers>;

export function useTriggers(f: FormCtx) {
  const ref = useRef(f);
  ref.current = f;
  /** The supplier's tax withholding category, for Apply Tax Withholding Amount. */
  const supplierTds = useRef<string | null>(null);

  return useMemo(() => {
    const now = () => ref.current;
    const party = () => {
      const { values: v, displays: d } = now();
      return { company: v.company, companyGstin: d.companyGstin, placeOfSupply: v.placeOfSupply ?? null, isReverseCharge: Boolean(v.isReverseCharge) };
    };
    const companyCurrency = () => now().masters.engine.companyCurrency;

    async function exchangeRate(currency: string, date: string) {
      const company = companyCurrency();
      if (currency === company) {
        now().set("conversionRate", 1);
        return;
      }
      const rate = got(await exchangeRateFetch(currency, company, date));
      if (rate) now().set("conversionRate", rate);
      else if (rate === null) toast.error(`Unable to find exchange rate for ${currency} to ${company} for key date ${toDmy(date)}. Please create a Currency Exchange record manually`);
    }

    async function priceListCurrency(priceList: string | null) {
      const company = companyCurrency();
      if (!priceList) return;
      const pl = got(await priceListFetch(priceList));
      if (!pl) return;
      now().setDisplays({ priceListCurrency: pl.currency });
      const v = now().values;
      if (pl.currency === company) now().set("plcConversionRate", 1);
      else if (pl.currency === v.currency) now().set("plcConversionRate", Number(v.conversionRate) || 1);
      else {
        const rate = got(await exchangeRateFetch(pl.currency, company, v.transactionDate));
        if (rate) now().set("plcConversionRate", rate);
      }
    }

    async function refreshItemTaxTemplates(taxCategory: string | null) {
      const v = now().values;
      const r = got(await taxCategoryFetch(taxCategory, v.items.map((i) => ({ itemCode: i.itemCode ?? "" })), { company: v.company, transactionDate: v.transactionDate, setWarehouse: v.setWarehouse ?? null, conversionRate: Number(v.conversionRate) || 1 }));
      if (!r) return null;
      r.itemTemplates.forEach((t, i) => {
        if (now().values.items[i]?.itemCode) now().setRow("items", i, { itemTaxTemplate: t });
      });
      return r;
    }

    function applyPartyTaxes(t: { taxesAndCharges: string | null; taxes: OrderFormValues["taxes"] | null }) {
      if (t.taxes === null || t.taxes === undefined) return;
      now().patch({ taxesAndCharges: t.taxesAndCharges || null, taxes: t.taxes });
    }

    return {
      async supplier(code: string | null) {
        now().set("supplier", code ?? "");
        if (!code) {
          now().setDisplays({ supplierName: null });
          return;
        }
        const before = now().values;
        const s = got(await supplierFetch(code, { ...party(), currentPriceList: before.buyingPriceList ?? null }));
        if (!s) return;
        now().patch({
          supplierAddress: s.address?.code ?? null,
          contactPerson: s.contact?.code ?? null,
          buyingPriceList: s.buyingPriceList,
          taxCategory: s.taxCategory,
          ...(s.paymentTermsTemplate ? { paymentTermsTemplate: s.paymentTermsTemplate } : {}),
          ...(before.applyTds ? { taxWithholdingCategory: s.taxWithholdingCategory } : {}),
        });
        now().setDisplays({
          supplierName: s.supplierName,
          addressDisplay: s.address?.display ?? null,
          supplierGstin: s.address?.gstin ?? null,
          gstCategory: s.gstCategory,
          contactDisplay: s.contact?.display ?? null,
          contactMobile: s.contact?.mobile ?? null,
          contactEmail: s.contact?.email ?? null,
          priceListCurrency: s.priceListCurrency,
        });
        supplierTds.current = s.taxWithholdingCategory;
        applyPartyTaxes(s.taxes);
        if (s.currency !== before.currency) {
          now().set("currency", s.currency);
          await exchangeRate(s.currency, before.transactionDate);
        }
        if (s.buyingPriceList !== before.buyingPriceList) await priceListCurrency(s.buyingPriceList);
        if (s.paymentTermsTemplate && s.paymentTermsTemplate !== before.paymentTermsTemplate) {
          const rows = got(await paymentScheduleFetch(s.paymentTermsTemplate, before.transactionDate));
          if (rows) now().replaceRows("paymentSchedule", rows);
        }
        if (s.taxCategory !== before.taxCategory) await refreshItemTaxTemplates(s.taxCategory);
      },

      async supplierAddress(code: string | null) {
        now().set("supplierAddress", code);
        if (!code) {
          now().setDisplays({ addressDisplay: null, supplierGstin: null });
          return;
        }
        const r = got(await supplierAddressFetch(code, now().values.supplier, party()));
        if (!r) return;
        now().setDisplays({ addressDisplay: r.address.display, supplierGstin: r.address.gstin, gstCategory: r.address.gstCategory ?? now().displays.gstCategory });
        const before = now().values.taxCategory;
        now().set("taxCategory", r.taxCategory);
        applyPartyTaxes(r.taxes);
        if (r.taxCategory !== before) await refreshItemTaxTemplates(r.taxCategory);
      },

      async isReverseCharge(on: boolean) {
        now().set("isReverseCharge", on);
        const v = now().values;
        if (!v.supplierAddress) return;
        const r = got(await supplierAddressFetch(v.supplierAddress, v.supplier, { ...party(), isReverseCharge: on }));
        if (r) applyPartyTaxes(r.taxes);
      },

      async contactPerson(code: string | null) {
        now().set("contactPerson", code);
        if (!code) return now().setDisplays({ contactDisplay: null, contactMobile: null, contactEmail: null });
        const c = got(await contactFetch(code));
        if (c) now().setDisplays({ contactDisplay: c.display, contactMobile: c.mobile, contactEmail: c.email });
      },

      async shippingAddress(code: string | null) {
        now().set("shippingAddress", code);
        if (!code) return now().setDisplays({ shippingAddressDisplay: null });
        const a = got(await addressFetch(code));
        if (a) now().setDisplays({ shippingAddressDisplay: a.display });
      },

      async billingAddress(code: string | null) {
        now().set("billingAddress", code);
        if (!code) return now().setDisplays({ billingAddressDisplay: null, companyGstin: null });
        const a = got(await addressFetch(code));
        if (!a) return;
        now().setDisplays({ billingAddressDisplay: a.display, companyGstin: a.gstin });
        if (a.gstStateNumber && a.gstState) now().set("placeOfSupply", `${a.gstStateNumber}-${a.gstState}`);
      },

      async company(code: string | null) {
        now().set("company", code ?? "");
        if (!code) return;
        const c = got(await companyFetch(code));
        if (!c) return;
        now().patch({
          billingAddress: c.billingAddress?.code ?? null,
          shippingAddress: c.shippingAddress?.code ?? null,
          placeOfSupply: c.placeOfSupply,
          ...(c.letterHead ? { letterHead: c.letterHead } : {}),
        });
        now().setDisplays({ billingAddressDisplay: c.billingAddress?.display ?? null, shippingAddressDisplay: c.shippingAddress?.display ?? null, companyGstin: c.billingAddress?.gstin ?? null });
      },

      async customer(code: string | null) {
        now().patch({ customer: code, customerContactPerson: null });
        now().setDisplays({ customerName: null, customerContactDisplay: null, customerContactMobile: null, customerContactEmail: null });
        if (!code) return;
        const c = got(await customerFetch(code));
        if (c) now().setDisplays({ customerName: c.customerName });
      },

      async customerContact(code: string | null) {
        now().set("customerContactPerson", code);
        if (!code) return now().setDisplays({ customerContactDisplay: null, customerContactMobile: null, customerContactEmail: null });
        const c = got(await contactFetch(code));
        if (c) now().setDisplays({ customerContactDisplay: c.display, customerContactMobile: c.mobile, customerContactEmail: c.email });
      },

      async currency(code: string | null) {
        if (!code) return;
        now().set("currency", code);
        await exchangeRate(code, now().values.transactionDate);
      },

      async transactionDate(date: string | null) {
        now().set("transactionDate", date ?? "");
        const v = now().values;
        if (date && v.currency !== companyCurrency()) await exchangeRate(v.currency, date);
      },

      async buyingPriceList(code: string | null) {
        now().set("buyingPriceList", code);
        await priceListCurrency(code);
      },

      applyTds(on: boolean) {
        now().patch({ applyTds: on, taxWithholdingCategory: on ? supplierTds.current : null });
      },

      /** set_schedule_date: the header Required By goes into every row that has none. */
      scheduleDate(date: string | null) {
        now().set("scheduleDate", date);
        if (!date) return;
        now().values.items.forEach((row, i) => {
          if (!row.scheduleDate) now().setRow("items", i, { scheduleDate: date });
        });
      },

      /** A row's Required By: without a header date, it goes into the other rows that have none. */
      itemScheduleDate(index: number, date: string | null) {
        now().setRow("items", index, { scheduleDate: date ?? "" });
        if (!date || now().values.scheduleDate) return;
        now().values.items.forEach((row, i) => {
          if (i !== index && !row.scheduleDate) now().setRow("items", i, { scheduleDate: date });
        });
      },

      /** set_warehouse: the Target Warehouse goes into every row. */
      setWarehouse(code: string | null) {
        now().set("setWarehouse", code);
        if (!code) return;
        now().values.items.forEach((_, i) => now().setRow("items", i, { warehouse: code }));
      },

      async itemCode(index: number, code: string | null) {
        now().setRow("items", index, { itemCode: code ?? "" });
        if (!code) return;
        const v = now().values;
        const d = got(await itemFetch(code, { company: v.company, taxCategory: v.taxCategory ?? null, transactionDate: v.transactionDate, setWarehouse: v.setWarehouse ?? null, conversionRate: Number(v.conversionRate) || 1 }));
        if (!d) return;
        if (d.refusal) {
          toast.error(d.refusal);
          now().setRow("items", index, { itemCode: "" });
          return;
        }
        const row = now().values.items[index];
        now().setRow("items", index, {
          itemName: d.itemName,
          description: d.description,
          uom: d.uom,
          conversionFactor: d.conversionFactor,
          itemTaxTemplate: d.itemTaxTemplate,
          warehouse: d.warehouse,
          expenseAccount: d.expenseAccount,
          costCenter: d.costCenter,
          weightPerUnit: d.weightPerUnit,
          qty: Number(row?.qty) || 1,
          // The add-on put the header Required By on the row once an item was chosen.
          scheduleDate: now().values.scheduleDate || row?.scheduleDate || "",
        });
        now().setRowInfo(index, { stockUom: d.stockUom, gstHsnCode: d.gstHsnCode, lastPurchaseRate: d.lastPurchaseRate });
      },

      async uom(index: number, uom: string | null) {
        now().setRow("items", index, { uom: uom ?? "" });
        const row = now().values.items[index];
        if (!uom || !row?.itemCode) return;
        const factor = got(await uomFactorFetch(row.itemCode, uom));
        if (factor) now().setRow("items", index, { conversionFactor: factor });
      },

      /** price_list_rate / discount_percentage / discount_amount / margin_*: the row's rate follows. */
      pricing(index: number, change: Partial<ItemRowValues>) {
        const row = now().values.items[index];
        if (!row) return;
        const next = { ...row, ...change };
        if ("discountPercentage" in change) next.discountAmount = 0;
        if ("discountAmount" in change) next.discountPercentage = 0;
        if ("marginType" in change && !change.marginType) next.marginRateOrAmount = 0;
        now().setRow("items", index, { ...change, ...pricedRate(next), ...(("marginType" in change && !change.marginType) ? { marginRateOrAmount: 0 } : {}) });
      },

      async taxCategory(category: string | null) {
        now().set("taxCategory", category);
        const r = await refreshItemTaxTemplates(category);
        if (r?.taxesAndCharges && r.taxes) now().patch({ taxesAndCharges: r.taxesAndCharges, taxes: r.taxes });
      },

      async taxesAndCharges(template: string | null) {
        now().set("taxesAndCharges", template);
        if (!template) return;
        const rows = got(await taxRowsFetch(template));
        if (rows) now().replaceRows("taxes", rows);
      },

      async taxAccount(index: number, account: string | null) {
        now().setRow("taxes", index, { accountHead: account ?? "" });
        if (!account) return;
        const a = got(await accountFetch(account));
        if (!a) return;
        const row = now().values.taxes?.[index];
        now().setRow("taxes", index, { description: a.description, ...(row?.chargeType !== "Actual" ? { rate: a.taxRate } : {}) });
      },

      async serviceItem(index: number, code: string | null) {
        const rows = now().values.costOverheads ?? [];
        // The add-on dropped a row that repeated another row's service item.
        if (code && rows.some((r, i) => i !== index && r.serviceItem === code)) {
          now().removeRows("costOverheads", [index]);
          toast.message(`${code} is already in Cost Overheads`);
          return;
        }
        now().setRow("costOverheads", index, { serviceItem: code });
        if (!code) return;
        const d = got(await serviceItemFetch(code, now().values.company));
        if (d?.accountHead) now().setRow("costOverheads", index, { accountHead: d.accountHead });
      },

      /** services_charges: the overhead's Actual GST row on its account, replaced on every change. */
      async serviceCharges(index: number) {
        const v = now().values;
        const row = v.costOverheads?.[index];
        if (!row?.accountHead) return;
        const t = got(await overheadTaxFetch((v.costOverheads ?? []).map((r) => ({ serviceItem: r.serviceItem ?? null, serviceCharges: r.serviceCharges ?? null, accountHead: r.accountHead ?? null })), row.accountHead, v.company));
        if (!t) return;
        const kept = (now().values.taxes ?? []).filter((x) => !(x.accountHead === row.accountHead && x.chargeType === (row.chargeType || "Actual")));
        now().replaceRows("taxes", [
          ...kept,
          { category: "Total", addDeductTax: "Add", chargeType: "Actual", rowId: null, accountHead: t.accountHead, description: t.description, rate: 0, taxAmount: t.taxAmount, includedInPrintRate: false, costCenter: null, servicePrice: Number(row.serviceCharges ?? 0) },
        ]);
      },

      async paymentTermsTemplate(code: string | null) {
        now().set("paymentTermsTemplate", code);
        if (!code) return;
        const rows = got(await paymentScheduleFetch(code, now().values.transactionDate));
        if (rows) now().replaceRows("paymentSchedule", rows);
      },

      async paymentTerm(index: number, code: string | null) {
        now().setRow("paymentSchedule", index, { paymentTerm: code });
        if (!code) return;
        const d = got(await paymentTermFetch(code, now().values.transactionDate));
        if (d) now().setRow("paymentSchedule", index, d);
      },

      async termsTemplate(code: string | null) {
        now().set("termsTemplate", code);
        if (!code) return;
        const html = got(await termsFetch(code));
        if (html !== undefined) now().set("terms", html);
      },

      additionalDiscountPercentage(pct: number) {
        now().patch({ additionalDiscountPercentage: pct, discountAmount: 0 });
      },

      discountAmount(amount: number) {
        now().patch({ discountAmount: amount, additionalDiscountPercentage: 0 });
      },
    };
  }, []);
}
