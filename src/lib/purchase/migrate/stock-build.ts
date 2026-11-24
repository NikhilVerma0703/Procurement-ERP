// ERPNext rows → this schema's rows, for the Stock module's documents (Phase II, owner 21-11-2026).
//
// The same contract as build.ts, of which this is the second half: pure, IDs = importId(kind,
// ERPNext name) so a later backup imports with the same IDs, the whole source row in `legacy`, and
// every gap an `issue` in the reconciliation report — nothing guessed. A link to a master (item,
// warehouse, supplier, customer, PO, PO line, price list, receipt, gate entry…) becomes a foreign
// key only when that record is in this import (Phase I's rows, placeholders included); otherwise
// the ERPNext name stays in the *Code / *Number column, readable, and the gap is reported.
// Amended documents are inserted after their originals (sorted by creation, as build.ts does POs).
import type { Prisma } from "@prisma/client";
import { bool, dateOnly, dec, importId, int, localDateTime, text } from "./convert";
import type { DumpTable, Row, TableSpec } from "./dump";

/** The stock DocTypes whose timelines come across (their Version / Comment / Communication rows). */
export const STOCK_EVENT_DOCTYPES: ReadonlySet<string> = new Set([
  "Purchase Receipt", "Gate Entry", "Landed Cost Voucher", "Material Request", "Stock Entry", "Stock Reconciliation",
  "Delivery Note", "Packing Slip", "Quality Inspection", "Item Price", "Serial No", "Batch",
]);

/** The backup tables the stock import reads. */
export const STOCK_SOURCE_TABLES: readonly TableSpec[] = [
  { table: "tabStock Entry Type" },
  { table: "tabGate Entry" },
  { table: "tabGate Entry Item" },
  { table: "tabPurchase Receipt" },
  { table: "tabPurchase Receipt Item" },
  { table: "tabLanded Cost Voucher" },
  { table: "tabLanded Cost Purchase Receipt" },
  { table: "tabLanded Cost Item" },
  { table: "tabLanded Cost Taxes and Charges" },
  { table: "tabMaterial Request" },
  { table: "tabMaterial Request Item" },
  { table: "tabStock Entry" },
  { table: "tabStock Entry Detail" },
  { table: "tabStock Reconciliation" },
  { table: "tabStock Reconciliation Item" },
  { table: "tabDelivery Note" },
  { table: "tabDelivery Note Item" },
  { table: "tabSales Taxes and Charges", where: (r) => r.parenttype === "Delivery Note" },
  { table: "tabSales Team", where: (r) => r.parenttype === "Delivery Note" },
  { table: "tabSample Item", where: (r) => r.parenttype === "Packing Slip" },
  // tabServices Items is read by build.ts (the PO's and the receipt's rows).
  { table: "tabPacking Slip" },
  { table: "tabPacking Slip Item" },
  { table: "tabStock Ledger Entry" },
  { table: "tabBin" },
  { table: "tabItem Price" },
  { table: "tabSerial No" },
  { table: "tabBatch" },
  { table: "tabQuality Inspection" },
  { table: "tabQuality Inspection Reading" },
];

export interface BuiltStock {
  stockEntryTypes: Prisma.PurchaseStockEntryTypeCreateManyInput[];
  gateEntries: Prisma.PurchaseGateEntryCreateManyInput[];
  gateEntryItems: Prisma.PurchaseGateEntryItemCreateManyInput[];
  receipts: Prisma.PurchaseReceiptCreateManyInput[];
  receiptItems: Prisma.PurchaseReceiptItemCreateManyInput[];
  receiptTaxes: Prisma.PurchaseReceiptTaxCreateManyInput[];
  receiptServiceItems: Prisma.PurchaseReceiptServiceItemCreateManyInput[];
  landedCostVouchers: Prisma.PurchaseLandedCostVoucherCreateManyInput[];
  landedCostReceipts: Prisma.PurchaseLandedCostReceiptCreateManyInput[];
  landedCostItems: Prisma.PurchaseLandedCostItemCreateManyInput[];
  landedCostTaxes: Prisma.PurchaseLandedCostTaxCreateManyInput[];
  materialRequests: Prisma.PurchaseMaterialRequestCreateManyInput[];
  materialRequestItems: Prisma.PurchaseMaterialRequestItemCreateManyInput[];
  stockEntries: Prisma.PurchaseStockEntryCreateManyInput[];
  stockEntryDetails: Prisma.PurchaseStockEntryDetailCreateManyInput[];
  stockReconciliations: Prisma.PurchaseStockReconciliationCreateManyInput[];
  stockReconciliationItems: Prisma.PurchaseStockReconciliationItemCreateManyInput[];
  deliveryNotes: Prisma.PurchaseDeliveryNoteCreateManyInput[];
  deliveryNoteItems: Prisma.PurchaseDeliveryNoteItemCreateManyInput[];
  deliveryNoteTaxes: Prisma.PurchaseDeliveryNoteTaxCreateManyInput[];
  deliveryNoteSalesTeam: Prisma.PurchaseDeliveryNoteSalesTeamCreateManyInput[];
  packingSlips: Prisma.PurchasePackingSlipCreateManyInput[];
  packingSlipItems: Prisma.PurchasePackingSlipItemCreateManyInput[];
  packingSlipSampleItems: Prisma.PurchasePackingSlipSampleItemCreateManyInput[];
  stockLedgerEntries: Prisma.PurchaseStockLedgerEntryCreateManyInput[];
  bins: Prisma.PurchaseBinCreateManyInput[];
  itemPrices: Prisma.PurchaseItemPriceCreateManyInput[];
  serialNos: Prisma.PurchaseSerialNoCreateManyInput[];
  batches: Prisma.PurchaseBatchCreateManyInput[];
  qualityInspections: Prisma.PurchaseQualityInspectionCreateManyInput[];
  qualityInspectionReadings: Prisma.PurchaseQualityInspectionReadingCreateManyInput[];
}

/** The stock tables' insert order: each after what it points at (all after Phase I's tables). */
export const STOCK_INSERT_ORDER = [
  "stockEntryTypes", "gateEntries", "gateEntryItems", "receipts", "receiptItems", "receiptTaxes", "receiptServiceItems",
  "landedCostVouchers", "landedCostReceipts", "landedCostItems", "landedCostTaxes",
  "materialRequests", "materialRequestItems", "stockEntries", "stockEntryDetails",
  "stockReconciliations", "stockReconciliationItems", "deliveryNotes", "deliveryNoteItems", "deliveryNoteTaxes",
  "deliveryNoteSalesTeam", "packingSlips", "packingSlipItems", "packingSlipSampleItems", "stockLedgerEntries", "bins", "itemPrices", "serialNos", "batches",
  "qualityInspections", "qualityInspectionReadings",
] as const satisfies readonly (keyof BuiltStock)[];

/** The Phase I records a stock row may point at, by ERPNext name (what build.ts imported). */
export interface KnownMasters {
  items: ReadonlySet<string>;
  warehouses: ReadonlySet<string>;
  suppliers: ReadonlySet<string>;
  customers: ReadonlySet<string>;
  orders: ReadonlySet<string>;
  orderItems: ReadonlySet<string>;
  priceLists: ReadonlySet<string>;
}

const DOCSTATUS = { "0": "DRAFT", "1": "SUBMITTED", "2": "CANCELLED" } as const;
const docStatusOf = (r: Row) => DOCSTATUS[(r.docstatus ?? "0") as keyof typeof DOCSTATUS] ?? "DRAFT";
const legacyOf = (r: Row): Prisma.InputJsonObject => ({ ...r });
const stamps = (r: Row) => ({
  createdAt: localDateTime(r.creation) ?? undefined,
  updatedAt: localDateTime(r.modified) ?? undefined,
  createdBy: text(r.owner),
  updatedBy: text(r.modified_by),
});
const byCreation = (rows: Row[]) => [...rows].sort((a, b) => (a.creation ?? "").localeCompare(b.creation ?? ""));

/** A Stock Ledger Entry row's columns (the importer's, and an entry a receipt posts here: stock/receipt-submit.ts). */
export function stockLedgerColumns(r: Row, refs: { itemId: string | null; warehouseId: string | null }) {
  const at = localDateTime(r.posting_datetime) ?? localDateTime(`${r.posting_date} ${(r.posting_time ?? "00:00:00").slice(0, 15)}`);
  return {
    erpnextName: r.name!, itemCode: r.item_code ?? "", itemId: refs.itemId,
    warehouseCode: r.warehouse ?? "", warehouseId: refs.warehouseId, postingDate: dateOnly(r.posting_date)!,
    postingTime: r.posting_time ?? "00:00:00", postingDateTime: at!, voucherType: r.voucher_type ?? "", voucherNo: r.voucher_no ?? "",
    voucherDetailNo: text(r.voucher_detail_no), dependantSleVoucherDetailNo: text(r.dependant_sle_voucher_detail_no),
    recalculateRate: bool(r.recalculate_rate), actualQty: dec(r.actual_qty), qtyAfterTransaction: dec(r.qty_after_transaction),
    incomingRate: dec(r.incoming_rate), outgoingRate: dec(r.outgoing_rate), valuationRate: dec(r.valuation_rate),
    stockValue: dec(r.stock_value), stockValueDifference: dec(r.stock_value_difference), stockQueue: text(r.stock_queue),
    companyCode: r.company ?? "", stockUom: text(r.stock_uom), batchNo: text(r.batch_no), serialNo: text(r.serial_no),
    fiscalYear: text(r.fiscal_year), isCancelled: bool(r.is_cancelled), docStatus: docStatusOf(r), legacy: legacyOf(r),
    createdAt: localDateTime(r.creation) ?? undefined, updatedAt: localDateTime(r.modified) ?? undefined, createdBy: text(r.owner),
  };
}

/** A Bin row's columns (the importer's and stock/receipt-submit.ts's). */
export function binColumns(r: Row, refs: { itemId: string | null; warehouseId: string | null }) {
  return {
    erpnextName: r.name!, itemCode: r.item_code ?? "", itemId: refs.itemId,
    warehouseCode: r.warehouse ?? "", warehouseId: refs.warehouseId, actualQty: dec(r.actual_qty),
    plannedQty: dec(r.planned_qty), indentedQty: dec(r.indented_qty), orderedQty: dec(r.ordered_qty), reservedQty: dec(r.reserved_qty),
    reservedQtyForProduction: dec(r.reserved_qty_for_production), reservedQtyForProductionPlan: dec(r.reserved_qty_for_production_plan),
    reservedQtyForSubContract: dec(r.reserved_qty_for_sub_contract), projectedQty: dec(r.projected_qty), stockUom: text(r.stock_uom),
    valuationRate: dec(r.valuation_rate), stockValue: dec(r.stock_value), legacy: legacyOf(r),
  };
}

/** A Gate Entry row's columns (the importer's, and a gate entry saved here: stock/gate-entry-save.ts). */
export function gateEntryColumns(r: Row, refs: { orderId: string | null; supplierId: string | null; amendedFromId: string | null }) {
  return {
    number: r.name!, namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r), amendedFromId: refs.amendedFromId,
    location: text(r.location), orderNumber: r.po_no ?? "", orderId: refs.orderId, orderDate: dateOnly(r.po_date),
    supplierCode: r.supplier ?? "", supplierId: refs.supplierId, invoiceNo: text(r.invoice_no), invoiceDate: dateOnly(r.invoice_date),
    gateEntryDate: dateOnly(r.gate_entry_date), receiptNumber: text(r.inward_no), inwardDate: dateOnly(r.inward_date),
    financialYear: text(r.financial_year), vehicleNo: text(r.vehicle_no), legacy: legacyOf(r), ...stamps(r),
  };
}

/** A Gate Entry Item row's columns (the importer's and gate-entry-save.ts's). */
export function gateEntryItemColumns(r: Row, refs: { orderId: string | null; itemId: string | null; orderItemId: string | null }) {
  return {
    erpnextName: r.name!, idx: int(r.idx), orderNumber: text(r.po_no), orderId: refs.orderId, orderDate: dateOnly(r.po_date),
    itemCode: r.item_code ?? "", itemId: refs.itemId, itemDescription: text(r.item_description), uom: text(r.uom), poQty: dec(r.po_qty),
    itemQty: dec(r.item_qty), balQty: dec(r.bal_qty), orderItemName: text(r.po_item_name), orderItemId: refs.orderItemId, legacy: legacyOf(r),
  };
}

/** A Purchase Receipt row's columns (the importer's, and a receipt saved here: stock/receipt-save.ts). */
export function receiptColumns(r: Row, refs: { supplierId: string | null; amendedFromId: string | null; gateEntryId: string | null }) {
  return {
    number: r.name!, title: text(r.title), namingSeries: r.naming_series ?? "",
    docStatus: docStatusOf(r), status: r.status ?? "Draft", amendedFromId: refs.amendedFromId,
    supplierCode: r.supplier ?? "", supplierId: refs.supplierId, supplierName: text(r.supplier_name),
    supplierDeliveryNote: text(r.supplier_delivery_note), billNo: text(r.bill_no), billDate: dateOnly(r.bill_date),
    postingDate: dateOnly(r.posting_date)!, postingTime: r.posting_time ?? "00:00:00", setPostingTime: bool(r.set_posting_time),
    companyCode: r.company ?? "", currency: r.currency ?? "INR", conversionRate: dec(r.conversion_rate),
    buyingPriceList: text(r.buying_price_list), priceListCurrency: text(r.price_list_currency), plcConversionRate: dec(r.plc_conversion_rate),
    setWarehouse: text(r.set_warehouse), totalQty: dec(r.total_qty), baseTotal: dec(r.base_total), baseNetTotal: dec(r.base_net_total),
    total: dec(r.total), netTotal: dec(r.net_total), taxCategory: text(r.tax_category), taxesAndCharges: text(r.taxes_and_charges),
    baseTaxesAndChargesAdded: dec(r.base_taxes_and_charges_added), baseTotalTaxesAndCharges: dec(r.base_total_taxes_and_charges),
    taxesAndChargesAdded: dec(r.taxes_and_charges_added), totalTaxesAndCharges: dec(r.total_taxes_and_charges),
    applyDiscountOn: text(r.apply_discount_on), additionalDiscountPercentage: dec(r.additional_discount_percentage),
    baseDiscountAmount: dec(r.base_discount_amount), discountAmount: dec(r.discount_amount), baseGrandTotal: dec(r.base_grand_total),
    baseRoundingAdjustment: dec(r.base_rounding_adjustment), baseRoundedTotal: dec(r.base_rounded_total), baseInWords: text(r.base_in_words),
    grandTotal: dec(r.grand_total), roundingAdjustment: dec(r.rounding_adjustment), roundedTotal: dec(r.rounded_total),
    inWords: text(r.in_words), otherChargesCalculation: text(r.other_charges_calculation), supplierAddress: text(r.supplier_address),
    addressDisplay: text(r.address_display), contactPerson: text(r.contact_person), contactDisplay: text(r.contact_display),
    contactMobile: text(r.contact_mobile), contactEmail: text(r.contact_email), shippingAddress: text(r.shipping_address),
    shippingAddressDisplay: text(r.shipping_address_display), billingAddress: text(r.billing_address),
    billingAddressDisplay: text(r.billing_address_display), tcName: text(r.tc_name), terms: text(r.terms),
    letterHead: text(r.letter_head), language: text(r.language), lrDate: dateOnly(r.lr_date), vehicleNo: text(r.vehicle_no),
    modeOfTransport: text(r.mode_of_transport), gstVehicleType: text(r.gst_vehicle_type), supplierGstin: text(r.supplier_gstin),
    gstCategory: text(r.gst_category), companyGstin: text(r.company_gstin), placeOfSupply: text(r.place_of_supply),
    gateEntryCode: text(r.gate_entry), gateEntryId: refs.gateEntryId,
    customModeOfTransport: text(r.custom_mode_of_transport),
    inspectionRequiredBeforePurchase: bool(r.custom_inspection_required_before_purchase), legacy: legacyOf(r), ...stamps(r),
  };
}

/** A receipt row's columns (without its id and receipt). */
export function receiptItemColumns(r: Row, refs: { itemId: string | null; warehouseId: string | null; orderId: string | null; orderItemId: string | null }) {
  return {
    erpnextName: r.name!, idx: int(r.idx),
    itemCode: r.item_code ?? "", itemId: refs.itemId, itemName: text(r.item_name), description: text(r.description),
    itemGroup: text(r.item_group), receivedQty: dec(r.received_qty), qty: dec(r.qty), rejectedQty: dec(r.rejected_qty),
    uom: r.uom ?? "", stockUom: r.stock_uom ?? "", conversionFactor: dec(r.conversion_factor), receivedStockQty: dec(r.received_stock_qty),
    stockQty: dec(r.stock_qty), priceListRate: dec(r.price_list_rate), basePriceListRate: dec(r.base_price_list_rate),
    marginType: text(r.margin_type), marginRateOrAmount: dec(r.margin_rate_or_amount), discountPercentage: dec(r.discount_percentage),
    discountAmount: dec(r.discount_amount), rate: dec(r.rate), amount: dec(r.amount), baseRate: dec(r.base_rate),
    baseAmount: dec(r.base_amount), stockUomRate: dec(r.stock_uom_rate), netRate: dec(r.net_rate), netAmount: dec(r.net_amount),
    baseNetRate: dec(r.base_net_rate), baseNetAmount: dec(r.base_net_amount), itemTaxTemplate: text(r.item_tax_template),
    itemTaxRate: text(r.item_tax_rate), valuationRate: dec(r.valuation_rate), landedCostVoucherAmount: dec(r.landed_cost_voucher_amount),
    warehouseCode: text(r.warehouse), warehouseId: refs.warehouseId, rejectedWarehouse: text(r.rejected_warehouse),
    materialRequest: text(r.material_request), materialRequestItem: text(r.material_request_item), orderNumber: text(r.purchase_order),
    orderId: refs.orderId, orderItemName: text(r.purchase_order_item), orderItemId: refs.orderItemId,
    scheduleDate: dateOnly(r.schedule_date), qualityInspection: text(r.quality_inspection), batchNo: text(r.batch_no),
    serialNo: text(r.serial_no), expenseAccount: text(r.expense_account), costCenter: text(r.cost_center), gstHsnCode: text(r.gst_hsn_code),
    gstTreatment: text(r.gst_treatment), isIneligibleForItc: bool(r.is_ineligible_for_itc), taxableValue: dec(r.taxable_value),
    igstRate: dec(r.igst_rate), cgstRate: dec(r.cgst_rate), sgstRate: dec(r.sgst_rate), igstAmount: dec(r.igst_amount),
    cgstAmount: dec(r.cgst_amount), sgstAmount: dec(r.sgst_amount), bagsQty: dec(r.bags_qty), acceptedBagsNo: text(r.accepted_bags_no),
    addonIgst: dec(r.igst), addonIgstAmt: dec(r.igst_amt), addonCgst: dec(r.cgst), addonCgstAmt: dec(r.cgst_amt),
    addonSgst: dec(r.sgst), addonSgstAmt: dec(r.sgst_amt), legacy: legacyOf(r),
  };
}

/** A receipt tax row's columns (without its id and receipt). */
export function receiptTaxColumns(r: Row) {
  return {
    erpnextName: r.name!, idx: int(r.idx),
    category: text(r.category), addDeductTax: text(r.add_deduct_tax), chargeType: text(r.charge_type), rowId: text(r.row_id),
    includedInPrintRate: bool(r.included_in_print_rate), accountHead: r.account_head ?? "", description: text(r.description),
    rate: dec(r.rate), costCenter: text(r.cost_center), accountCurrency: text(r.account_currency), taxAmount: dec(r.tax_amount),
    taxAmountAfterDiscountAmount: dec(r.tax_amount_after_discount_amount), total: dec(r.total), baseTaxAmount: dec(r.base_tax_amount),
    baseTotal: dec(r.base_total), baseTaxAmountAfterDiscountAmount: dec(r.base_tax_amount_after_discount_amount),
    itemWiseTaxDetail: text(r.item_wise_tax_detail), servicePrice: dec(r.service_price), gstTaxType: text(r.gst_tax_type),
    legacy: legacyOf(r),
  };
}

/** A receipt services row's columns (the add-on's; without its id and receipt). */
export function receiptServiceColumns(r: Row) {
  return {
    erpnextName: r.name!, idx: int(r.idx),
    serviceItem: text(r.service_item), serviceCharges: text(r.service_charges), accountHead: text(r.account_head),
    chargeType: text(r.charge_type), legacy: legacyOf(r),
  };
}

export function buildStock(tables: Map<string, DumpTable>, known: KnownMasters): BuiltStock & { issues: string[] } {
  const issues: string[] = [];
  const rows = (t: string) => tables.get(t)?.rows ?? [];

  /** A link to a master: its ID when the master was imported, else null (reported). */
  const link = (kind: string, set: ReadonlySet<string>, v: string | null | undefined, where: string, what: string): string | null => {
    const name = text(v);
    if (name === null) return null;
    if (set.has(name)) return importId(kind, name);
    issues.push(`${where}: ${what} "${name}" is not in the backup — kept as text, link left empty`);
    return null;
  };
  const item = (v: string | null | undefined, where: string) => link("it", known.items, v, where, "item");
  const warehouse = (v: string | null | undefined, where: string) => link("wh", known.warehouses, v, where, "warehouse");
  const supplier = (v: string | null | undefined, where: string) => link("su", known.suppliers, v, where, "supplier");
  const customer = (v: string | null | undefined, where: string) => link("cu", known.customers, v, where, "customer");
  const order = (v: string | null | undefined, where: string) => link("po", known.orders, v, where, "purchase order");
  const orderItem = (v: string | null | undefined, where: string) => link("poi", known.orderItems, v, where, "PO line");

  /** The IDs of one document type, by ERPNext name. */
  const ids = (t: string, kind: string) => new Map(rows(t).map((r) => [r.name!, importId(kind, r.name!)]));
  /** A same-type link (amended_from, the add-on's material transfer): the ID when that record exists. */
  const self = (map: Map<string, string>, v: string | null | undefined, where: string, what: string) => {
    const name = text(v);
    if (name === null) return null;
    const id = map.get(name);
    if (!id) issues.push(`${where}: ${what} "${name}" is not in the backup — link left empty`);
    return id ?? null;
  };
  /** Child rows whose parent is in the backup; an orphan is reported and left out. */
  const children = (t: string, parents: Map<string, string>, what: string) =>
    rows(t).filter((r) => {
      if (parents.has(r.parent ?? "")) return true;
      issues.push(`${what} ${r.name}: its parent "${r.parent}" is not in the backup — orphan row not imported`);
      return false;
    });

  const out = {} as BuiltStock;

  // Stock Entry Types ---------------------------------------------------------
  const typeIds = ids("tabStock Entry Type", "set");
  out.stockEntryTypes = rows("tabStock Entry Type").map((r) => ({
    id: typeIds.get(r.name!)!, code: r.name!, purpose: r.purpose ?? r.name!, legacy: legacyOf(r),
  }));

  // Gate Entry (the add-on) ---------------------------------------------------
  const gateIds = ids("tabGate Entry", "ge");
  const receiptIds = ids("tabPurchase Receipt", "pr");
  out.gateEntries = byCreation(rows("tabGate Entry")).map((r) => {
    const where = `Gate Entry ${r.name}`;
    return {
      id: gateIds.get(r.name!)!,
      // (the links in the order the importer always looked them up, so its report reads the same)
      ...gateEntryColumns(r, {
        amendedFromId: self(gateIds, r.amended_from, where, "amended from"),
        orderId: order(r.po_no, where), supplierId: supplier(r.supplier, where),
      }),
    };
  });
  out.gateEntryItems = children("tabGate Entry Item", gateIds, "Gate Entry row").map((r) => {
    const where = `Gate Entry ${r.parent} row ${r.idx}`;
    return {
      id: importId("gei", r.name!), gateEntryId: gateIds.get(r.parent!)!,
      ...gateEntryItemColumns(r, { orderId: order(r.po_no, where), itemId: item(r.item_code, where), orderItemId: orderItem(r.po_item_name, where) }),
    };
  });

  // Purchase Receipt ------------------------------------------------------------
  out.receipts = byCreation(rows("tabPurchase Receipt")).map((r) => {
    const where = `Purchase Receipt ${r.name}`;
    return {
      id: receiptIds.get(r.name!)!,
      ...receiptColumns(r, {
        supplierId: supplier(r.supplier, where),
        amendedFromId: self(receiptIds, r.amended_from, where, "amended from"),
        gateEntryId: self(gateIds, r.gate_entry, where, "gate entry"),
      }),
    };
  });
  out.receiptItems = children("tabPurchase Receipt Item", receiptIds, "Purchase Receipt row").map((r) => {
    const where = `Purchase Receipt ${r.parent} row ${r.idx}`;
    return {
      id: importId("pri", r.name!), receiptId: receiptIds.get(r.parent!)!,
      ...receiptItemColumns(r, {
        itemId: item(r.item_code, where), warehouseId: warehouse(r.warehouse, where),
        orderId: order(r.purchase_order, where), orderItemId: orderItem(r.purchase_order_item, where),
      }),
    };
  });
  const receiptTaxRows = rows("tabPurchase Taxes and Charges").filter((r) => r.parenttype === "Purchase Receipt");
  out.receiptTaxes = receiptTaxRows
    .filter((r) => {
      if (receiptIds.has(r.parent ?? "")) return true;
      issues.push(`Purchase Receipt tax row ${r.name}: its receipt "${r.parent}" is not in the backup — orphan row not imported`);
      return false;
    })
    .map((r) => ({ id: importId("prt", r.name!), receiptId: receiptIds.get(r.parent!)!, ...receiptTaxColumns(r) }));

  // The add-on's Services Items on receipts (the PO's are build.ts's Cost Overheads).
  out.receiptServiceItems = rows("tabServices Items")
    .filter((r) => r.parenttype === "Purchase Receipt")
    .filter((r) => {
      if (receiptIds.has(r.parent ?? "")) return true;
      issues.push(`Purchase Receipt services row ${r.name}: its receipt "${r.parent}" is not in the backup — orphan row not imported`);
      return false;
    })
    .map((r) => ({ id: importId("prsi", r.name!), receiptId: receiptIds.get(r.parent!)!, ...receiptServiceColumns(r) }));

  // Landed Cost Voucher -----------------------------------------------------------
  const lcvIds = ids("tabLanded Cost Voucher", "lcv");
  out.landedCostVouchers = rows("tabLanded Cost Voucher").map((r) => ({
    id: lcvIds.get(r.name!)!, number: r.name!, namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r),
    companyCode: r.company ?? "", postingDate: dateOnly(r.posting_date)!, totalTaxesAndCharges: dec(r.total_taxes_and_charges),
    distributeChargesBasedOn: text(r.distribute_charges_based_on), legacy: legacyOf(r), ...stamps(r),
  }));
  const receiptOf = (type: string | null, doc: string | null, where: string) =>
    type === "Purchase Receipt" ? self(receiptIds, doc, where, "purchase receipt") : null;
  out.landedCostReceipts = children("tabLanded Cost Purchase Receipt", lcvIds, "Landed Cost receipt row").map((r) => ({
    id: importId("lcvr", r.name!), erpnextName: r.name!, voucherId: lcvIds.get(r.parent!)!, idx: int(r.idx),
    receiptDocumentType: r.receipt_document_type ?? "", receiptDocument: r.receipt_document ?? "",
    receiptId: receiptOf(r.receipt_document_type, r.receipt_document, `Landed Cost Voucher ${r.parent} row ${r.idx}`),
    supplierCode: text(r.supplier), grandTotal: dec(r.grand_total), legacy: legacyOf(r),
  }));
  out.landedCostItems = children("tabLanded Cost Item", lcvIds, "Landed Cost item row").map((r) => ({
    id: importId("lcvi", r.name!), erpnextName: r.name!, voucherId: lcvIds.get(r.parent!)!, idx: int(r.idx),
    itemCode: r.item_code ?? "", itemId: item(r.item_code, `Landed Cost Voucher ${r.parent} item ${r.idx}`), description: text(r.description),
    receiptDocumentType: r.receipt_document_type ?? "", receiptDocument: r.receipt_document ?? "", qty: dec(r.qty), rate: dec(r.rate),
    amount: dec(r.amount), applicableCharges: dec(r.applicable_charges), receiptItemName: text(r.purchase_receipt_item),
    costCenter: text(r.cost_center), legacy: legacyOf(r),
  }));
  out.landedCostTaxes = children("tabLanded Cost Taxes and Charges", lcvIds, "Landed Cost charge row").map((r) => ({
    id: importId("lcvt", r.name!), erpnextName: r.name!, voucherId: lcvIds.get(r.parent!)!, idx: int(r.idx),
    expenseAccount: text(r.expense_account), accountCurrency: text(r.account_currency), exchangeRate: dec(r.exchange_rate),
    description: text(r.description), amount: dec(r.amount), baseAmount: dec(r.base_amount), legacy: legacyOf(r),
  }));

  // Material Request --------------------------------------------------------------
  const mrIds = ids("tabMaterial Request", "mr");
  out.materialRequests = byCreation(rows("tabMaterial Request")).map((r) => ({
    id: mrIds.get(r.name!)!, number: r.name!, title: text(r.title), namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r),
    status: r.status ?? "Draft", materialRequestType: r.material_request_type ?? "", companyCode: r.company ?? "",
    transactionDate: dateOnly(r.transaction_date)!, scheduleDate: dateOnly(r.schedule_date),
    amendedFromId: self(mrIds, r.amended_from, `Material Request ${r.name}`, "amended from"), setWarehouse: text(r.set_warehouse),
    tcName: text(r.tc_name), terms: text(r.terms), perOrdered: dec(r.per_ordered), perReceived: dec(r.per_received),
    letterHead: text(r.letter_head), legacy: legacyOf(r), ...stamps(r),
  }));
  out.materialRequestItems = children("tabMaterial Request Item", mrIds, "Material Request row").map((r) => {
    const where = `Material Request ${r.parent} row ${r.idx}`;
    return {
      id: importId("mri", r.name!), erpnextName: r.name!, requestId: mrIds.get(r.parent!)!, idx: int(r.idx), itemCode: r.item_code ?? "",
      itemId: item(r.item_code, where), itemName: text(r.item_name), description: text(r.description), itemGroup: text(r.item_group),
      scheduleDate: dateOnly(r.schedule_date), qty: dec(r.qty), uom: r.uom ?? "", stockUom: r.stock_uom ?? "",
      conversionFactor: dec(r.conversion_factor), stockQty: dec(r.stock_qty), fromWarehouse: text(r.from_warehouse),
      warehouseCode: text(r.warehouse), warehouseId: warehouse(r.warehouse, where), projectedQty: dec(r.projected_qty),
      actualQty: dec(r.actual_qty), orderedQty: dec(r.ordered_qty), receivedQty: dec(r.received_qty), rate: dec(r.rate),
      priceListRate: dec(r.price_list_rate), amount: dec(r.amount), expenseAccount: text(r.expense_account),
      costCenter: text(r.cost_center), gstHsnCode: text(r.gst_hsn_code), legacy: legacyOf(r),
    };
  });

  // Stock Entry -------------------------------------------------------------------
  const steIds = ids("tabStock Entry", "ste");
  out.stockEntries = byCreation(rows("tabStock Entry")).map((r) => {
    const where = `Stock Entry ${r.name}`;
    return {
      id: steIds.get(r.name!)!, number: r.name!, namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r),
      stockEntryTypeCode: r.stock_entry_type ?? "", stockEntryTypeId: self(typeIds, r.stock_entry_type, where, "stock entry type"),
      purpose: r.purpose ?? "", workOrder: text(r.work_order), companyCode: r.company ?? "", postingDate: dateOnly(r.posting_date)!,
      postingTime: r.posting_time ?? "00:00:00", setPostingTime: bool(r.set_posting_time), fromBom: bool(r.from_bom),
      useMultiLevelBom: bool(r.use_multi_level_bom), bomNo: text(r.bom_no), fgCompletedQty: dec(r.fg_completed_qty),
      fromWarehouse: text(r.from_warehouse), toWarehouse: text(r.to_warehouse), totalOutgoingValue: dec(r.total_outgoing_value),
      totalIncomingValue: dec(r.total_incoming_value), valueDifference: dec(r.value_difference), totalAmount: dec(r.total_amount),
      letterHead: text(r.letter_head), isOpening: text(r.is_opening), amendedFromId: self(steIds, r.amended_from, where, "amended from"),
      materialTransfer: text(r.custom_material_transfer), legacy: legacyOf(r), ...stamps(r),
    };
  });
  out.stockEntryDetails = children("tabStock Entry Detail", steIds, "Stock Entry row").map((r) => {
    const where = `Stock Entry ${r.parent} row ${r.idx}`;
    return {
      id: importId("sted", r.name!), erpnextName: r.name!, entryId: steIds.get(r.parent!)!, idx: int(r.idx), barcode: text(r.barcode),
      sourceWarehouseCode: text(r.s_warehouse), sourceWarehouseId: warehouse(r.s_warehouse, where),
      targetWarehouseCode: text(r.t_warehouse), targetWarehouseId: warehouse(r.t_warehouse, where), itemCode: r.item_code ?? "",
      itemId: item(r.item_code, where), itemName: text(r.item_name), description: text(r.description), itemGroup: text(r.item_group),
      isFinishedItem: bool(r.is_finished_item), qty: dec(r.qty), transferQty: dec(r.transfer_qty), uom: r.uom ?? "",
      stockUom: r.stock_uom ?? "", conversionFactor: dec(r.conversion_factor), basicRate: dec(r.basic_rate),
      valuationRate: dec(r.valuation_rate), basicAmount: dec(r.basic_amount), amount: dec(r.amount), serialNo: text(r.serial_no),
      batchNo: text(r.batch_no), expenseAccount: text(r.expense_account), costCenter: text(r.cost_center), actualQty: dec(r.actual_qty),
      bomNo: text(r.bom_no), materialRequest: text(r.material_request), materialRequestItem: text(r.material_request_item),
      supplierCode: text(r.custom_supplier), supplierId: supplier(r.custom_supplier, where), woQty: dec(r.custom_wo_qty),
      legacy: legacyOf(r),
    };
  });

  // Stock Reconciliation ----------------------------------------------------------
  const srIds = ids("tabStock Reconciliation", "sr");
  out.stockReconciliations = byCreation(rows("tabStock Reconciliation")).map((r) => ({
    id: srIds.get(r.name!)!, number: r.name!, namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r), companyCode: r.company ?? "",
    purpose: r.purpose ?? "", postingDate: dateOnly(r.posting_date)!, postingTime: r.posting_time ?? "00:00:00",
    setPostingTime: bool(r.set_posting_time), setWarehouse: text(r.set_warehouse), expenseAccount: text(r.expense_account),
    differenceAmount: dec(r.difference_amount), costCenter: text(r.cost_center),
    amendedFromId: self(srIds, r.amended_from, `Stock Reconciliation ${r.name}`, "amended from"), supplierCode: text(r.custom_supplier),
    description: text(r.custom_description), legacy: legacyOf(r), ...stamps(r),
  }));
  out.stockReconciliationItems = children("tabStock Reconciliation Item", srIds, "Stock Reconciliation row").map((r) => {
    const where = `Stock Reconciliation ${r.parent} row ${r.idx}`;
    return {
      id: importId("sri", r.name!), erpnextName: r.name!, reconciliationId: srIds.get(r.parent!)!, idx: int(r.idx), barcode: text(r.barcode),
      itemCode: r.item_code ?? "", itemId: item(r.item_code, where), itemName: text(r.item_name), itemGroup: text(r.item_group),
      warehouseCode: r.warehouse ?? "", warehouseId: warehouse(r.warehouse, where), qty: dec(r.qty), valuationRate: dec(r.valuation_rate),
      amount: dec(r.amount), batchNo: text(r.batch_no), serialNo: text(r.serial_no), currentQty: dec(r.current_qty),
      currentAmount: dec(r.current_amount), currentValuationRate: dec(r.current_valuation_rate), currentSerialNo: text(r.current_serial_no),
      quantityDifference: text(r.quantity_difference), amountDifference: dec(r.amount_difference), legacy: legacyOf(r),
    };
  });

  // Delivery Note -----------------------------------------------------------------
  const dnIds = ids("tabDelivery Note", "dn");
  out.deliveryNotes = byCreation(rows("tabDelivery Note")).map((r) => {
    const where = `Delivery Note ${r.name}`;
    return {
      id: dnIds.get(r.name!)!, number: r.name!, title: text(r.title), namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r),
      status: r.status ?? "Draft", amendedFromId: self(dnIds, r.amended_from, where, "amended from"), customerCode: r.customer ?? "",
      customerId: customer(r.customer, where), customerName: text(r.customer_name), postingDate: dateOnly(r.posting_date)!,
      postingTime: r.posting_time ?? "00:00:00", setPostingTime: bool(r.set_posting_time), companyCode: r.company ?? "",
      currency: r.currency ?? "INR", conversionRate: dec(r.conversion_rate), sellingPriceList: text(r.selling_price_list),
      priceListCurrency: text(r.price_list_currency), plcConversionRate: dec(r.plc_conversion_rate), totalQty: dec(r.total_qty),
      baseTotal: dec(r.base_total), baseNetTotal: dec(r.base_net_total), total: dec(r.total), netTotal: dec(r.net_total),
      taxCategory: text(r.tax_category), taxesAndCharges: text(r.taxes_and_charges), baseTotalTaxesAndCharges: dec(r.base_total_taxes_and_charges),
      totalTaxesAndCharges: dec(r.total_taxes_and_charges), applyDiscountOn: text(r.apply_discount_on),
      baseDiscountAmount: dec(r.base_discount_amount), discountAmount: dec(r.discount_amount), baseGrandTotal: dec(r.base_grand_total),
      baseRoundingAdjustment: dec(r.base_rounding_adjustment), baseRoundedTotal: dec(r.base_rounded_total), baseInWords: text(r.base_in_words),
      grandTotal: dec(r.grand_total), roundingAdjustment: dec(r.rounding_adjustment), roundedTotal: dec(r.rounded_total),
      inWords: text(r.in_words), otherChargesCalculation: text(r.other_charges_calculation), customerAddress: text(r.customer_address),
      addressDisplay: text(r.address_display), contactPerson: text(r.contact_person), contactDisplay: text(r.contact_display),
      contactMobile: text(r.contact_mobile), contactEmail: text(r.contact_email), shippingAddressName: text(r.shipping_address_name),
      shippingAddress: text(r.shipping_address), dispatchAddressName: text(r.dispatch_address_name), dispatchAddress: text(r.dispatch_address),
      companyAddress: text(r.company_address), companyAddressDisplay: text(r.company_address_display), tcName: text(r.tc_name),
      terms: text(r.terms), perBilled: dec(r.per_billed), installationStatus: text(r.installation_status), lrNo: text(r.lr_no),
      lrDate: dateOnly(r.lr_date), vehicleNo: text(r.vehicle_no), poNo: text(r.po_no), poDate: dateOnly(r.po_date),
      letterHead: text(r.letter_head), language: text(r.language), customerGroup: text(r.customer_group), territory: text(r.territory),
      isExportWithGst: bool(r.is_export_with_gst), billingAddressGstin: text(r.billing_address_gstin), gstCategory: text(r.gst_category),
      placeOfSupply: text(r.place_of_supply), companyGstin: text(r.company_gstin), modeOfTransport: text(r.mode_of_transport),
      gstVehicleType: text(r.gst_vehicle_type), legacy: legacyOf(r), ...stamps(r),
    };
  });
  out.deliveryNoteItems = children("tabDelivery Note Item", dnIds, "Delivery Note row").map((r) => {
    const where = `Delivery Note ${r.parent} row ${r.idx}`;
    return {
      id: importId("dni", r.name!), erpnextName: r.name!, deliveryNoteId: dnIds.get(r.parent!)!, idx: int(r.idx), itemCode: r.item_code ?? "",
      itemId: item(r.item_code, where), itemName: text(r.item_name), description: text(r.description), itemGroup: text(r.item_group),
      qty: dec(r.qty), stockUom: r.stock_uom ?? "", uom: r.uom ?? "", conversionFactor: dec(r.conversion_factor), stockQty: dec(r.stock_qty),
      priceListRate: dec(r.price_list_rate), basePriceListRate: dec(r.base_price_list_rate), marginType: text(r.margin_type),
      marginRateOrAmount: dec(r.margin_rate_or_amount), discountAmount: dec(r.discount_amount), rate: dec(r.rate), amount: dec(r.amount),
      baseRate: dec(r.base_rate), baseAmount: dec(r.base_amount), stockUomRate: dec(r.stock_uom_rate), netRate: dec(r.net_rate),
      netAmount: dec(r.net_amount), itemTaxTemplate: text(r.item_tax_template), baseNetRate: dec(r.base_net_rate),
      baseNetAmount: dec(r.base_net_amount), billedAmt: dec(r.billed_amt), incomingRate: dec(r.incoming_rate),
      warehouseCode: text(r.warehouse), warehouseId: warehouse(r.warehouse, where), againstSalesOrder: text(r.against_sales_order),
      soDetail: text(r.so_detail), batchNo: text(r.batch_no), serialNo: text(r.serial_no), actualBatchQty: dec(r.actual_batch_qty),
      actualQty: dec(r.actual_qty), itemTaxRate: text(r.item_tax_rate), packedQty: dec(r.packed_qty), expenseAccount: text(r.expense_account),
      costCenter: text(r.cost_center), gstHsnCode: text(r.gst_hsn_code), gstTreatment: text(r.gst_treatment),
      taxableValue: dec(r.taxable_value), igstRate: dec(r.igst_rate), igstAmount: dec(r.igst_amount), uomFactor: text(r.uom_factor),
      quantity: dec(r.quantity), areaRate: dec(r.area_rate), rateInUsd: text(r.rate_in_usd), legacy: legacyOf(r),
    };
  });
  out.deliveryNoteTaxes = children("tabSales Taxes and Charges", dnIds, "Delivery Note tax row").map((r) => ({
    id: importId("dnt", r.name!), erpnextName: r.name!, deliveryNoteId: dnIds.get(r.parent!)!, idx: int(r.idx),
    chargeType: text(r.charge_type), rowId: text(r.row_id), includedInPrintRate: bool(r.included_in_print_rate),
    accountHead: r.account_head ?? "", description: text(r.description), rate: dec(r.rate), costCenter: text(r.cost_center),
    accountCurrency: text(r.account_currency), taxAmount: dec(r.tax_amount), taxAmountAfterDiscountAmount: dec(r.tax_amount_after_discount_amount),
    total: dec(r.total), baseTaxAmount: dec(r.base_tax_amount), baseTotal: dec(r.base_total),
    baseTaxAmountAfterDiscountAmount: dec(r.base_tax_amount_after_discount_amount), itemWiseTaxDetail: text(r.item_wise_tax_detail),
    gstTaxType: text(r.gst_tax_type), legacy: legacyOf(r),
  }));

  out.deliveryNoteSalesTeam = children("tabSales Team", dnIds, "Delivery Note sales team row").map((r) => ({
    id: importId("dnst", r.name!), erpnextName: r.name!, deliveryNoteId: dnIds.get(r.parent!)!, idx: int(r.idx),
    salesPerson: text(r.sales_person), contactNo: text(r.contact_no), allocatedPercentage: dec(r.allocated_percentage),
    allocatedAmount: dec(r.allocated_amount), commissionRate: text(r.commission_rate), incentives: dec(r.incentives), legacy: legacyOf(r),
  }));

  // Packing Slip ------------------------------------------------------------------
  const psIds = ids("tabPacking Slip", "ps");
  out.packingSlips = byCreation(rows("tabPacking Slip")).map((r) => {
    const where = `Packing Slip ${r.name}`;
    return {
      id: psIds.get(r.name!)!, number: r.name!, namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r),
      deliveryNoteCode: r.delivery_note ?? "", deliveryNoteId: self(dnIds, r.delivery_note, where, "delivery note"),
      fromCaseNo: int(r.from_case_no), toCaseNo: int(r.to_case_no), netWeightPkg: dec(r.net_weight_pkg),
      grossWeightPkg: dec(r.gross_weight_pkg), letterHead: text(r.letter_head), amendedFromId: self(psIds, r.amended_from, where, "amended from"),
      noOfSlabs: int(r.no_of_slabes), netAreaSqmt: dec(r.custom_net_area_sqmt), legacy: legacyOf(r), ...stamps(r),
    };
  });
  out.packingSlipItems = children("tabPacking Slip Item", psIds, "Packing Slip row").map((r) => ({
    id: importId("psi", r.name!), erpnextName: r.name!, packingSlipId: psIds.get(r.parent!)!, idx: int(r.idx), itemCode: r.item_code ?? "",
    itemId: item(r.item_code, `Packing Slip ${r.parent} row ${r.idx}`), itemName: text(r.item_name), batchNo: text(r.batch_no),
    description: text(r.description), qty: dec(r.qty), netWeight: dec(r.net_weight), stockUom: text(r.stock_uom), dnDetail: text(r.dn_detail),
    serialNo: text(r.custom_serial_no), grade: text(r.custom_grade), quantity: dec(r.quantity), crate: text(r.crate),
    crateDimension: text(r.crate_dimension), length: text(r.custom_lenght), width: text(r.custom_width), thickness: text(r.custom_thickness),
    crateWeight: dec(r.custom_crate_weight), itemDescription: text(r.custom_item_description_), legacy: legacyOf(r),
  }));

  out.packingSlipSampleItems = children("tabSample Item", psIds, "Packing Slip sample row").map((r) => ({
    id: importId("pssi", r.name!), erpnextName: r.name!, packingSlipId: psIds.get(r.parent!)!, idx: int(r.idx),
    itemCode: text(r.item_code), itemName: text(r.item_name), qty: dec(r.qty), colour: text(r.colour), thick: text(r.thick),
    sqft: dec(r.sqft), sqmt: dec(r.sqmt), crate: text(r.crate), netWeight: dec(r.net_weight), length: text(r.length),
    width: text(r.width), legacy: legacyOf(r),
  }));

  // The stock books ---------------------------------------------------------------
  out.stockLedgerEntries = rows("tabStock Ledger Entry").map((r) => {
    const where = `Stock Ledger Entry ${r.name}`;
    return { id: importId("sle", r.name!), ...stockLedgerColumns(r, { itemId: item(r.item_code, where), warehouseId: warehouse(r.warehouse, where) }) };
  });
  out.bins = rows("tabBin").map((r) => {
    const where = `Bin ${r.name}`;
    return { id: importId("bin", r.name!), ...binColumns(r, { itemId: item(r.item_code, where), warehouseId: warehouse(r.warehouse, where) }) };
  });
  out.itemPrices = rows("tabItem Price").map((r) => {
    const where = `Item Price ${r.name}`;
    return {
      id: importId("ip", r.name!), erpnextName: r.name!, itemCode: r.item_code ?? "", itemId: item(r.item_code, where), uom: text(r.uom),
      itemName: text(r.item_name), itemDescription: text(r.item_description), priceListCode: r.price_list ?? "",
      priceListId: link("pl", known.priceLists, r.price_list, where, "price list"), customerCode: text(r.customer),
      supplierCode: text(r.supplier), supplierId: supplier(r.supplier, where), buying: bool(r.buying), selling: bool(r.selling),
      currency: text(r.currency), priceListRate: dec(r.price_list_rate), validFrom: dateOnly(r.valid_from), validUpto: dateOnly(r.valid_upto),
      reference: text(r.reference), uomFactor: text(r.uom_factor), legacy: legacyOf(r), ...stamps(r),
    };
  });
  out.serialNos = rows("tabSerial No").map((r) => {
    const where = `Serial No ${r.name}`;
    return {
      id: importId("sn", r.name!), code: r.name!, itemCode: r.item_code ?? "", itemId: item(r.item_code, where),
      warehouseCode: text(r.warehouse), warehouseId: warehouse(r.warehouse, where), batchNo: text(r.batch_no), itemName: text(r.item_name),
      description: text(r.description), itemGroup: text(r.item_group), purchaseDocumentType: text(r.purchase_document_type),
      purchaseDocumentNo: text(r.purchase_document_no), purchaseDate: dateOnly(r.purchase_date), purchaseTime: text(r.purchase_time),
      purchaseRate: dec(r.purchase_rate), deliveryDocumentType: text(r.delivery_document_type), deliveryDocumentNo: text(r.delivery_document_no),
      deliveryDate: dateOnly(r.delivery_date), deliveryTime: text(r.delivery_time), customerCode: text(r.customer),
      customerName: text(r.customer_name), salesInvoice: text(r.sales_invoice), companyCode: r.company ?? "", status: r.status ?? "",
      isScrap: bool(r.custom_is_scrap), length: text(r.custom_length), width: text(r.custom_width), weight: text(r.custom_weight),
      defects: text(r.custom_defects), colorCode: text(r.custom_color_code), thickness: text(r.custom_thickness), grade: text(r.custom_grade),
      remarks: text(r.custom_remarks), legacy: legacyOf(r), ...stamps(r),
    };
  });
  out.batches = rows("tabBatch").map((r) => ({
    id: importId("bt", r.name!), code: r.name!, itemCode: r.item ?? "", itemId: item(r.item, `Batch ${r.name}`), itemName: text(r.item_name),
    manufacturingDate: dateOnly(r.manufacturing_date), batchQty: dec(r.batch_qty), stockUom: text(r.stock_uom),
    useBatchwiseValuation: bool(r.use_batchwise_valuation), legacy: legacyOf(r), ...stamps(r),
  }));

  // Quality Inspection --------------------------------------------------------------
  const qiIds = ids("tabQuality Inspection", "qi");
  out.qualityInspections = byCreation(rows("tabQuality Inspection")).map((r) => {
    const where = `Quality Inspection ${r.name}`;
    return {
      id: qiIds.get(r.name!)!, number: r.name!, namingSeries: r.naming_series ?? "", docStatus: docStatusOf(r),
      reportDate: dateOnly(r.report_date)!, status: r.status ?? "", manualInspection: bool(r.manual_inspection),
      inspectionType: r.inspection_type ?? "", referenceType: r.reference_type ?? "", referenceName: r.reference_name ?? "",
      itemCode: r.item_code ?? "", itemId: item(r.item_code, where), itemSerialNo: text(r.item_serial_no), batchNo: text(r.batch_no),
      sampleSize: dec(r.sample_size), itemName: text(r.item_name), description: text(r.description), inspectedBy: text(r.inspected_by),
      verifiedBy: text(r.verified_by), amendedFromId: self(qiIds, r.amended_from, where, "amended from"), legacy: legacyOf(r), ...stamps(r),
    };
  });
  out.qualityInspectionReadings = children("tabQuality Inspection Reading", qiIds, "Quality Inspection reading").map((r) => ({
    id: importId("qir", r.name!), erpnextName: r.name!, inspectionId: qiIds.get(r.parent!)!, idx: int(r.idx),
    specification: r.specification ?? "", status: text(r.status), numeric: bool(r.numeric), bagWeight: dec(r.bag_weight),
    itemStatus: text(r.item_status), legacy: legacyOf(r),
  }));

  return { ...out, issues };
}
