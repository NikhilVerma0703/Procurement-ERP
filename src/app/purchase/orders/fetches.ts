"use server";

// The PO form's live fetches (a field changed → what the old form fetched).
// Each reads masters only, behind purchaseGate("view"); the rules are in
// lib/purchase/orders/fetches.ts.
import * as f from "@/lib/purchase/orders/fetches";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";

type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };

async function read<T>(fn: () => Promise<T>): Promise<Fetched<T>> {
  const g = await purchaseGate("view");
  if (!g.ok) return { ok: false, error: purchaseRefusal(g) };
  return { ok: true, value: await fn() };
}

export async function supplierFetch(code: string, ctx: f.PartyContext & { currentPriceList: string | null }) {
  return read(() => f.fetchSupplier(code, ctx));
}
export async function supplierAddressFetch(code: string, supplier: string, ctx: f.PartyContext) {
  return read(() => f.fetchSupplierAddress(code, supplier, ctx));
}
export async function addressFetch(code: string) {
  return read(() => f.fetchAddress(code));
}
export async function contactFetch(code: string) {
  return read(() => f.fetchContact(code));
}
export async function companyFetch(code: string) {
  return read(() => f.fetchCompany(code));
}
export async function customerFetch(code: string) {
  return read(() => f.fetchCustomer(code));
}
export async function itemFetch(code: string, ctx: Parameters<typeof f.fetchItem>[1]) {
  return read(() => f.fetchItem(code, ctx));
}
export async function priceListFetch(code: string) {
  return read(() => f.fetchPriceList(code));
}
export async function uomFactorFetch(itemCode: string, uom: string) {
  return read(() => f.fetchUomFactor(itemCode, uom));
}
export async function taxRowsFetch(template: string) {
  return read(() => f.fetchTaxRows(template));
}
export async function taxCategoryFetch(category: string | null, items: { itemCode: string }[], ctx: Parameters<typeof f.fetchTaxCategory>[2]) {
  return read(() => f.fetchTaxCategory(category, items, ctx));
}
export async function paymentScheduleFetch(template: string, transactionDate: string) {
  return read(() => f.fetchPaymentSchedule(template, transactionDate));
}
export async function paymentTermFetch(code: string, transactionDate: string) {
  return read(() => f.fetchPaymentTerm(code, transactionDate));
}
export async function termsFetch(template: string) {
  return read(() => f.fetchTerms(template));
}
export async function exchangeRateFetch(from: string, to: string, date: string) {
  return read(() => f.fetchExchangeRate(from, to, date));
}
export async function serviceItemFetch(code: string, company: string) {
  return read(() => f.fetchServiceItem(code, company));
}
export async function overheadTaxFetch(rows: Parameters<typeof f.fetchOverheadTax>[0], accountHead: string, company: string) {
  return read(() => f.fetchOverheadTax(rows, accountHead, company));
}
export async function accountFetch(code: string) {
  return read(() => f.fetchAccount(code));
}
