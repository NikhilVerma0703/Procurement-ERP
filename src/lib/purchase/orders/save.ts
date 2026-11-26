// Saving a Purchase Order — the server's side of the form (server authority,
// CLAUDE.md). It re-validates the form with the same schema, resolves every
// link against the masters (refusing what the old site refused, with its
// messages), lets the calculation engine compute every figure, and writes the
// PO with all its rows in one transaction. It never stores a number the
// browser computed.
//
// The old site's save rules kept here (ERPNext 14 PurchaseOrder.validate and
// its controllers, India Compliance, the add-on):
//   * a supplier on hold for "All" or "Invoices" (until its release date) or
//     disabled is refused (AccountsController.ensure_supplier_is_not_blocked,
//     validate_party_frozen_disabled);
//   * an item must exist, not be disabled or past its end of life, and not be a
//     template (validate_for_items, get_item_details); a stock item needs a
//     warehouse; a warehouse must be enabled and the PO company's;
//   * a whole-number UOM takes no fraction, for the row's UOM and its stock UOM
//     (validate_uom_is_integer); an item's rows together reach its minimum
//     order quantity (validate_minimum_order_qty);
//   * tax rows' accounts belong to the company; the taxes template is enabled;
//   * the header Required By is the earliest row's (validate_schedule_date);
//   * when no row is a stock or fixed-asset item, "Valuation" tax rows become
//     "Total" (validate_stock_or_nonstock_items);
//   * Title keeps the old form's "{supplier_name}" (as all 3,199 POs have it);
//   * a new PO takes the next number of the series; an amendment is named
//     after the PO it replaces.
// The same item may be on several rows: the old site allowed it (184 POs do).
//
// An edit is recorded as ERPNext recorded it: a Version with what changed
// (version.ts). Creating a PO records nothing (the old site did not; its
// "created" line comes from the PO itself).
import "server-only";
import { Prisma } from "@prisma/client";
import { addressDisplay, contactDisplay } from "../address";
import { calculatePurchaseOrder, type CalcCurrency, type PurchaseOrderCalcResult } from "../calc/index";
import { dbDecimal, flt } from "../calc/pymath";
import { SITE_PRECISION } from "../calc/settings";
import { formatDate, siteToday } from "../format";
import { sanitizeHtml } from "../html";
import { recordOrderEvent } from "../server/audit";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import { engineInput, type EngineMasters } from "./engine-input";
import { fieldErrorsOf, orderFormSchema, type ActionResult, type OrderFormData } from "./form-schema";
import { derivePlaceOfSupply, gstApplies, gstIssue, type GstContext } from "./gst-rules";
import { ADD_DEDUCT_KEYS, CHARGE_TYPE_KEYS, DISCOUNT_ON_KEYS, MARGIN_TYPE_KEYS, TAX_CATEGORY_KEYS } from "./labels";
import { currencyDisplay, orderRecord } from "./load";
import { currencies, gstAccountTypes, itemTaxTemplates, paymentTerms } from "./masters";
import { defaultSchedule, scheduleFromTerms } from "../calc/schedule";
import { seriesForDate } from "../financial-year";
import { nextInSeries } from "../series-counter";
import { amendedNumber, DEFAULT_SERIES } from "./numbering";
import { orderSnapshot, type OrderRecord } from "./record";
import { versionDiff } from "./version";
import { materialRequestRowRefusal } from "../stock/material-request";

type Tx = Prisma.TransactionClient;

/** A refusal the user should read (not a crash): it rolls the transaction back. */
export class UserError extends Error {}

const dec = (x: number) => dbDecimal(x);
const day = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

/** The masters every figure depends on, as the engine takes them. */
export async function engineMasters(companyCurrency: string): Promise<EngineMasters> {
  const [cur, tpls, gst] = await Promise.all([currencies(), itemTaxTemplates(), gstAccountTypes()]);
  const currencyMap: Record<string, CalcCurrency> = Object.fromEntries(
    cur.map((c) => [c.code, { code: c.code, smallestFraction: c.smallestFraction, fraction: c.fraction, numberFormat: c.numberFormat }]),
  );
  return {
    currencies: currencyMap,
    companyCurrency,
    itemTaxTemplates: Object.fromEntries(tpls.map((t) => [t.code, { rates: t.rates, gstTreatment: t.gstTreatment }])),
    gstAccountTypes: gst,
  };
}

/** Everything the form links to, found by name; what is missing or not allowed goes to `errors`. */
async function resolve(d: OrderFormData) {
  const errors: Record<string, string> = {};
  const fail = (key: string, message: string) => {
    if (!(key in errors)) errors[key] = message;
  };
  const itemCodes = uniq([...d.items.map((i) => i.itemCode), ...d.costOverheads.map((o) => o.serviceItem)]);
  const accountCodes = uniq([...d.taxes.map((t) => t.accountHead), ...d.costOverheads.map((o) => o.accountHead), ...d.items.map((i) => i.expenseAccount)]);
  const warehouseCodes = uniq([d.setWarehouse, ...d.items.map((i) => i.warehouse)]);
  const costCenterCodes = uniq([d.costCenter, ...d.items.map((i) => i.costCenter), ...d.taxes.map((t) => t.costCenter)]);
  const templateCodes = uniq(d.items.map((i) => i.itemTaxTemplate));
  const addressCodes = uniq([d.supplierAddress, d.shippingAddress, d.billingAddress]);
  const termNames = uniq(d.paymentSchedule.map((s) => s.paymentTerm));

  const [supplier, company, currency, priceList, taxCategory, taxTemplate, items, accounts, warehouses, costCenters, itemTemplates, addresses, contact, ptTemplate, terms, tcTemplate, letterHead, uoms, customer, customerContact] =
    await Promise.all([
      db.purchaseSupplier.findUnique({ where: { code: d.supplier } }),
      db.purchaseCompany.findUnique({ where: { code: d.company } }),
      db.purchaseCurrency.findUnique({ where: { code: d.currency } }),
      d.buyingPriceList ? db.purchasePriceList.findUnique({ where: { code: d.buyingPriceList } }) : null,
      d.taxCategory ? db.purchaseTaxCategory.findUnique({ where: { code: d.taxCategory } }) : null,
      d.taxesAndCharges ? db.purchaseTaxTemplate.findUnique({ where: { code: d.taxesAndCharges } }) : null,
      db.purchaseItem.findMany({ where: { code: { in: itemCodes } }, include: { itemGroup: { select: { code: true } } } }),
      db.purchaseAccount.findMany({ where: { code: { in: accountCodes } }, include: { company: { select: { code: true } } } }),
      db.purchaseWarehouse.findMany({ where: { code: { in: warehouseCodes } }, include: { company: { select: { code: true } } } }),
      db.purchaseCostCenter.findMany({ where: { code: { in: costCenterCodes } } }),
      db.purchaseItemTaxTemplate.findMany({ where: { code: { in: templateCodes } } }),
      db.purchaseAddress.findMany({ where: { code: { in: addressCodes } } }),
      d.contactPerson ? db.purchaseContact.findUnique({ where: { code: d.contactPerson } }) : null,
      d.paymentTermsTemplate ? db.purchasePaymentTermsTemplate.findUnique({ where: { code: d.paymentTermsTemplate } }) : null,
      db.purchasePaymentTerm.findMany({ where: { code: { in: termNames } } }),
      d.termsTemplate ? db.purchaseTermsTemplate.findUnique({ where: { code: d.termsTemplate } }) : null,
      d.letterHead ? db.purchaseLetterHead.findUnique({ where: { code: d.letterHead } }) : null,
      db.purchaseUom.findMany(),
      d.customer ? db.purchaseCustomer.findUnique({ where: { code: d.customer } }) : null,
      d.customerContactPerson ? db.purchaseContact.findUnique({ where: { code: d.customerContactPerson } }) : null,
    ]);

  if (!supplier) fail("supplier", `Supplier ${d.supplier} not found`);
  else if (supplier.disabled) fail("supplier", `Supplier ${d.supplier} is disabled`);
  else if (supplier.onHold && ["All", "Invoices"].includes(supplier.holdType || "All") && (!supplier.releaseDate || siteToday() <= ymd(supplier.releaseDate))) {
    fail("supplier", `${d.supplier} is blocked so this transaction cannot proceed`);
  }
  if (!company) fail("company", `Company ${d.company} not found`);
  if (!currency) fail("currency", `Currency ${d.currency} not found`);
  if (d.buyingPriceList && !priceList) fail("buyingPriceList", `Price List ${d.buyingPriceList} not found`);
  if (d.taxCategory && !taxCategory) fail("taxCategory", `Tax Category ${d.taxCategory} not found`);
  if (d.taxesAndCharges && !taxTemplate) fail("taxesAndCharges", `Purchase Taxes and Charges Template ${d.taxesAndCharges} not found`);
  else if (taxTemplate?.disabled) fail("taxesAndCharges", `Purchase Taxes and Charges Template '${taxTemplate.code}' is disabled`);
  if (d.contactPerson && !contact) fail("contactPerson", `Contact ${d.contactPerson} not found`);
  if (d.paymentTermsTemplate && !ptTemplate) fail("paymentTermsTemplate", `Payment Terms Template ${d.paymentTermsTemplate} not found`);
  if (d.termsTemplate && !tcTemplate) fail("termsTemplate", `Terms Template ${d.termsTemplate} not found`);
  if (d.letterHead && !letterHead) fail("letterHead", `Letter Head ${d.letterHead} not found`);
  if (d.customer && !customer) fail("customer", `Customer ${d.customer} not found`);
  if (d.customerContactPerson && !customerContact) fail("customerContactPerson", `Contact ${d.customerContactPerson} not found`);

  const itemBy = new Map(items.map((i) => [i.code, i]));
  const accountBy = new Map(accounts.map((a) => [a.code, a]));
  const warehouseBy = new Map(warehouses.map((w) => [w.code, w]));
  const costCenterBy = new Map(costCenters.map((c) => [c.code, c]));
  const templateBy = new Map(itemTemplates.map((t) => [t.code, t]));
  const addressBy = new Map(addresses.map((a) => [a.code, a]));
  const termBy = new Map(terms.map((t) => [t.code, t]));
  const uomBy = new Map(uoms.map((u) => [u.name, u]));

  for (const [key, c] of [["supplierAddress", d.supplierAddress], ["shippingAddress", d.shippingAddress], ["billingAddress", d.billingAddress]] as const) {
    if (c && !addressBy.has(c)) fail(key, `Address ${c} not found`);
  }
  if (d.costCenter && !costCenterBy.has(d.costCenter)) fail("costCenter", `Cost Center ${d.costCenter} not found`);
  // validate_warehouse: enabled, and the PO company's.
  const checkWarehouse = (key: string, c: string | null) => {
    if (!c) return;
    const w = warehouseBy.get(c);
    if (!w) fail(key, `Warehouse ${c} not found`);
    else if (w.disabled) fail(key, `Disabled Warehouse ${c} cannot be used for this transaction.`);
    else if (w.company && w.company.code !== d.company) fail(key, `Warehouse ${c} does not belong to company ${d.company}`);
  };
  checkWarehouse("setWarehouse", d.setWarehouse);

  const stockQtyByItem = new Map<string, number>();
  d.items.forEach((row, i) => {
    const p = `items.${i}`;
    const idx = i + 1;
    const item = itemBy.get(row.itemCode);
    if (!item) {
      fail(`${p}.itemCode`, `Row #${idx}: Item ${row.itemCode} does not exist`);
      return;
    }
    if (item.endOfLife && ymd(item.endOfLife) <= siteToday()) fail(`${p}.itemCode`, `Item ${item.code} has reached its end of life on ${formatDate(item.endOfLife)}`);
    else if (item.disabled) fail(`${p}.itemCode`, `Item ${item.code} is disabled`);
    else if (item.hasVariants) fail(`${p}.itemCode`, `Item ${item.code} is a template, please select one of its variants`);
    if (item.isStockItem && !row.warehouse) fail(`${p}.warehouse`, `Row #${idx}: Warehouse is mandatory for stock Item ${item.code}`);
    checkWarehouse(`${p}.warehouse`, row.warehouse);
    const stockQty = flt(row.qty * row.conversionFactor, SITE_PRECISION.float);
    for (const [uomName, qty] of [[row.uom, row.qty], [item.stockUom, stockQty]] as const) {
      const uom = uomBy.get(uomName);
      if (!uom) fail(`${p}.uom`, `Row #${idx}: UOM ${uomName} not found`);
      else if (uom.mustBeWholeNumber && Math.abs(Math.trunc(qty) - qty) > 0.0000001) {
        fail(`${p}.qty`, `Row ${idx}: Quantity (${qty}) cannot be a fraction. To allow this, disable 'Must be Whole Number' in UOM ${uomName}.`);
      }
    }
    if (row.itemTaxTemplate && !templateBy.has(row.itemTaxTemplate)) fail(`${p}.itemTaxTemplate`, `Row #${idx}: Item Tax Template ${row.itemTaxTemplate} not found`);
    if (row.expenseAccount && !accountBy.has(row.expenseAccount)) fail(`${p}.expenseAccount`, `Row #${idx}: Account ${row.expenseAccount} not found`);
    if (row.costCenter && !costCenterBy.has(row.costCenter)) fail(`${p}.costCenter`, `Row #${idx}: Cost Center ${row.costCenter} not found`);
    stockQtyByItem.set(item.code, (stockQtyByItem.get(item.code) ?? 0) + stockQty);
  });
  for (const [c, qty] of stockQtyByItem) {
    const min = num(itemBy.get(c)?.minOrderQty);
    if (qty < min) fail("items", `Item ${c}: Ordered qty ${qty} cannot be less than minimum order qty ${min} (defined in Item).`);
  }
  d.taxes.forEach((t, i) => {
    const a = accountBy.get(t.accountHead);
    if (!a) fail(`taxes.${i}.accountHead`, `Row #${i + 1}: Account ${t.accountHead} not found`);
    else if (a.company && a.company.code !== d.company) fail(`taxes.${i}.accountHead`, `Row #${i + 1}: Account ${t.accountHead} does not belong to company ${d.company}`);
    if (t.costCenter && !costCenterBy.has(t.costCenter)) fail(`taxes.${i}.costCenter`, `Row #${i + 1}: Cost Center ${t.costCenter} not found`);
  });
  d.costOverheads.forEach((o, i) => {
    if (o.serviceItem && !itemBy.has(o.serviceItem)) fail(`costOverheads.${i}.serviceItem`, `Row #${i + 1}: Item ${o.serviceItem} does not exist`);
    if (o.accountHead && !accountBy.has(o.accountHead)) fail(`costOverheads.${i}.accountHead`, `Row #${i + 1}: Account ${o.accountHead} not found`);
  });
  d.paymentSchedule.forEach((s, i) => {
    if (s.paymentTerm && !termBy.has(s.paymentTerm)) fail(`paymentSchedule.${i}.paymentTerm`, `Row #${i + 1}: Payment Term ${s.paymentTerm} not found`);
  });

  return {
    errors,
    supplier, company, currency, priceList, taxCategory, taxTemplate, contact, ptTemplate, tcTemplate, letterHead, customer, customerContact,
    itemBy, accountBy, warehouseBy, costCenterBy, templateBy, addressBy, termBy,
  };
}

type Resolved = Awaited<ReturnType<typeof resolve>>;
type Ok = Resolved & { supplier: NonNullable<Resolved["supplier"]>; company: NonNullable<Resolved["company"]> };

/** validate_stock_or_nonstock_items: with no stock or fixed-asset row, valuation taxes count on the Total. */
function withTaxCategories(d: OrderFormData, r: Ok): OrderFormData {
  const anyStock = d.items.some((row) => {
    const item = r.itemBy.get(row.itemCode);
    return item?.isStockItem || item?.isFixedAsset;
  });
  if (anyStock || !d.taxes.some((t) => t.category !== "Total")) return d;
  return { ...d, taxes: d.taxes.map((t) => ({ ...t, category: "Total" as const })) };
}

/** The PO's own columns, from the form, the masters and the engine's figures. */
function headerData(d: OrderFormData, r: Ok, c: PurchaseOrderCalcResult) {
  const supplierAddress = d.supplierAddress ? r.addressBy.get(d.supplierAddress)! : null;
  const shipping = d.shippingAddress ? r.addressBy.get(d.shippingAddress)! : null;
  const billing = d.billingAddress ? r.addressBy.get(d.billingAddress)! : null;
  const id = <T extends { id: string }>(x: T | null | undefined) => x?.id ?? null;
  return {
    title: "{supplier_name}",
    supplierId: r.supplier.id,
    supplierName: r.supplier.supplierName,
    shipmentType: d.shipmentType,
    modeOfTransport: d.modeOfTransport,
    transactionDate: day(d.transactionDate)!,
    scheduleDate: day(d.items.map((i) => i.scheduleDate).sort()[0]),
    purposeOfPurchase: d.purposeOfPurchase,
    companyId: r.company.id,
    applyTds: d.applyTds,
    taxWithholdingCategory: d.applyTds ? d.taxWithholdingCategory : null,
    isReverseCharge: d.isReverseCharge,
    isSubcontracted: d.isSubcontracted,
    costCenterId: d.costCenter ? id(r.costCenterBy.get(d.costCenter)) : null,
    currency: d.currency,
    conversionRate: dec(c.conversionRate),
    buyingPriceListId: id(r.priceList),
    priceListCurrency: r.priceList?.currency ?? null,
    plcConversionRate: dec(d.plcConversionRate),
    ignorePricingRule: d.ignorePricingRule,
    setWarehouseId: d.setWarehouse ? id(r.warehouseBy.get(d.setWarehouse)) : null,
    totalQty: dec(c.totalQty),
    totalNetWeight: dec(c.totalNetWeight),
    baseTotal: dec(c.baseTotal),
    baseNetTotal: dec(c.baseNetTotal),
    total: dec(c.total),
    netTotal: dec(c.netTotal),
    taxWithholdingNetTotal: dec(c.taxWithholdingNetTotal),
    baseTaxWithholdingNetTotal: dec(c.baseTaxWithholdingNetTotal),
    taxCategoryId: id(r.taxCategory),
    taxesAndChargesId: id(r.taxTemplate),
    baseTaxesAndChargesAdded: dec(c.baseTaxesAndChargesAdded),
    baseTaxesAndChargesDeducted: dec(c.baseTaxesAndChargesDeducted),
    baseTotalTaxesAndCharges: dec(c.baseTotalTaxesAndCharges),
    taxesAndChargesAdded: dec(c.taxesAndChargesAdded),
    taxesAndChargesDeducted: dec(c.taxesAndChargesDeducted),
    totalTaxesAndCharges: dec(c.totalTaxesAndCharges),
    baseGrandTotal: dec(c.baseGrandTotal),
    baseRoundingAdjustment: dec(c.baseRoundingAdjustment),
    baseRoundedTotal: dec(c.baseRoundedTotal),
    baseInWords: c.baseInWords,
    grandTotal: dec(c.grandTotal),
    roundingAdjustment: dec(c.roundingAdjustment),
    roundedTotal: dec(c.roundedTotal),
    disableRoundedTotal: d.disableRoundedTotal,
    inWords: c.inWords,
    applyDiscountOn: DISCOUNT_ON_KEYS[d.applyDiscountOn],
    baseDiscountAmount: dec(c.baseDiscountAmount),
    additionalDiscountPercentage: dec(d.additionalDiscountPercentage),
    discountAmount: dec(c.discountAmount),
    supplierAddressId: id(supplierAddress),
    addressDisplay: supplierAddress ? addressDisplay(supplierAddress) : null,
    supplierGstin: supplierAddress?.gstin ?? null,
    gstCategory: supplierAddress?.gstCategory ?? r.supplier.gstCategory ?? null,
    contactPersonId: id(r.contact),
    contactDisplay: r.contact ? contactDisplay(r.contact) : null,
    contactMobile: r.contact ? (r.contact.mobileNo ?? r.contact.phone) : null,
    contactEmail: r.contact?.emailId ?? null,
    shippingAddressId: id(shipping),
    shippingAddressDisplay: shipping ? addressDisplay(shipping) : null,
    billingAddressId: id(billing),
    billingAddressDisplay: billing ? addressDisplay(billing) : null,
    companyGstin: billing?.gstin ?? null,
    placeOfSupply: d.placeOfSupply,
    customerId: id(r.customer),
    customerName: r.customer?.customerName ?? null,
    customerContactPersonId: id(r.customerContact),
    customerContactDisplay: r.customerContact ? contactDisplay(r.customerContact) : null,
    customerContactMobile: r.customerContact ? (r.customerContact.mobileNo ?? r.customerContact.phone) : null,
    customerContactEmail: r.customerContact?.emailId ?? null,
    paymentTermsTemplateId: id(r.ptTemplate),
    termsTemplateId: id(r.tcTemplate),
    terms: sanitizeHtml(d.terms) || null,
    letterHeadId: id(r.letterHead),
    groupSameItems: d.groupSameItems,
    selectPrintHeading: d.selectPrintHeading,
    language: d.language,
    isInternalSupplier: r.supplier.isInternalSupplier,
    // get_party_account_currency: the supplier's payable account currency; every PO had INR.
    partyAccountCurrency: r.company.defaultCurrency ?? "INR",
  } satisfies Partial<Prisma.PurchaseOrderUncheckedCreateInput>;
}

/** A stored row an edit replaces: kept by its id, so the history can say which row changed. */
type Kept = Map<string, Record<string, unknown>>;
const keepBy = (rows: { id: string }[]): Kept => new Map(rows.map((row) => [row.id, row as unknown as Record<string, unknown>]));
/** Row columns that come from other documents (material requests, receipts, the import) and stay as they were. */
const KEEP_ITEM = [
  "erpnextName", "materialRequest", "materialRequestItem", "salesOrder", "salesOrderItem", "supplierQuotation", "supplierQuotationItem",
  "deliveredBySupplier", "blanketOrder", "fromWarehouse", "manufacturer", "manufacturerPartNo", "bom", "pageBreak", "project",
  "supplierPartNo", "legacy",
  // What receipts and invoices recorded against a submitted PO's line (Update Items keeps them).
  "receivedQty", "returnedQty", "billedAmt", "actualQty", "companyTotalStock",
] as const;
const KEEP_ROW = ["erpnextName", "legacy"] as const;
function kept(row: { id?: string }, rows: Kept, keys: readonly string[]) {
  const old = row.id ? rows.get(row.id) : undefined;
  if (!old) return {};
  return { id: row.id, ...Object.fromEntries(keys.filter((k) => old[k] !== undefined && old[k] !== null).map((k) => [k, old[k]])) };
}

function itemRows(d: OrderFormData, r: Ok, c: PurchaseOrderCalcResult, rows: Kept) {
  return d.items.map((row, i): Prisma.PurchaseOrderItemCreateManyOrderInput => {
    const calc = c.items[i];
    const item = r.itemBy.get(row.itemCode)!;
    const tpl = row.itemTaxTemplate ? r.templateBy.get(row.itemTaxTemplate) : undefined;
    return {
      ...kept(row, rows, KEEP_ITEM),
      // A row made from a Material Request row keeps that link (checked in prepareOrder).
      ...(row.materialRequestItem ? { materialRequest: row.materialRequest ?? null, materialRequestItem: row.materialRequestItem } : {}),
      idx: i + 1,
      itemId: item.id,
      itemCode: item.code,
      itemName: row.itemName,
      itemGroup: item.itemGroup?.code ?? null,
      description: row.description || row.itemName,
      image: item.image,
      brand: item.brand,
      gstHsnCode: item.gstHsnCode,
      isIneligibleForItc: item.isIneligibleForItc,
      scheduleDate: day(row.scheduleDate),
      expectedDeliveryDate: day(row.expectedDeliveryDate),
      qty: dec(calc.qty),
      uom: row.uom,
      stockUom: item.stockUom,
      conversionFactor: dec(calc.conversionFactor),
      stockQty: dec(calc.stockQty),
      priceListRate: dec(calc.priceListRate),
      basePriceListRate: dec(calc.basePriceListRate),
      lastPurchaseRate: dec(c.conversionRate ? flt(num(item.lastPurchaseRate) / c.conversionRate, SITE_PRECISION.currency) : 0),
      marginType: calc.marginType ? MARGIN_TYPE_KEYS[calc.marginType] : null,
      marginRateOrAmount: dec(calc.marginRateOrAmount),
      rateWithMargin: dec(calc.rateWithMargin),
      baseRateWithMargin: dec(calc.baseRateWithMargin),
      discountPercentage: dec(calc.discountPercentage),
      discountAmount: dec(calc.discountAmount),
      rate: dec(calc.rate),
      amount: dec(calc.amount),
      baseRate: dec(calc.baseRate),
      baseAmount: dec(calc.baseAmount),
      stockUomRate: dec(calc.stockUomRate),
      netRate: dec(calc.netRate),
      netAmount: dec(calc.netAmount),
      baseNetRate: dec(calc.baseNetRate),
      baseNetAmount: dec(calc.baseNetAmount),
      itemTaxTemplateId: tpl?.id ?? null,
      itemTaxRate: calc.itemTaxRate as Prisma.InputJsonValue,
      applyTds: row.applyTds,
      gstTreatment: calc.gstTreatment,
      taxableValue: dec(calc.taxableValue),
      igstRate: dec(calc.gst.igst_rate),
      cgstRate: dec(calc.gst.cgst_rate),
      sgstRate: dec(calc.gst.sgst_rate),
      cessRate: dec(calc.gst.cess_rate),
      cessNonAdvolRate: dec(calc.gst.cess_non_advol_rate),
      igstAmount: dec(calc.gst.igst_amount),
      cgstAmount: dec(calc.gst.cgst_amount),
      sgstAmount: dec(calc.gst.sgst_amount),
      cessAmount: dec(calc.gst.cess_amount),
      cessNonAdvolAmount: dec(calc.gst.cess_non_advol_amount),
      sgst: dec(calc.sgst),
      sgstAmt: dec(calc.sgstAmt),
      cgst: dec(calc.cgst),
      cgstAmt: dec(calc.cgstAmt),
      igst: dec(calc.igst),
      igstAmt: dec(calc.igstAmt),
      warehouseId: row.warehouse ? r.warehouseBy.get(row.warehouse)!.id : null,
      expenseAccountId: row.expenseAccount ? r.accountBy.get(row.expenseAccount)!.id : null,
      costCenterId: row.costCenter ? r.costCenterBy.get(row.costCenter)!.id : null,
      weightPerUnit: dec(calc.weightPerUnit),
      totalWeight: dec(calc.totalWeight),
      weightUom: item.weightUom,
      isFixedAsset: item.isFixedAsset,
    };
  });
}

function taxRows(d: OrderFormData, r: Ok, c: PurchaseOrderCalcResult, rows: Kept) {
  return d.taxes.map((t, i): Prisma.PurchaseOrderTaxCreateManyOrderInput => {
    const calc = c.taxes[i];
    const account = r.accountBy.get(t.accountHead)!;
    return {
      ...kept(t, rows, KEEP_ROW),
      idx: i + 1,
      category: TAX_CATEGORY_KEYS[t.category],
      addDeductTax: ADD_DEDUCT_KEYS[t.addDeductTax],
      chargeType: CHARGE_TYPE_KEYS[t.chargeType],
      rowId: t.rowId,
      includedInPrintRate: t.includedInPrintRate,
      accountHeadId: account.id,
      description: t.description || account.accountName,
      rate: dec(calc.rate),
      costCenterId: t.costCenter ? r.costCenterBy.get(t.costCenter)!.id : null,
      accountCurrency: account.accountCurrency,
      taxAmount: dec(calc.taxAmount),
      taxAmountAfterDiscountAmount: dec(calc.taxAmountAfterDiscountAmount),
      total: dec(calc.total),
      baseTaxAmount: dec(calc.baseTaxAmount),
      baseTotal: dec(calc.baseTotal),
      baseTaxAmountAfterDiscountAmount: dec(calc.baseTaxAmountAfterDiscountAmount),
      itemWiseTaxDetail: calc.itemWiseTaxDetail as Prisma.InputJsonValue,
      servicePrice: dec(t.servicePrice),
      gstTaxType: calc.gstTaxType,
    };
  });
}

function overheadRows(d: OrderFormData, r: Ok, rows: Kept) {
  return d.costOverheads.map((o, i): Prisma.PurchaseOrderCostOverheadCreateManyOrderInput => ({
    ...kept(o, rows, KEEP_ROW),
    idx: i + 1,
    serviceItemId: o.serviceItem ? r.itemBy.get(o.serviceItem)!.id : null,
    serviceCharges: o.serviceCharges == null ? null : dec(o.serviceCharges),
    accountHeadId: o.accountHead ? r.accountBy.get(o.accountHead)!.id : null,
    chargeType: o.chargeType || "Actual",
  }));
}

function scheduleRows(d: OrderFormData, r: Ok, c: PurchaseOrderCalcResult, rows: Kept) {
  return d.paymentSchedule.map((s, i): Prisma.PurchaseOrderPaymentScheduleCreateManyOrderInput => {
    const calc = c.paymentSchedule[i];
    return {
      ...kept(s, rows, KEEP_ROW),
      idx: i + 1,
      paymentTermName: s.paymentTerm,
      paymentTermId: s.paymentTerm ? (r.termBy.get(s.paymentTerm)?.id ?? null) : null,
      description: s.description,
      dueDate: day(s.dueDate)!,
      modeOfPayment: s.modeOfPayment,
      invoicePortion: dec(s.invoicePortion),
      discountType: s.discountType,
      discountDate: day(s.discountDate),
      discount: dec(s.discount),
      paymentAmount: dec(calc.paymentAmount),
      outstanding: dec(calc.outstanding),
      basePaymentAmount: dec(calc.basePaymentAmount),
      dueDateBasedOn: s.dueDateBasedOn,
      creditDays: s.creditDays,
      creditMonths: s.creditMonths,
      discountValidityBasedOn: s.discountValidityBasedOn,
      discountValidity: s.discountValidity,
    };
  });
}


/** The name of a new amendment of a cancelled PO, refusing a second amendment of it. */
async function amendmentOf(tx: Tx, fromId: string): Promise<{ id: string; number: string; namingSeries: string }> {
  const from = await tx.purchaseOrder.findUnique({
    where: { id: fromId },
    select: { id: true, number: true, namingSeries: true, docStatus: true, amendedFromId: true, amendments: { select: { number: true } } },
  });
  if (!from) throw new UserError("The Purchase Order being amended no longer exists.");
  if (from.docStatus !== "CANCELLED") throw new UserError(`Only a cancelled Purchase Order can be amended; ${from.number} is not cancelled.`);
  if (from.amendments.length) throw new UserError(`${from.number} has already been amended (${from.amendments[0].number}).`);
  // An amendment keeps the cancelled PO's series (its number is that PO's, with "-1").
  return { id: from.id, number: amendedNumber(from.number, Boolean(from.amendedFromId)), namingSeries: from.namingSeries };
}

export interface SaveRequest {
  /** The PO being edited; absent for a new one. */
  id?: string;
  /** The PO's "last updated" when the form was opened: a save over someone else's change is refused. */
  expectedUpdatedAt?: string;
  /** For a new PO made by Amend: the cancelled PO it replaces. */
  amendedFromId?: string;
  values: unknown;
}

/** What a save computes before it writes: the checked values, the masters they resolve to, the figures. */
export interface Prepared {
  data: OrderFormData;
  resolved: Ok;
  calc: PurchaseOrderCalcResult;
}

type Refusal = { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Validates the form and computes every figure; the workflow actions use it to re-check a draft. */
export async function prepareOrder(values: unknown): Promise<{ ok: true; value: Prepared } | Refusal> {
  const parsed = orderFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Some fields need attention.", fieldErrors: fieldErrorsOf(parsed.error) };
  const r = await resolve(parsed.data);
  if (Object.keys(r.errors).length) return { ok: false, error: Object.values(r.errors)[0], fieldErrors: r.errors };
  const resolved = r as Ok;
  let data = await withSchedule(withTaxCategories(parsed.data, resolved));
  // set_payment_schedule can bring the template's own terms, which the values did not name: look them up
  // too, so the schedule rows link to them (found 19-11-2026: a duplicated PO, its schedule left empty as
  // Frappe's no_copy leaves it, failed to save when its template named its terms).
  const unnamed = uniq(data.paymentSchedule.map((s) => s.paymentTerm)).filter((t) => !resolved.termBy.has(t));
  if (unnamed.length) for (const t of await db.purchasePaymentTerm.findMany({ where: { code: { in: unnamed } } })) resolved.termBy.set(t.code, t);
  // A row made from a Material Request must point at a submitted, not stopped Purchase request's row of its item.
  const mrIssue = await materialRequestRowRefusal(db, data.items);
  if (mrIssue) return { ok: false, error: mrIssue };
  const masters = await engineMasters(resolved.company.defaultCurrency ?? "INR");
  const calc = calculatePurchaseOrder(engineInput(data, masters));
  // AccountsController.validate: validate_value("base_grand_total", ">=", 0).
  if (calc.baseGrandTotal < 0) return { ok: false, error: "Incorrect value: Grand Total (Company Currency) must be >= 0" };
  const schedule = scheduleIssue(data, calc);
  if (schedule) return { ok: false, error: schedule, fieldErrors: { paymentSchedule: schedule } };

  // India Compliance: the GST checks, and the Place of Supply it filled in when left empty.
  const gst = gstContext(data, resolved);
  const issue = gstIssue(data, calc, gst);
  if (issue) return { ok: false, error: issue.message, fieldErrors: { [issue.key]: issue.message } };
  if (!data.placeOfSupply && gstApplies(gst, calc)) data = { ...data, placeOfSupply: derivePlaceOfSupply(gst.companyGstin, gst.supplierGstin) };
  return { ok: true, value: { data, resolved, calc } };
}

/**
 * set_payment_schedule: a PO saved without a schedule gets its Payment Terms Template's rows, or one
 * row for the whole amount due on the PO date (every saved PO has a schedule).
 */
async function withSchedule(d: OrderFormData): Promise<OrderFormData> {
  if (d.paymentSchedule.length) return d;
  const terms = d.paymentTermsTemplate ? await paymentTerms(d.paymentTermsTemplate) : [];
  const rows = terms.length
    ? scheduleFromTerms(terms, d.transactionDate).map((t) => ({
        paymentTerm: t.paymentTermName,
        description: t.description,
        dueDate: t.dueDate,
        invoicePortion: t.invoicePortion,
        paymentAmount: 0,
        modeOfPayment: t.modeOfPayment,
        dueDateBasedOn: t.dueDateBasedOn,
        creditDays: t.creditDays,
        creditMonths: t.creditMonths,
        discountType: t.discountType,
        discount: t.discount,
        discountValidityBasedOn: t.discountValidityBasedOn,
        discountValidity: t.discountValidity,
        discountDate: t.discountDate,
      }))
    : defaultSchedule(d.transactionDate).map((t) => ({
        paymentTerm: null, description: null, dueDate: t.dueDate, invoicePortion: t.invoicePortion, paymentAmount: 0,
        modeOfPayment: null, dueDateBasedOn: null, creditDays: 0, creditMonths: 0, discountType: "Percentage", discount: 0,
        discountValidityBasedOn: null, discountValidity: 0, discountDate: null,
      }));
  return { ...d, paymentSchedule: rows };
}

/** validate_payment_schedule_dates and validate_payment_schedule_amount, with ERPNext's messages. */
function scheduleIssue(d: OrderFormData, c: PurchaseOrderCalcResult): string | null {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  d.paymentSchedule.forEach((row, i) => {
    if (seen.has(row.dueDate)) duplicates.push(`${row.dueDate} in row ${i + 1}`);
    seen.add(row.dueDate);
  });
  if (duplicates.length) return `Rows with duplicate due dates in other rows were found: ${duplicates.join(", ")}`;
  const p = SITE_PRECISION.currency;
  const total = c.paymentSchedule.reduce((s, row) => s + flt(row.paymentAmount, p), 0);
  const grandTotal = c.roundedTotal || c.grandTotal;
  if (d.paymentSchedule.length && flt(total, p) - flt(grandTotal, p) > 1 / 10 ** (p + 1)) {
    return "Total Payment Amount in Payment Schedule must be equal to Grand / Rounded Total";
  }
  return null;
}

/** What the GST checks read: the GSTINs and GST Category from the PO's addresses, its Place of Supply. */
function gstContext(d: OrderFormData, r: Ok): GstContext {
  const supplierAddress = d.supplierAddress ? r.addressBy.get(d.supplierAddress) : undefined;
  const billing = d.billingAddress ? r.addressBy.get(d.billingAddress) : undefined;
  const companyGst = ((r.company.legacy ?? {}) as Record<string, unknown>).gst_category;
  return {
    companyGstin: billing?.gstin ?? null,
    companyIsIndianRegistered: r.company.country === "India" && companyGst !== "Unregistered",
    billingAddress: d.billingAddress,
    billingAddressGstCategory: billing?.gstCategory ?? null,
    supplierAddress: d.supplierAddress,
    supplierGstin: supplierAddress?.gstin ?? null,
    supplierStateNumber: supplierAddress?.gstStateNumber ?? null,
    gstCategory: supplierAddress?.gstCategory ?? r.supplier.gstCategory ?? null,
    placeOfSupply: d.placeOfSupply,
    isReverseCharge: d.isReverseCharge,
  };
}

/** Writes a prepared PO's columns and rows over a stored draft (in the caller's transaction). */
export async function writeDraft(tx: Tx, orderId: string, p: Prepared, by: string, extra: Prisma.PurchaseOrderUncheckedUpdateInput = {}) {
  const current = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, taxes: true, costOverheads: true, paymentSchedule: true },
  });
  await tx.purchaseOrderItem.deleteMany({ where: { orderId } });
  await tx.purchaseOrderTax.deleteMany({ where: { orderId } });
  await tx.purchaseOrderCostOverhead.deleteMany({ where: { orderId } });
  await tx.purchaseOrderPaymentSchedule.deleteMany({ where: { orderId } });
  await tx.purchaseOrder.update({
    where: { id: orderId },
    data: {
      ...headerData(p.data, p.resolved, p.calc),
      ...extra,
      updatedBy: by,
      items: { createMany: { data: itemRows(p.data, p.resolved, p.calc, keepBy(current.items)) } },
      taxes: { createMany: { data: taxRows(p.data, p.resolved, p.calc, keepBy(current.taxes)) } },
      costOverheads: { createMany: { data: overheadRows(p.data, p.resolved, keepBy(current.costOverheads)) } },
      paymentSchedule: { createMany: { data: scheduleRows(p.data, p.resolved, p.calc, keepBy(current.paymentSchedule)) } },
    },
  });
}

/** Records a Version of what changed on a PO since `before` was read (nothing when nothing did). */
export async function recordVersion(tx: Tx, before: OrderRecord, by: string, at?: Date) {
  const after = (await orderRecord(before.id, tx))!;
  const base = await currencyDisplay(after.company.defaultCurrency ?? "INR", tx);
  const diff = versionDiff(orderSnapshot(before, base), orderSnapshot(after, base));
  if (diff) {
    await recordOrderEvent(tx, { orderId: after.id, orderNumber: after.number, kind: "VERSION", byEmail: by, data: diff as unknown as Prisma.InputJsonValue, at });
  }
  return after;
}

/** Refuses a change over another made after the form was opened. */
export function assertUnchanged(updatedAt: Date, expected: string | undefined) {
  if (expected && updatedAt.toISOString() !== expected) {
    throw new UserError("This Purchase Order was changed by someone else after you opened it. Reload it to see the changes.");
  }
}

export async function saveOrder(user: PurchaseUser, req: SaveRequest): Promise<ActionResult<{ id: string; number: string }>> {
  const prepared = await prepareOrder(req.values);
  if (!prepared.ok) return prepared;
  const p = prepared.value;

  try {
    const saved = await db.$transaction(async (tx) => {
      if (!req.id) {
        const amendment = req.amendedFromId ? await amendmentOf(tx, req.amendedFromId) : null;
        // The series in the financial year of the PO Date (financial-year.ts, owner 26-11-2026).
        const series = amendment ? amendment.namingSeries : seriesForDate(DEFAULT_SERIES, p.data.transactionDate);
        const number = amendment ? amendment.number : await nextInSeries(tx, series);
        return tx.purchaseOrder.create({
          data: {
            ...headerData(p.data, p.resolved, p.calc),
            number,
            namingSeries: series,
            amendedFromId: amendment?.id ?? null,
            createdBy: user.email,
            updatedBy: user.email,
            items: { createMany: { data: itemRows(p.data, p.resolved, p.calc, new Map()) } },
            taxes: { createMany: { data: taxRows(p.data, p.resolved, p.calc, new Map()) } },
            costOverheads: { createMany: { data: overheadRows(p.data, p.resolved, new Map()) } },
            paymentSchedule: { createMany: { data: scheduleRows(p.data, p.resolved, p.calc, new Map()) } },
          },
          select: { id: true, number: true },
        });
      }

      const before = await orderRecord(req.id, tx);
      if (!before) throw new UserError("This Purchase Order no longer exists.");
      if (before.docStatus !== "DRAFT") throw new UserError("Only a draft Purchase Order can be edited.");
      assertUnchanged(before.updatedAt, req.expectedUpdatedAt);
      await writeDraft(tx, before.id, p, user.email);
      await recordVersion(tx, before, user.email);
      return { id: before.id, number: before.number };
    });
    return { ok: true, value: saved };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    // Two saves taking the same amendment name: the unique number refuses the second.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "This Purchase Order was saved twice at once; reload it to see the saved one." };
    }
    throw e;
  }
}
