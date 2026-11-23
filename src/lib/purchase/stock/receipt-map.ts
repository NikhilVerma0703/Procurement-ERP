// A new Purchase Receipt, as the old site started one (Phase II, owner 21-11-2026):
//
//   * blank (Stock › Purchase Receipt › Add): the DocType's defaults;
//   * from a submitted Purchase Order (its Create › Purchase Receipt): ERPNext 14's
//     make_purchase_receipt — every field the two DocTypes share is copied, each PO row still to be
//     received becomes a row for what is left (qty − received qty; rows delivered by the supplier are
//     left out), linked back to its PO row, and the PO's tax rows come along.
// The figures are then computed by stock/receipt-doc.ts, as the old mapper's calculate_taxes_and_totals
// did. Server-only (reads the PO).
import "server-only";
import { flt } from "../calc/pymath";
import { SITE_PRECISION } from "../calc/settings";
import { newRowName, siteDateTime, type Doc } from "../doc/store";
import { siteToday } from "../format";
import { ADD_DEDUCT_KEYS, CHARGE_TYPE_KEYS, DISCOUNT_ON_KEYS, MARGIN_TYPE_KEYS, TAX_CATEGORY_KEYS, labelOf } from "../orders/labels";
import { ORDER_INCLUDE } from "../orders/record";
import { engineMasters } from "../orders/save";
import { db } from "../server/db";
import { computeReceipt } from "./receipt-doc";
import { DEFAULT_RECEIPT_SERIES } from "./receipt-meta";

const n = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const legacyOf = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string | null>) : {});

/** The defaults of a new receipt (the DocType's own, and the site's: Buying Settings' price list, the company). */
export async function blankReceipt(): Promise<Doc> {
  const company = await db.purchaseCompany.findFirst({ orderBy: { code: "asc" }, select: { code: true, defaultCurrency: true } });
  const now = new Date();
  return {
    __islocal: 1,
    docstatus: 0,
    status: "Draft",
    naming_series: DEFAULT_RECEIPT_SERIES,
    company: company?.code ?? "",
    currency: company?.defaultCurrency ?? "INR",
    conversion_rate: 1,
    buying_price_list: "Standard Buying",
    price_list_currency: company?.defaultCurrency ?? "INR",
    plc_conversion_rate: 1,
    posting_date: siteToday(now),
    posting_time: siteDateTime(now).slice(11),
    set_posting_time: 0,
    apply_discount_on: "Grand Total",
    language: "en",
    gst_vehicle_type: "Regular",
    items: [],
    taxes: [],
    services_items: [],
  };
}

export async function receiptFromOrder(orderId: string): Promise<{ ok: true; doc: Doc } | { ok: false; error: string }> {
  const o = await db.purchaseOrder.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!o) return { ok: false, error: "This Purchase Order no longer exists." };
  if (o.docStatus !== "SUBMITTED") return { ok: false, error: `Purchase Order ${o.number} is not submitted` };
  if (o.status === "ON_HOLD" || o.status === "CLOSED") return { ok: false, error: `Purchase Order ${o.number} is ${o.status === "ON_HOLD" ? "On Hold" : "Closed"}` };
  const pol = legacyOf(o.legacy);
  const fp = SITE_PRECISION.float;
  const items = o.items
    .filter((i) => Math.abs(n(i.receivedQty)) < Math.abs(n(i.qty)) && !i.deliveredBySupplier)
    .map((i, k) => {
      const qty = flt(n(i.qty) - n(i.receivedQty), fp);
      const cf = n(i.conversionFactor) || 1;
      const l = legacyOf(i.legacy);
      return {
        __islocal: 1,
        name: newRowName(),
        idx: k + 1,
        item_code: i.itemCode,
        item_name: i.itemName,
        description: i.description ?? i.itemName,
        item_group: i.itemGroup ?? "",
        brand: i.brand ?? "",
        image: i.image ?? "",
        gst_hsn_code: i.gstHsnCode ?? "",
        is_ineligible_for_itc: i.isIneligibleForItc ? 1 : 0,
        received_qty: qty,
        qty,
        rejected_qty: 0,
        uom: i.uom,
        stock_uom: i.stockUom,
        conversion_factor: cf,
        stock_qty: flt(qty * cf, fp),
        received_stock_qty: flt(qty * cf, fp),
        price_list_rate: n(i.priceListRate),
        margin_type: i.marginType ? labelOf(MARGIN_TYPE_KEYS, i.marginType) : "",
        margin_rate_or_amount: n(i.marginRateOrAmount),
        discount_percentage: n(i.discountPercentage),
        discount_amount: n(i.discountAmount),
        rate: n(i.rate),
        item_tax_template: i.itemTaxTemplate?.code ?? "",
        gst_treatment: i.gstTreatment ?? "",
        warehouse: i.warehouse?.code ?? o.setWarehouse?.code ?? "",
        schedule_date: ymd(i.scheduleDate),
        expense_account: i.expenseAccount?.code ?? "",
        cost_center: i.costCenter?.code ?? "",
        project: i.project ?? "",
        purchase_order: o.number,
        purchase_order_item: i.erpnextName ?? i.id,
        material_request: i.materialRequest ?? "",
        material_request_item: i.materialRequestItem ?? "",
        weight_per_unit: n(i.weightPerUnit),
        weight_uom: i.weightUom ?? "",
        manufacturer: i.manufacturer ?? "",
        manufacturer_part_no: i.manufacturerPartNo ?? "",
        bom: i.bom ?? "",
        is_fixed_asset: i.isFixedAsset ? 1 : 0,
        apply_tds: i.applyTds ? 1 : 0,
        bags_qty: n(l.bags_qty as string | null),
        page_break: 0,
      };
    });
  if (!items.length) return { ok: false, error: `Every item of Purchase Order ${o.number} has already been received` };
  const doc: Doc = {
    ...(await blankReceipt()),
    supplier: o.supplier.code,
    supplier_name: o.supplierName,
    company: o.company.code,
    currency: o.currency,
    conversion_rate: n(o.conversionRate) || 1,
    buying_price_list: o.buyingPriceList?.code ?? "",
    price_list_currency: o.priceListCurrency ?? o.currency,
    plc_conversion_rate: n(o.plcConversionRate) || 1,
    ignore_pricing_rule: o.ignorePricingRule ? 1 : 0,
    set_warehouse: o.setWarehouse?.code ?? "",
    is_subcontracted: o.isSubcontracted ? 1 : 0,
    tax_category: o.taxCategory?.code ?? "",
    taxes_and_charges: o.taxesAndCharges?.code ?? "",
    shipping_rule: o.shippingRule ?? "",
    incoterm: o.incoterm ?? "",
    named_place: o.namedPlace ?? "",
    apply_discount_on: labelOf(DISCOUNT_ON_KEYS, o.applyDiscountOn),
    additional_discount_percentage: n(o.additionalDiscountPercentage),
    discount_amount: n(o.discountAmount),
    disable_rounded_total: o.disableRoundedTotal ? 1 : 0,
    supplier_address: o.supplierAddress?.code ?? "",
    address_display: o.addressDisplay ?? "",
    contact_person: o.contactPerson?.code ?? "",
    contact_display: o.contactDisplay ?? "",
    contact_mobile: o.contactMobile ?? "",
    contact_email: o.contactEmail ?? "",
    shipping_address: o.shippingAddress?.code ?? "",
    shipping_address_display: o.shippingAddressDisplay ?? "",
    billing_address: o.billingAddress?.code ?? "",
    billing_address_display: o.billingAddressDisplay ?? "",
    supplier_gstin: o.supplierGstin ?? "",
    gst_category: o.gstCategory ?? "",
    company_gstin: o.companyGstin ?? "",
    place_of_supply: o.placeOfSupply ?? "",
    is_reverse_charge: o.isReverseCharge ? 1 : 0,
    tc_name: o.termsTemplate?.code ?? "",
    terms: o.terms ?? "",
    letter_head: o.letterHead?.code ?? "",
    group_same_items: o.groupSameItems ? 1 : 0,
    select_print_heading: o.selectPrintHeading ?? "",
    language: o.language ?? "en",
    cost_center: o.costCenter?.code ?? "",
    project: o.project ?? "",
    // The add-on's Mode Of Transport on the receipt is fetched from the PO's (its fetch_from).
    custom_mode_of_transport: o.modeOfTransport ?? pol.custom_mode_of_transport ?? "",
    items,
    taxes: o.taxes.map((t, k) => ({
      __islocal: 1,
      name: newRowName(),
      idx: k + 1,
      category: labelOf(TAX_CATEGORY_KEYS, t.category),
      add_deduct_tax: labelOf(ADD_DEDUCT_KEYS, t.addDeductTax),
      charge_type: labelOf(CHARGE_TYPE_KEYS, t.chargeType),
      row_id: t.rowId == null ? "" : String(t.rowId),
      included_in_print_rate: t.includedInPrintRate ? 1 : 0,
      included_in_paid_amount: t.includedInPaidAmount ? 1 : 0,
      account_head: t.accountHead.code,
      description: t.description ?? t.accountHead.code,
      rate: n(t.rate),
      cost_center: t.costCenter?.code ?? "",
      account_currency: t.accountCurrency ?? "",
      tax_amount: n(t.taxAmount),
      service_price: n(t.servicePrice),
      gst_tax_type: t.gstTaxType ?? "",
    })),
  };
  const company = await db.purchaseCompany.findUnique({ where: { code: o.company.code }, select: { defaultCurrency: true } });
  const { doc: computed } = computeReceipt(doc, await engineMasters(company?.defaultCurrency ?? "INR"));
  return { ok: true, doc: computed };
}
