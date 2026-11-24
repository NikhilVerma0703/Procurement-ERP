// ERPNext rows → this schema's rows, for the whole Purchase Order ecosystem.
//
// Pure: takes the tables read by ./dump and returns what to insert, in insert
// order, plus every issue met on the way. Nothing is guessed silently — an
// unknown enum label, a link to a record that is not in the backup, an
// unreadable number all become `issues` in the reconciliation report. Links
// that a row cannot exist without (a PO's supplier, a line's item, a tax
// row's account, a unit) are created as placeholder records and reported, so
// no PO is ever dropped; optional links are left empty and reported.
//
// IDs are importId(kind, ERPNext name): a later backup imports with the same
// IDs. Every migrated record keeps its whole source row in `legacy`.
import type { Prisma } from "@prisma/client";
import {
  ADD_DEDUCT_KEYS, CHARGE_TYPE_KEYS, DISCOUNT_ON_KEYS, MARGIN_TYPE_KEYS, PO_STATUS_KEYS, TAX_CATEGORY_KEYS,
} from "../orders/labels";
import { MODES_OF_TRANSPORT, PURPOSES, SHIPMENT_TYPES } from "../orders/options";
import type { DumpTable, Row, TableSpec } from "./dump";
import { buildStock, STOCK_EVENT_DOCTYPES, STOCK_INSERT_ORDER, STOCK_SOURCE_TABLES, type BuiltStock } from "./stock-build";
import {
  bool,
  dateOnly,
  dec,
  decOrNull,
  enumOf,
  importId,
  int,
  intOrNull,
  jsonOf,
  localDateTime,
  text,
} from "./convert";

const PO = "Purchase Order";
/** The naming series imported with their counters: the PO's, and the stock documents' (Phase II). */
const STOCK_SERIES = ["PUR-ORD/", "GE-", "PR/", "MAT-MR-", "MAT-STE", "MAT-LCV-", "MAT-RECO-", "MAT-QA", "DN/", "MAT-PAC-"];
const parentIs = (doctype: string) => (r: Row) => r.parenttype === doctype;

/** The backup tables the import reads (and how they are narrowed while reading). */
export const SOURCE_TABLES: readonly TableSpec[] = [
  { table: "tabCompany" },
  { table: "tabCurrency" },
  { table: "tabCurrency Exchange" },
  { table: "tabUOM" },
  { table: "tabPrice List" },
  { table: "tabTax Category" },
  { table: "tabAccount" },
  { table: "tabCost Center" },
  { table: "tabWarehouse" },
  { table: "tabLetter Head" },
  // The PO series, and (Phase II) the stock documents' series, so their numbering carries on.
  { table: "tabSeries", where: (r) => STOCK_SERIES.some((p) => (r.name ?? "").startsWith(p)) },
  { table: "tabPurchase Taxes and Charges Template" },
  // PO and template rows (Phase I), receipt rows (Phase II, stock-build.ts); each use filters by parenttype.
  { table: "tabPurchase Taxes and Charges", where: (r) => r.parenttype === PO || r.parenttype === "Purchase Taxes and Charges Template" || r.parenttype === "Purchase Receipt" },
  { table: "tabItem Tax Template" },
  { table: "tabItem Tax Template Detail" },
  { table: "tabPayment Term" },
  { table: "tabPayment Terms Template" },
  { table: "tabPayment Terms Template Detail" },
  { table: "tabTerms and Conditions" },
  { table: "tabSupplier Group" },
  { table: "tabSupplier" },
  { table: "tabCustomer" },
  { table: "tabAddress" },
  { table: "tabContact" },
  { table: "tabContact Email", where: parentIs("Contact") },
  { table: "tabContact Phone", where: parentIs("Contact") },
  { table: "tabDynamic Link", where: (r) => r.parenttype === "Address" || r.parenttype === "Contact" },
  { table: "tabItem Group" },
  { table: "tabItem" },
  { table: "tabUOM Conversion Detail", where: parentIs("Item") },
  { table: "tabItem Default", where: parentIs("Item") },
  { table: "tabItem Tax", where: parentIs("Item") },
  // The Item screen's variants (Step 8): attributes, their values, and each item's attribute rows.
  { table: "tabItem Attribute" },
  { table: "tabItem Attribute Value", where: parentIs("Item Attribute") },
  { table: "tabItem Variant Attribute", where: parentIs("Item") },
  // India Compliance's HSN/SAC list, which an item's HSN/SAC links to.
  { table: "tabGST HSN Code", columns: ["name", "hsn_code", "description"] },
  { table: "tabPurchase Order" },
  { table: "tabPurchase Order Item", where: parentIs(PO) },
  // The PO's (its Cost Overheads, below) and the receipt's (stock-build.ts); each use filters by parenttype.
  { table: "tabServices Items", where: (r) => r.parenttype === PO || r.parenttype === "Purchase Receipt" },
  { table: "tabPayment Schedule", where: parentIs(PO) },
  // tabPurchase Receipt, its lines and tabMaterial Request are read whole by STOCK_SOURCE_TABLES
  // (Phase II imports them); the PO's Connections below use the lines that name a PO.
  { table: "tabPurchase Invoice", columns: ["name", "posting_date", "docstatus", "status"] },
  {
    table: "tabPurchase Invoice Item",
    where: (r) => !!r.purchase_order,
    columns: ["name", "parent", "idx", "purchase_order", "po_detail", "item_code", "qty", "amount", "docstatus"],
  },
  // The PO's timeline, and (Phase II) the stock documents' (docEvents below).
  { table: "tabVersion", where: (r) => r.ref_doctype === PO || STOCK_EVENT_DOCTYPES.has(r.ref_doctype ?? "") },
  { table: "tabComment", where: (r) => r.reference_doctype === PO || STOCK_EVENT_DOCTYPES.has(r.reference_doctype ?? "") },
  { table: "tabCommunication", where: (r) => r.reference_doctype === PO || STOCK_EVENT_DOCTYPES.has(r.reference_doctype ?? "") },
  { table: "tabFile", where: (r) => r.attached_to_doctype === PO },
  { table: "tabUser" },
  { table: "tabHas Role", where: parentIs("User") },
  // Phase II: the Stock module's documents, read whole (stock-build.ts).
  ...STOCK_SOURCE_TABLES,
];

// ERPNext labels → enum keys -------------------------------------------------
const DOCSTATUS = { "0": "DRAFT", "1": "SUBMITTED", "2": "CANCELLED" } as const;
const WORKFLOW = { Created: "CREATED", Approved: "APPROVED", Rejected: "REJECTED" } as const;
const STATUS = PO_STATUS_KEYS;
const DISCOUNT_ON = DISCOUNT_ON_KEYS;
const CHARGE = CHARGE_TYPE_KEYS;
const CONSIDER = TAX_CATEGORY_KEYS;
const ADD_DEDUCT = ADD_DEDUCT_KEYS;
const MARGIN = MARGIN_TYPE_KEYS;
const COMMENT_KIND = {
  Label: "LABEL", Workflow: "WORKFLOW", Deleted: "DELETED", Attachment: "ATTACHMENT", Comment: "COMMENT", Info: "INFO",
  "Attachment Removed": "ATTACHMENT", Edit: "INFO", Like: "INFO", Shared: "INFO", Unshared: "INFO", Assigned: "INFO",
  "Assignment Completed": "INFO", Cancelled: "INFO", Updated: "INFO",
} as const;

/** Columns of tabUser that hold tokens or tracking data, kept out of `legacy`. */
const USER_PRIVATE = new Set(["api_key", "reset_password_key", "last_reset_password_key_generated_on", "last_ip", "login_after", "login_before", "restrict_ip"]);

export interface Built extends BuiltStock {
  companies: Prisma.PurchaseCompanyCreateManyInput[];
  currencies: Prisma.PurchaseCurrencyCreateManyInput[];
  currencyExchanges: Prisma.PurchaseCurrencyExchangeCreateManyInput[];
  uoms: Prisma.PurchaseUomCreateManyInput[];
  priceLists: Prisma.PurchasePriceListCreateManyInput[];
  taxCategories: Prisma.PurchaseTaxCategoryCreateManyInput[];
  accounts: Prisma.PurchaseAccountCreateManyInput[];
  costCenters: Prisma.PurchaseCostCenterCreateManyInput[];
  warehouses: Prisma.PurchaseWarehouseCreateManyInput[];
  letterHeads: Prisma.PurchaseLetterHeadCreateManyInput[];
  namingSeries: Prisma.PurchaseNamingSeriesCreateManyInput[];
  taxTemplates: Prisma.PurchaseTaxTemplateCreateManyInput[];
  taxTemplateRows: Prisma.PurchaseTaxTemplateRowCreateManyInput[];
  itemTaxTemplates: Prisma.PurchaseItemTaxTemplateCreateManyInput[];
  itemTaxTemplateRates: Prisma.PurchaseItemTaxTemplateRateCreateManyInput[];
  paymentTerms: Prisma.PurchasePaymentTermCreateManyInput[];
  paymentTermsTemplates: Prisma.PurchasePaymentTermsTemplateCreateManyInput[];
  paymentTermsTemplateRows: Prisma.PurchasePaymentTermsTemplateRowCreateManyInput[];
  termsTemplates: Prisma.PurchaseTermsTemplateCreateManyInput[];
  supplierGroups: Prisma.PurchaseSupplierGroupCreateManyInput[];
  addresses: Prisma.PurchaseAddressCreateManyInput[];
  contacts: Prisma.PurchaseContactCreateManyInput[];
  contactEmails: Prisma.PurchaseContactEmailCreateManyInput[];
  contactPhones: Prisma.PurchaseContactPhoneCreateManyInput[];
  customers: Prisma.PurchaseCustomerCreateManyInput[];
  suppliers: Prisma.PurchaseSupplierCreateManyInput[];
  addressLinks: Prisma.PurchaseAddressLinkCreateManyInput[];
  contactLinks: Prisma.PurchaseContactLinkCreateManyInput[];
  itemGroups: Prisma.PurchaseItemGroupCreateManyInput[];
  items: Prisma.PurchaseItemCreateManyInput[];
  itemUomConversions: Prisma.PurchaseItemUomConversionCreateManyInput[];
  itemDefaults: Prisma.PurchaseItemDefaultCreateManyInput[];
  itemTaxes: Prisma.PurchaseItemTaxCreateManyInput[];
  itemAttributes: Prisma.PurchaseItemAttributeCreateManyInput[];
  itemAttributeValues: Prisma.PurchaseItemAttributeValueCreateManyInput[];
  itemVariantAttributes: Prisma.PurchaseItemVariantAttributeCreateManyInput[];
  hsnCodes: Prisma.PurchaseHsnCodeCreateManyInput[];
  orders: Prisma.PurchaseOrderCreateManyInput[];
  likes: Prisma.PurchaseLikeCreateManyInput[];
  orderItems: Prisma.PurchaseOrderItemCreateManyInput[];
  orderTaxes: Prisma.PurchaseOrderTaxCreateManyInput[];
  orderCostOverheads: Prisma.PurchaseOrderCostOverheadCreateManyInput[];
  orderPaymentSchedules: Prisma.PurchaseOrderPaymentScheduleCreateManyInput[];
  orderLinks: Prisma.PurchaseOrderLinkCreateManyInput[];
  orderEvents: Prisma.PurchaseOrderEventCreateManyInput[];
  /** Phase II: the stock documents' timelines. */
  docEvents: Prisma.PurchaseDocEventCreateManyInput[];
  attachments: Prisma.PurchaseAttachmentCreateManyInput[];
  users: Prisma.PurchaseUserCreateManyInput[];
  /** Source row counts, as the reconciliation compares them. */
  sourceCounts: Record<string, number>;
  issues: string[];
}

/** The insert order: every table after the ones it points at. */
export const INSERT_ORDER = [
  "companies", "currencies", "currencyExchanges", "uoms", "priceLists", "taxCategories", "accounts", "costCenters",
  "warehouses", "letterHeads", "namingSeries", "taxTemplates", "taxTemplateRows", "itemTaxTemplates",
  "itemTaxTemplateRates", "paymentTerms", "paymentTermsTemplates", "paymentTermsTemplateRows", "termsTemplates",
  "supplierGroups", "addresses", "contacts", "contactEmails", "contactPhones", "customers", "suppliers",
  "addressLinks", "contactLinks", "itemGroups", "items", "itemUomConversions", "itemDefaults", "itemTaxes",
  "itemAttributes", "itemAttributeValues", "itemVariantAttributes", "hsnCodes",
  "orders", "orderItems", "orderTaxes", "orderCostOverheads", "orderPaymentSchedules", "orderLinks",
  "orderEvents", "docEvents", "attachments", "users", "likes",
  // Phase II: the Stock module's documents (stock-build.ts), after every master they point at.
  ...STOCK_INSERT_ORDER,
] as const satisfies readonly (keyof Built)[];

const legacyOf = (r: Row, drop?: Set<string>): Prisma.InputJsonObject => {
  const o: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(r)) if (!drop?.has(k)) o[k] = v;
  return o;
};

export function build(tables: Map<string, DumpTable>): Built {
  const issues: string[] = [];
  const rows = (t: string) => tables.get(t)?.rows ?? [];
  const req = (r: Row, col: string, where: string): string => {
    const v = text(r[col]);
    if (v === null) {
      issues.push(`${where}: ${col} is empty`);
      return "";
    }
    return v;
  };
  const idMap = (t: string, kind: string) => new Map(rows(t).map((r) => [r.name!, importId(kind, r.name!)]));
  const opt = (map: Map<string, string>, v: string | null | undefined, where: string): string | null => {
    const t = text(v);
    if (t === null) return null;
    const id = map.get(t);
    if (!id) issues.push(`${where}: "${t}" is not in the backup — link left empty`);
    return id ?? null;
  };
  const stamps = (r: Row) => ({ createdAt: localDateTime(r.creation) ?? undefined, updatedAt: localDateTime(r.modified) ?? undefined });
  const byOf = (r: Row) => ({ createdBy: text(r.owner), updatedBy: text(r.modified_by) });
  /** A child row whose parent (or required link) is not in the backup cannot be stored: say so. */
  const keep = (ok: boolean, why: string) => {
    if (!ok) issues.push(why);
    return ok;
  };
  /** A Select field's value, kept as recorded; one no longer offered is noted, not changed. */
  const selectText = (options: readonly string[], v: string | null | undefined, where: string) => {
    const t = text(v);
    if (t !== null && !options.includes(t)) issues.push(`${where}: "${t}" is no longer an option — kept as recorded`);
    return t;
  };

  const out = {} as Built;

  // Company and lookups -----------------------------------------------------
  const companyIds = idMap("tabCompany", "co");
  out.companies = rows("tabCompany").map((r) => ({
    id: companyIds.get(r.name!)!, code: r.name!, abbr: req(r, "abbr", `Company ${r.name}`), country: text(r.country),
    defaultCurrency: text(r.default_currency), taxId: text(r.tax_id), legacy: legacyOf(r), ...stamps(r),
  }));

  const currencyCodes = new Set(rows("tabCurrency").map((r) => r.name!));
  out.currencies = rows("tabCurrency").map((r) => ({
    code: r.name!, symbol: text(r.symbol), fraction: text(r.fraction), fractionUnits: intOrNull(r.fraction_units),
    smallestCurrencyFractionValue: decOrNull(r.smallest_currency_fraction_value), numberFormat: text(r.number_format),
    enabled: bool(r.enabled),
  }));
  const ensureCurrency = (code: string, where: string) => {
    if (code && !currencyCodes.has(code)) {
      issues.push(`${where}: currency "${code}" missing — placeholder added`);
      currencyCodes.add(code);
      out.currencies.push({ code, enabled: false });
    }
    return code;
  };
  out.currencyExchanges = rows("tabCurrency Exchange").map((r) => ({
    id: importId("cx", r.name!), code: r.name!, date: dateOnly(r.date)!,
    fromCurrency: ensureCurrency(r.from_currency!, `Currency Exchange ${r.name}`),
    toCurrency: ensureCurrency(r.to_currency!, `Currency Exchange ${r.name}`), exchangeRate: dec(r.exchange_rate),
    forBuying: bool(r.for_buying), forSelling: bool(r.for_selling),
  }));

  const uomNames = new Set(rows("tabUOM").map((r) => r.name!));
  out.uoms = rows("tabUOM").map((r) => ({ name: r.name!, mustBeWholeNumber: bool(r.must_be_whole_number), enabled: bool(r.enabled) }));
  const ensureUom = (name: string | null, where: string): string => {
    const n = text(name) ?? "Nos";
    if (!uomNames.has(n)) {
      issues.push(`${where}: unit "${n}" missing — placeholder added`);
      uomNames.add(n);
      out.uoms.push({ name: n, enabled: false });
    }
    return n;
  };

  const priceListIds = idMap("tabPrice List", "pl");
  out.priceLists = rows("tabPrice List").map((r) => ({
    id: priceListIds.get(r.name!)!, code: r.name!, currency: ensureCurrency(req(r, "currency", `Price List ${r.name}`), `Price List ${r.name}`),
    buying: bool(r.buying), selling: bool(r.selling), enabled: bool(r.enabled), legacy: legacyOf(r),
  }));

  const taxCategoryIds = idMap("tabTax Category", "tc");
  out.taxCategories = rows("tabTax Category").map((r) => ({ id: taxCategoryIds.get(r.name!)!, code: r.name!, title: text(r.title), disabled: bool(r.disabled) }));

  const accountIds = idMap("tabAccount", "acc");
  out.accounts = rows("tabAccount").map((r) => ({
    id: accountIds.get(r.name!)!, code: r.name!, accountName: r.account_name ?? r.name!, accountNumber: text(r.account_number),
    parentCode: text(r.parent_account), rootType: text(r.root_type), accountType: text(r.account_type), isGroup: bool(r.is_group),
    accountCurrency: text(r.account_currency), disabled: bool(r.disabled), companyId: opt(companyIds, r.company, `Account ${r.name}`), legacy: legacyOf(r),
  }));
  const ensureAccount = (code: string | null, where: string): string => {
    const c = text(code) ?? "(none)";
    let id = accountIds.get(c);
    if (!id) {
      issues.push(`${where}: account "${c}" missing — placeholder added`);
      id = importId("acc", c);
      accountIds.set(c, id);
      out.accounts.push({ id, code: c, accountName: c, disabled: true });
    }
    return id;
  };

  const costCenterIds = idMap("tabCost Center", "cc");
  out.costCenters = rows("tabCost Center").map((r) => ({
    id: costCenterIds.get(r.name!)!, code: r.name!, costCenterName: r.cost_center_name ?? r.name!, parentCode: text(r.parent_cost_center),
    isGroup: bool(r.is_group), disabled: bool(r.disabled), companyId: opt(companyIds, r.company, `Cost Center ${r.name}`), legacy: legacyOf(r),
  }));

  const warehouseIds = idMap("tabWarehouse", "wh");
  out.warehouses = rows("tabWarehouse").map((r) => ({
    id: warehouseIds.get(r.name!)!, code: r.name!, warehouseName: r.warehouse_name ?? r.name!, parentCode: text(r.parent_warehouse),
    isGroup: bool(r.is_group), disabled: bool(r.disabled), companyId: opt(companyIds, r.company, `Warehouse ${r.name}`), legacy: legacyOf(r),
  }));

  const letterHeadIds = idMap("tabLetter Head", "lh");
  out.letterHeads = rows("tabLetter Head").map((r) => ({
    id: letterHeadIds.get(r.name!)!, code: r.name!, source: text(r.source), image: text(r.image), content: text(r.content),
    footer: text(r.footer), isDefault: bool(r.is_default), disabled: bool(r.disabled),
  }));

  out.namingSeries = rows("tabSeries").map((r) => ({ prefix: r.name!, current: int(r.current) }));

  // Templates ---------------------------------------------------------------
  const taxTemplateIds = idMap("tabPurchase Taxes and Charges Template", "ptt");
  out.taxTemplates = rows("tabPurchase Taxes and Charges Template").map((r) => ({
    id: taxTemplateIds.get(r.name!)!, code: r.name!, title: r.title ?? r.name!, isDefault: bool(r.is_default), disabled: bool(r.disabled),
    companyId: opt(companyIds, r.company, `Tax template ${r.name}`), taxCategoryId: opt(taxCategoryIds, r.tax_category, `Tax template ${r.name}`), legacy: legacyOf(r),
    ...stamps(r), ...byOf(r),
  }));
  const taxRows = rows("tabPurchase Taxes and Charges");
  out.taxTemplateRows = taxRows
    .filter((r) => r.parenttype === "Purchase Taxes and Charges Template")
    .filter((r) => keep(taxTemplateIds.has(r.parent!), `Tax template row ${r.name}: its template "${r.parent}" is not in the backup — orphan row not imported`))
    .map((r) => {
      const where = `Tax template ${r.parent} row ${r.idx}`;
      return {
        id: importId("pttr", r.name!), erpnextName: r.name!, templateId: taxTemplateIds.get(r.parent!)!,
        idx: int(r.idx), category: enumOf(CONSIDER, r.category, where, issues) ?? "TOTAL", addDeductTax: enumOf(ADD_DEDUCT, r.add_deduct_tax, where, issues) ?? "ADD",
        chargeType: enumOf(CHARGE, r.charge_type, where, issues) ?? "ACTUAL", rowId: intOrNull(r.row_id), accountHeadId: ensureAccount(r.account_head, where),
        description: text(r.description), rate: dec(r.rate), taxAmount: dec(r.tax_amount), includedInPrintRate: bool(r.included_in_print_rate), gstTaxType: text(r.gst_tax_type),
      };
    });

  const itemTaxTemplateIds = idMap("tabItem Tax Template", "itt");
  out.itemTaxTemplates = rows("tabItem Tax Template").map((r) => ({
    id: itemTaxTemplateIds.get(r.name!)!, code: r.name!, title: r.title ?? r.name!, disabled: bool(r.disabled), gstTreatment: text(r.gst_treatment),
    gstRate: decOrNull(r.gst_rate), companyId: opt(companyIds, r.company, `Item tax template ${r.name}`), legacy: legacyOf(r),
  }));
  out.itemTaxTemplateRates = rows("tabItem Tax Template Detail")
    .filter((r) => keep(itemTaxTemplateIds.has(r.parent!), `Item tax template rate ${r.name}: its template "${r.parent}" is not in the backup — orphan row not imported`))
    .map((r) => ({
      id: importId("ittr", r.name!), erpnextName: r.name!, templateId: itemTaxTemplateIds.get(r.parent!)!, idx: int(r.idx),
      accountId: ensureAccount(r.tax_type, `Item tax template ${r.parent} row ${r.idx}`), taxRate: dec(r.tax_rate),
    }));

  const paymentTermIds = idMap("tabPayment Term", "pt");
  const termFields = (r: Row) => ({
    description: text(r.description), modeOfPayment: text(r.mode_of_payment), dueDateBasedOn: text(r.due_date_based_on),
    creditDays: int(r.credit_days), creditMonths: int(r.credit_months), discountType: text(r.discount_type), discount: decOrNull(r.discount),
    discountValidityBasedOn: text(r.discount_validity_based_on), discountValidity: int(r.discount_validity),
  });
  out.paymentTerms = rows("tabPayment Term").map((r) => ({
    id: paymentTermIds.get(r.name!)!, code: r.name!, invoicePortion: decOrNull(r.invoice_portion), ...termFields(r), legacy: legacyOf(r), ...stamps(r), ...byOf(r),
  }));
  const paymentTermsTemplateIds = idMap("tabPayment Terms Template", "ptt2");
  out.paymentTermsTemplates = rows("tabPayment Terms Template").map((r) => ({
    id: paymentTermsTemplateIds.get(r.name!)!, code: r.name!, allocatePaymentBasedOnPaymentTerms: bool(r.allocate_payment_based_on_payment_terms), legacy: legacyOf(r),
    ...stamps(r), ...byOf(r),
  }));
  out.paymentTermsTemplateRows = rows("tabPayment Terms Template Detail")
    .filter((r) => keep(paymentTermsTemplateIds.has(r.parent!), `Payment terms template row ${r.name}: its template "${r.parent}" is not in the backup — orphan row not imported`))
    .map((r) => ({
      id: importId("ptr", r.name!), erpnextName: r.name!, templateId: paymentTermsTemplateIds.get(r.parent!)!, idx: int(r.idx),
      paymentTermName: text(r.payment_term),
      paymentTermId: opt(paymentTermIds, r.payment_term, `Payment terms template ${r.parent} row ${r.idx}`), invoicePortion: dec(r.invoice_portion), ...termFields(r),
    }));

  const termsIds = idMap("tabTerms and Conditions", "tnc");
  out.termsTemplates = rows("tabTerms and Conditions").map((r) => ({
    id: termsIds.get(r.name!)!, code: r.name!, title: r.title ?? r.name!, terms: text(r.terms), disabled: bool(r.disabled), buying: bool(r.buying), selling: bool(r.selling),
    ...stamps(r), ...byOf(r),
  }));

  // Parties -----------------------------------------------------------------
  const supplierGroupIds = idMap("tabSupplier Group", "sg");
  out.supplierGroups = rows("tabSupplier Group").map((r) => ({ id: supplierGroupIds.get(r.name!)!, code: r.name!, parentCode: text(r.parent_supplier_group), isGroup: bool(r.is_group) }));

  const addressIds = idMap("tabAddress", "addr");
  out.addresses = rows("tabAddress").map((r) => {
    const where = `Address ${r.name}`;
    return {
      id: addressIds.get(r.name!)!, code: r.name!, addressTitle: text(r.address_title), addressType: text(r.address_type),
      addressLine1: req(r, "address_line1", where), addressLine2: text(r.address_line2), city: req(r, "city", where), county: text(r.county),
      state: text(r.state), country: req(r, "country", where), pincode: text(r.pincode), emailId: text(r.email_id), phone: text(r.phone), fax: text(r.fax),
      isPrimaryAddress: bool(r.is_primary_address), isShippingAddress: bool(r.is_shipping_address), isYourCompanyAddress: bool(r.is_your_company_address),
      disabled: bool(r.disabled), taxCategory: text(r.tax_category), gstin: text(r.gstin), gstState: text(r.gst_state), gstStateNumber: text(r.gst_state_number),
      gstCategory: text(r.gst_category), legacy: legacyOf(r), ...stamps(r), ...byOf(r),
    };
  });

  const contactIds = idMap("tabContact", "ct");
  out.contacts = rows("tabContact").map((r) => ({
    id: contactIds.get(r.name!)!, code: r.name!, salutation: text(r.salutation), firstName: text(r.first_name) ?? r.name!, middleName: text(r.middle_name),
    lastName: text(r.last_name), designation: text(r.designation), gender: text(r.gender), emailId: text(r.email_id), phone: text(r.phone), mobileNo: text(r.mobile_no),
    companyName: text(r.company_name), status: text(r.status), isPrimaryContact: bool(r.is_primary_contact), isBillingContact: bool(r.is_billing_contact),
    userEmail: text(r.user), legacy: legacyOf(r), ...stamps(r), ...byOf(r),
  }));
  out.contactEmails = rows("tabContact Email").filter((r) => keep(contactIds.has(r.parent!), `Contact email ${r.name}: its contact "${r.parent}" is not in the backup — not imported`)).map((r) => ({
    id: importId("cte", r.name!), erpnextName: r.name!, contactId: contactIds.get(r.parent!)!, idx: int(r.idx), emailId: r.email_id ?? "", isPrimary: bool(r.is_primary),
  }));
  out.contactPhones = rows("tabContact Phone").filter((r) => keep(contactIds.has(r.parent!), `Contact phone ${r.name}: its contact "${r.parent}" is not in the backup — not imported`)).map((r) => ({
    id: importId("ctp", r.name!), erpnextName: r.name!, contactId: contactIds.get(r.parent!)!, idx: int(r.idx), phone: r.phone ?? "",
    isPrimaryPhone: bool(r.is_primary_phone), isPrimaryMobileNo: bool(r.is_primary_mobile_no),
  }));

  const customerIds = idMap("tabCustomer", "cu");
  out.customers = rows("tabCustomer").map((r) => ({
    id: customerIds.get(r.name!)!, code: r.name!, customerName: r.customer_name ?? r.name!, customerType: text(r.customer_type),
    customerGroup: text(r.customer_group), territory: text(r.territory), gstin: text(r.gstin), disabled: bool(r.disabled), legacy: legacyOf(r),
  }));

  const supplierIds = idMap("tabSupplier", "su");
  out.suppliers = rows("tabSupplier").map((r) => {
    const where = `Supplier ${r.name}`;
    return {
      id: supplierIds.get(r.name!)!, code: r.name!, supplierName: r.supplier_name ?? r.name!, namingSeries: text(r.naming_series),
      supplierGroupId: opt(supplierGroupIds, r.supplier_group, where), supplierType: text(r.supplier_type), country: text(r.country),
      defaultCurrency: text(r.default_currency), defaultPriceListId: opt(priceListIds, r.default_price_list, where),
      paymentTermsTemplateId: opt(paymentTermsTemplateIds, r.payment_terms, where), language: text(r.language), taxId: text(r.tax_id),
      taxCategoryId: opt(taxCategoryIds, r.tax_category, where), taxWithholdingCategory: text(r.tax_withholding_category),
      primaryContactId: opt(contactIds, r.supplier_primary_contact, where), mobileNo: text(r.mobile_no), emailId: text(r.email_id),
      primaryAddressId: opt(addressIds, r.supplier_primary_address, where), primaryAddress: text(r.primary_address), pan: text(r.pan),
      gstin: text(r.gstin), gstCategory: text(r.gst_category), isTransporter: bool(r.is_transporter), isInternalSupplier: bool(r.is_internal_supplier),
      isFrozen: bool(r.is_frozen), disabled: bool(r.disabled), onHold: bool(r.on_hold), holdType: text(r.hold_type), releaseDate: dateOnly(r.release_date),
      warnPos: bool(r.warn_pos), preventPos: bool(r.prevent_pos), legacy: legacyOf(r), ...stamps(r), createdBy: text(r.owner), updatedBy: text(r.modified_by),
    };
  });

  const partyOf = (r: Row) => ({
    supplierId: r.link_doctype === "Supplier" ? supplierIds.get(r.link_name!) ?? null : null,
    customerId: r.link_doctype === "Customer" ? customerIds.get(r.link_name!) ?? null : null,
    companyId: r.link_doctype === "Company" ? companyIds.get(r.link_name!) ?? null : null,
  });
  const links = rows("tabDynamic Link");
  out.addressLinks = links.filter((r) => r.parenttype === "Address" && keep(addressIds.has(r.parent!), `Address link ${r.name}: its address "${r.parent}" is not in the backup — not imported`)).map((r) => ({
    id: importId("al", r.name!), erpnextName: r.name!, addressId: addressIds.get(r.parent!)!, idx: int(r.idx), linkDoctype: r.link_doctype ?? "",
    linkName: r.link_name ?? "", linkTitle: text(r.link_title), ...partyOf(r),
  }));
  out.contactLinks = links.filter((r) => r.parenttype === "Contact" && keep(contactIds.has(r.parent!), `Contact link ${r.name}: its contact "${r.parent}" is not in the backup — not imported`)).map((r) => ({
    id: importId("cl", r.name!), erpnextName: r.name!, contactId: contactIds.get(r.parent!)!, idx: int(r.idx), linkDoctype: r.link_doctype ?? "",
    linkName: r.link_name ?? "", linkTitle: text(r.link_title), ...partyOf(r),
  }));

  // Items -------------------------------------------------------------------
  const itemGroupIds = idMap("tabItem Group", "ig");
  // The whole row too since 24-11-2026: the Item Group screen shows and edits it (doc/screens.ts).
  out.itemGroups = rows("tabItem Group").map((r) => ({
    id: itemGroupIds.get(r.name!)!, code: r.name!, parentCode: text(r.parent_item_group), isGroup: bool(r.is_group), legacy: legacyOf(r),
  }));

  const itemIds = idMap("tabItem", "it");
  // Templates before their variants: a variant's FK must find its template.
  const itemRows = [...rows("tabItem")].sort((a, b) => Number(!!text(a.variant_of)) - Number(!!text(b.variant_of)));
  out.items = itemRows.map((r) => {
    const where = `Item ${r.name}`;
    return {
      id: itemIds.get(r.name!)!, code: r.name!, itemName: r.item_name ?? r.name!, itemGroupId: opt(itemGroupIds, r.item_group, where),
      stockUom: ensureUom(r.stock_uom, where), purchaseUom: text(r.purchase_uom) ? ensureUom(r.purchase_uom, where) : null,
      description: text(r.description), image: text(r.image), brand: text(r.brand), disabled: bool(r.disabled), isStockItem: bool(r.is_stock_item),
      isPurchaseItem: bool(r.is_purchase_item), isFixedAsset: bool(r.is_fixed_asset), hasVariants: bool(r.has_variants),
      variantOfId: opt(itemIds, r.variant_of, where), hasBatchNo: bool(r.has_batch_no), hasSerialNo: bool(r.has_serial_no),
      serviceItem: bool(r.service_item), gstHsnCode: text(r.gst_hsn_code), isIneligibleForItc: bool(r.is_ineligible_for_itc),
      lastPurchaseRate: dec(r.last_purchase_rate), standardRate: dec(r.standard_rate), valuationRate: dec(r.valuation_rate),
      minOrderQty: dec(r.min_order_qty), safetyStock: dec(r.safety_stock), leadTimeDays: int(r.lead_time_days), weightPerUnit: dec(r.weight_per_unit),
      weightUom: text(r.weight_uom), countryOfOrigin: text(r.country_of_origin), endOfLife: dateOnly(r.end_of_life),
      legacy: legacyOf(r), ...stamps(r), createdBy: text(r.owner), updatedBy: text(r.modified_by),
    };
  });
  out.itemUomConversions = rows("tabUOM Conversion Detail").filter((r) => keep(itemIds.has(r.parent!), `UOM conversion ${r.name}: its item "${r.parent}" is not in the backup — not imported`)).map((r) => ({
    id: importId("iuc", r.name!), erpnextName: r.name!, itemId: itemIds.get(r.parent!)!, idx: int(r.idx),
    uom: ensureUom(r.uom, `Item ${r.parent} UOM row ${r.idx}`), conversionFactor: dec(r.conversion_factor),
  }));
  out.itemDefaults = rows("tabItem Default")
    .filter((r) => keep(itemIds.has(r.parent!) && companyIds.has(r.company!),
      `Item default ${r.name}: item "${r.parent}" / company "${r.company}" is not in the backup — not imported`))
    .map((r) => {
    const where = `Item ${r.parent} defaults`;
    return {
      id: importId("idf", r.name!), erpnextName: r.name!, itemId: itemIds.get(r.parent!)!, idx: int(r.idx), companyId: companyIds.get(r.company!)!,
      defaultWarehouseId: opt(warehouseIds, r.default_warehouse, where), expenseAccountId: opt(accountIds, r.expense_account, where),
      buyingCostCenterId: opt(costCenterIds, r.buying_cost_center, where), defaultSupplier: text(r.default_supplier), defaultPriceList: text(r.default_price_list),
    };
  });
  out.itemTaxes = rows("tabItem Tax")
    .filter((r) => keep(itemIds.has(r.parent!) && itemTaxTemplateIds.has(r.item_tax_template!),
      `Item tax row ${r.name}: item "${r.parent}" / template "${r.item_tax_template}" is not in the backup — not imported`))
    .map((r) => ({
    id: importId("itx", r.name!), erpnextName: r.name!, itemId: itemIds.get(r.parent!)!, idx: int(r.idx), itemTaxTemplateId: itemTaxTemplateIds.get(r.item_tax_template!)!,
    taxCategoryId: opt(taxCategoryIds, r.tax_category, `Item ${r.parent} tax row ${r.idx}`), validFrom: dateOnly(r.valid_from),
    minimumNetRate: dec(r.minimum_net_rate), maximumNetRate: dec(r.maximum_net_rate),
  }));

  const attributeIds = idMap("tabItem Attribute", "iat");
  out.itemAttributes = rows("tabItem Attribute").map((r) => ({
    id: attributeIds.get(r.name!)!, code: r.name!, numericValues: bool(r.numeric_values), fromRange: dec(r.from_range), toRange: dec(r.to_range),
    increment: dec(r.increment), legacy: legacyOf(r),
  }));
  out.itemAttributeValues = rows("tabItem Attribute Value")
    .filter((r) => keep(attributeIds.has(r.parent!), `Item attribute value ${r.name}: its attribute "${r.parent}" is not in the backup — not imported`))
    .map((r) => ({
      id: importId("iav", r.name!), erpnextName: r.name!, attributeId: attributeIds.get(r.parent!)!, idx: int(r.idx),
      attributeValue: r.attribute_value ?? "", abbr: r.abbr ?? "",
    }));
  out.itemVariantAttributes = rows("tabItem Variant Attribute")
    .filter((r) => keep(itemIds.has(r.parent!), `Item variant attribute ${r.name}: its item "${r.parent}" is not in the backup — not imported`))
    .map((r) => ({
      id: importId("iva", r.name!), erpnextName: r.name!, itemId: itemIds.get(r.parent!)!, idx: int(r.idx), attribute: r.attribute ?? "",
      attributeValue: text(r.attribute_value), variantOf: text(r.variant_of), numericValues: bool(r.numeric_values), fromRange: dec(r.from_range),
      toRange: dec(r.to_range), increment: dec(r.increment),
    }));
  out.hsnCodes = rows("tabGST HSN Code").map((r) => ({ code: r.hsn_code ?? r.name!, description: text(r.description) }));

  // Purchase Orders -----------------------------------------------------------
  const poRows = [...rows("tabPurchase Order")].sort((a, b) => (a.creation ?? "").localeCompare(b.creation ?? ""));
  const poIds = new Map(poRows.map((r) => [r.name!, importId("po", r.name!)]));
  const ensureSupplier = (code: string | null, where: string): string => {
    const c = text(code) ?? "(none)";
    let id = supplierIds.get(c);
    if (!id) {
      issues.push(`${where}: supplier "${c}" missing — placeholder added`);
      id = importId("su", c);
      supplierIds.set(c, id);
      out.suppliers.push({ id, code: c, supplierName: c, disabled: true });
    }
    return id;
  };
  const ensureItem = (code: string | null, name: string | null, uom: string, where: string): string => {
    const c = text(code) ?? "(none)";
    let id = itemIds.get(c);
    if (!id) {
      issues.push(`${where}: item "${c}" missing — placeholder added`);
      id = importId("it", c);
      itemIds.set(c, id);
      out.items.push({ id, code: c, itemName: text(name) ?? c, stockUom: uom, disabled: true });
    }
    return id;
  };

  out.orders = poRows.map((r) => {
    const where = `PO ${r.name}`;
    const docStatus = DOCSTATUS[(r.docstatus ?? "0") as keyof typeof DOCSTATUS];
    if (!docStatus) issues.push(`${where}: unknown docstatus ${r.docstatus}`);
    return {
      id: poIds.get(r.name!)!, number: r.name!, title: text(r.title), namingSeries: r.naming_series ?? "", docStatus: docStatus ?? "DRAFT",
      workflowState: enumOf(WORKFLOW, r.workflow_state, where, issues) ?? "CREATED", status: enumOf(STATUS, r.status, where, issues) ?? "DRAFT",
      amendedFromId: opt(poIds, r.amended_from, where),
      supplierId: ensureSupplier(r.supplier, where), supplierName: r.supplier_name ?? "", orderConfirmationNo: text(r.order_confirmation_no),
      orderConfirmationDate: dateOnly(r.order_confirmation_date),
      shipmentType: selectText(SHIPMENT_TYPES, r.custom_shipment_type, `${where} Shipment Type`),
      modeOfTransport: selectText(MODES_OF_TRANSPORT, r.custom_mode_of_transport, `${where} Mode Of Transport`),
      transactionDate: dateOnly(r.transaction_date)!, scheduleDate: dateOnly(r.schedule_date),
      purposeOfPurchase: selectText(PURPOSES, r.custom_purpose_of_purchase, `${where} Purpose`),
      companyId: companyIds.get(r.company!) ?? (issues.push(`${where}: company "${r.company}" missing`), out.companies[0]?.id ?? ""),
      applyTds: bool(r.apply_tds), taxWithholdingCategory: text(r.tax_withholding_category), isReverseCharge: bool(r.is_reverse_charge),
      isSubcontracted: bool(r.is_subcontracted), supplierWarehouse: text(r.supplier_warehouse), proformaInvoiceNo: text(r.custom_proforma_invoice_no),
      proformaInvoiceDate: dateOnly(r.custom_proforma_invoice_date), costCenterId: opt(costCenterIds, r.cost_center, where), project: text(r.project),
      currency: ensureCurrency(r.currency ?? "INR", where), conversionRate: dec(r.conversion_rate), buyingPriceListId: opt(priceListIds, r.buying_price_list, where),
      priceListCurrency: text(r.price_list_currency), plcConversionRate: dec(r.plc_conversion_rate), ignorePricingRule: bool(r.ignore_pricing_rule),
      setFromWarehouse: text(r.set_from_warehouse), setWarehouseId: opt(warehouseIds, r.set_warehouse, where), setReserveWarehouse: text(r.set_reserve_warehouse),
      totalQty: dec(r.total_qty), totalNetWeight: dec(r.total_net_weight), baseTotal: dec(r.base_total), baseNetTotal: dec(r.base_net_total),
      total: dec(r.total), netTotal: dec(r.net_total), taxWithholdingNetTotal: dec(r.tax_withholding_net_total),
      baseTaxWithholdingNetTotal: dec(r.base_tax_withholding_net_total), taxCategoryId: opt(taxCategoryIds, r.tax_category, where),
      taxesAndChargesId: opt(taxTemplateIds, r.taxes_and_charges, where), shippingRule: text(r.shipping_rule), incoterm: text(r.incoterm),
      namedPlace: text(r.named_place), baseTaxesAndChargesAdded: dec(r.base_taxes_and_charges_added),
      baseTaxesAndChargesDeducted: dec(r.base_taxes_and_charges_deducted), baseTotalTaxesAndCharges: dec(r.base_total_taxes_and_charges),
      taxesAndChargesAdded: dec(r.taxes_and_charges_added), taxesAndChargesDeducted: dec(r.taxes_and_charges_deducted),
      totalTaxesAndCharges: dec(r.total_taxes_and_charges), baseGrandTotal: dec(r.base_grand_total), baseRoundingAdjustment: dec(r.base_rounding_adjustment),
      baseRoundedTotal: dec(r.base_rounded_total), baseInWords: text(r.base_in_words), grandTotal: dec(r.grand_total), roundingAdjustment: dec(r.rounding_adjustment),
      roundedTotal: dec(r.rounded_total), disableRoundedTotal: bool(r.disable_rounded_total), inWords: text(r.in_words), advancePaid: dec(r.advance_paid),
      applyDiscountOn: enumOf(DISCOUNT_ON, r.apply_discount_on, where, issues) ?? "GRAND_TOTAL", baseDiscountAmount: dec(r.base_discount_amount),
      additionalDiscountPercentage: dec(r.additional_discount_percentage), discountAmount: dec(r.discount_amount),
      otherChargesCalculation: text(r.other_charges_calculation), gstBreakupTable: text(r.gst_breakup_table),
      supplierAddressId: opt(addressIds, r.supplier_address, where), addressDisplay: text(r.address_display), supplierGstin: text(r.supplier_gstin),
      gstCategory: text(r.gst_category), contactPersonId: opt(contactIds, r.contact_person, where), contactDisplay: text(r.contact_display),
      contactMobile: text(r.contact_mobile), contactEmail: text(r.contact_email), shippingAddressId: opt(addressIds, r.shipping_address, where),
      shippingAddressDisplay: text(r.shipping_address_display), billingAddressId: opt(addressIds, r.billing_address, where),
      billingAddressDisplay: text(r.billing_address_display), companyGstin: text(r.company_gstin), placeOfSupply: text(r.place_of_supply),
      customerId: opt(customerIds, r.customer, where), customerName: text(r.customer_name), customerContactPersonId: opt(contactIds, r.customer_contact_person, where),
      customerContactDisplay: text(r.customer_contact_display), customerContactMobile: text(r.customer_contact_mobile),
      customerContactEmail: text(r.customer_contact_email), paymentTermsTemplateId: opt(paymentTermsTemplateIds, r.payment_terms_template, where),
      termsTemplateId: opt(termsIds, r.tc_name, where), terms: text(r.terms), perBilled: dec(r.per_billed), perReceived: dec(r.per_received),
      letterHeadId: opt(letterHeadIds, r.letter_head, where), groupSameItems: bool(r.group_same_items), selectPrintHeading: text(r.select_print_heading),
      language: text(r.language), fromDate: dateOnly(r.from_date), toDate: dateOnly(r.to_date), autoRepeat: text(r.auto_repeat),
      isInternalSupplier: bool(r.is_internal_supplier), representsCompany: text(r.represents_company), partyAccountCurrency: text(r.party_account_currency),
      legacy: legacyOf(r), ...stamps(r), createdBy: text(r.owner), updatedBy: text(r.modified_by),
    };
  });

  const childOfPo = (r: Row, what: string) => {
    if (poIds.has(r.parent!)) return true;
    issues.push(`${what} ${r.name}: its PO "${r.parent}" is not in the backup — row skipped`);
    return false;
  };

  out.orderItems = rows("tabPurchase Order Item").filter((r) => childOfPo(r, "PO item")).map((r) => {
    const where = `PO ${r.parent} line ${r.idx}`;
    const stockUom = ensureUom(r.stock_uom, where);
    return {
      id: importId("poi", r.name!), erpnextName: r.name!, orderId: poIds.get(r.parent!)!, idx: int(r.idx),
      itemId: ensureItem(r.item_code, r.item_name, stockUom, where), itemCode: r.item_code ?? "", itemName: r.item_name ?? r.item_code ?? "",
      itemGroup: text(r.item_group), description: text(r.description), image: text(r.image), brand: text(r.brand), supplierPartNo: text(r.supplier_part_no),
      gstHsnCode: text(r.gst_hsn_code), isIneligibleForItc: bool(r.is_ineligible_for_itc), scheduleDate: dateOnly(r.schedule_date),
      expectedDeliveryDate: dateOnly(r.expected_delivery_date), qty: dec(r.qty), uom: ensureUom(r.uom ?? r.stock_uom, where), stockUom,
      conversionFactor: dec(r.conversion_factor), stockQty: dec(r.stock_qty), priceListRate: dec(r.price_list_rate),
      basePriceListRate: dec(r.base_price_list_rate), lastPurchaseRate: dec(r.last_purchase_rate),
      marginType: enumOf(MARGIN, r.margin_type, where, issues), marginRateOrAmount: dec(r.margin_rate_or_amount), rateWithMargin: dec(r.rate_with_margin),
      baseRateWithMargin: dec(r.base_rate_with_margin), discountPercentage: dec(r.discount_percentage), discountAmount: dec(r.discount_amount),
      rate: dec(r.rate), amount: dec(r.amount), baseRate: dec(r.base_rate), baseAmount: dec(r.base_amount), stockUomRate: dec(r.stock_uom_rate),
      netRate: dec(r.net_rate), netAmount: dec(r.net_amount), baseNetRate: dec(r.base_net_rate), baseNetAmount: dec(r.base_net_amount),
      isFreeItem: bool(r.is_free_item), pricingRules: text(r.pricing_rules), itemTaxTemplateId: opt(itemTaxTemplateIds, r.item_tax_template, where),
      itemTaxRate: (jsonOf(r.item_tax_rate) as Prisma.InputJsonValue | undefined) ?? undefined, applyTds: bool(r.apply_tds),
      gstTreatment: text(r.gst_treatment), taxableValue: dec(r.taxable_value), igstRate: dec(r.igst_rate), cgstRate: dec(r.cgst_rate),
      sgstRate: dec(r.sgst_rate), cessRate: dec(r.cess_rate), cessNonAdvolRate: dec(r.cess_non_advol_rate), igstAmount: dec(r.igst_amount),
      cgstAmount: dec(r.cgst_amount), sgstAmount: dec(r.sgst_amount), cessAmount: dec(r.cess_amount), cessNonAdvolAmount: dec(r.cess_non_advol_amount),
      sgst: dec(r.sgst), sgstAmt: dec(r.sgst_amt), cgst: dec(r.cgst), cgstAmt: dec(r.cgst_amt), igst: dec(r.igst), igstAmt: dec(r.igst_amt),
      warehouseId: opt(warehouseIds, r.warehouse, where), fromWarehouse: text(r.from_warehouse), actualQty: dec(r.actual_qty),
      companyTotalStock: dec(r.company_total_stock), expenseAccountId: opt(accountIds, r.expense_account, where),
      costCenterId: opt(costCenterIds, r.cost_center, where), project: text(r.project), materialRequest: text(r.material_request),
      materialRequestItem: text(r.material_request_item), salesOrder: text(r.sales_order), salesOrderItem: text(r.sales_order_item),
      supplierQuotation: text(r.supplier_quotation), supplierQuotationItem: text(r.supplier_quotation_item),
      deliveredBySupplier: bool(r.delivered_by_supplier), blanketOrder: text(r.blanket_order), receivedQty: dec(r.received_qty),
      returnedQty: dec(r.returned_qty), billedAmt: dec(r.billed_amt), manufacturer: text(r.manufacturer), manufacturerPartNo: text(r.manufacturer_part_no),
      bom: text(r.bom), weightPerUnit: dec(r.weight_per_unit), totalWeight: dec(r.total_weight), weightUom: text(r.weight_uom),
      isFixedAsset: bool(r.is_fixed_asset), pageBreak: bool(r.page_break), legacy: legacyOf(r),
    };
  });

  out.orderTaxes = taxRows.filter((r) => r.parenttype === PO && childOfPo(r, "PO tax row")).map((r) => {
    const where = `PO ${r.parent} tax row ${r.idx}`;
    return {
      id: importId("pot", r.name!), erpnextName: r.name!, orderId: poIds.get(r.parent!)!, idx: int(r.idx),
      category: enumOf(CONSIDER, r.category, where, issues) ?? "TOTAL", addDeductTax: enumOf(ADD_DEDUCT, r.add_deduct_tax, where, issues) ?? "ADD",
      chargeType: enumOf(CHARGE, r.charge_type, where, issues) ?? "ACTUAL", rowId: intOrNull(r.row_id), includedInPrintRate: bool(r.included_in_print_rate),
      includedInPaidAmount: bool(r.included_in_paid_amount), accountHeadId: ensureAccount(r.account_head, where), description: text(r.description),
      rate: dec(r.rate), costCenterId: opt(costCenterIds, r.cost_center, where), accountCurrency: text(r.account_currency), taxAmount: dec(r.tax_amount),
      taxAmountAfterDiscountAmount: dec(r.tax_amount_after_discount_amount), total: dec(r.total), baseTaxAmount: dec(r.base_tax_amount),
      baseTotal: dec(r.base_total), baseTaxAmountAfterDiscountAmount: dec(r.base_tax_amount_after_discount_amount),
      itemWiseTaxDetail: (jsonOf(r.item_wise_tax_detail) as Prisma.InputJsonValue | undefined) ?? undefined, servicePrice: dec(r.service_price),
      gstTaxType: text(r.gst_tax_type), legacy: legacyOf(r),
    };
  });

  out.orderCostOverheads = rows("tabServices Items").filter((r) => childOfPo(r, "Cost overhead")).map((r) => {
    const where = `PO ${r.parent} cost overhead ${r.idx}`;
    let serviceCharges: string | null = null;
    try {
      serviceCharges = decOrNull(r.service_charges);
    } catch {
      issues.push(`${where}: service charges "${r.service_charges}" is not a number — kept in legacy only`);
    }
    return {
      id: importId("poc", r.name!), erpnextName: r.name!, orderId: poIds.get(r.parent!)!, idx: int(r.idx),
      serviceItemId: opt(itemIds, r.service_item, where), serviceCharges, accountHeadId: opt(accountIds, r.account_head, where),
      chargeType: text(r.charge_type) ?? "Actual", legacy: legacyOf(r),
    };
  });

  const poDate = new Map(poRows.map((r) => [r.name!, dateOnly(r.transaction_date)!]));
  out.orderPaymentSchedules = rows("tabPayment Schedule").filter((r) => childOfPo(r, "Payment schedule row")).map((r) => {
    const where = `PO ${r.parent} payment row ${r.idx}`;
    const due = dateOnly(r.due_date) ?? (issues.push(`${where}: no due date — PO date used`), poDate.get(r.parent!)!);
    return {
      id: importId("pos", r.name!), erpnextName: r.name!, orderId: poIds.get(r.parent!)!, idx: int(r.idx),
      paymentTermName: text(r.payment_term), paymentTermId: opt(paymentTermIds, r.payment_term, where), description: text(r.description), dueDate: due, modeOfPayment: text(r.mode_of_payment),
      invoicePortion: dec(r.invoice_portion), discountType: text(r.discount_type), discountDate: dateOnly(r.discount_date), discount: dec(r.discount),
      paymentAmount: dec(r.payment_amount), outstanding: dec(r.outstanding), paidAmount: dec(r.paid_amount), discountedAmount: dec(r.discounted_amount),
      basePaymentAmount: dec(r.base_payment_amount), dueDateBasedOn: text(r.due_date_based_on), creditDays: int(r.credit_days),
      creditMonths: int(r.credit_months), discountValidityBasedOn: text(r.discount_validity_based_on), discountValidity: int(r.discount_validity),
      legacy: legacyOf(r),
    };
  });

  // Connections: receipts, invoices and material requests made against each PO
  const header = (t: string) => new Map(rows(t).map((r) => [r.name!, r]));
  const prHead = header("tabPurchase Receipt");
  const piHead = header("tabPurchase Invoice");
  const mrHead = header("tabMaterial Request");
  const docLabel = (h: Row | undefined) =>
    h ? text(h.status) ?? ({ "0": "Draft", "1": "Submitted", "2": "Cancelled" } as Record<string, string>)[h.docstatus ?? ""] ?? null : null;
  const linkMap = new Map<string, Prisma.PurchaseOrderLinkCreateManyInput & { detail: Prisma.InputJsonValue[] }>();
  const addLink = (po: string, docType: string, docName: string, head: Row | undefined, dateCol: string, line: Prisma.InputJsonValue) => {
    const orderId = poIds.get(po);
    if (!orderId) return;
    const key = `${orderId}|${docType}|${docName}`;
    let l = linkMap.get(key);
    if (!l) {
      l = {
        id: importId("pol", key), orderId, docType, docName, docDate: dateOnly(head?.[dateCol]), docStatus: docLabel(head),
        detail: [],
      };
      linkMap.set(key, l);
    }
    l.detail.push(line);
  };
  for (const r of rows("tabPurchase Receipt Item")) {
    addLink(r.purchase_order!, "Purchase Receipt", r.parent!, prHead.get(r.parent!), "posting_date", {
      poItem: r.purchase_order_item, itemCode: r.item_code, qty: r.qty, receivedQty: r.received_qty, rejectedQty: r.rejected_qty,
    });
  }
  for (const r of rows("tabPurchase Invoice Item")) {
    addLink(r.purchase_order!, "Purchase Invoice", r.parent!, piHead.get(r.parent!), "posting_date", {
      poItem: r.po_detail, itemCode: r.item_code, qty: r.qty, amount: r.amount,
    });
  }
  for (const r of rows("tabPurchase Order Item")) {
    if (text(r.material_request)) {
      addLink(r.parent!, "Material Request", r.material_request!, mrHead.get(r.material_request!), "transaction_date", {
        poItem: r.name, itemCode: r.item_code, materialRequestItem: r.material_request_item,
      });
    }
  }
  out.orderLinks = [...linkMap.values()];

  // Timeline: versions, comments (workflow, labels, deletions…), emails --------
  out.orderEvents = [];
  out.docEvents = [];
  for (const r of rows("tabVersion").filter((x) => x.ref_doctype === PO)) {
    out.orderEvents.push({
      id: importId("ev", `Version:${r.name}`), erpnextName: `Version:${r.name}`, source: "Version", orderId: poIds.get(r.docname!) ?? null,
      orderNumber: r.docname ?? "", kind: "VERSION", at: localDateTime(r.creation)!, byEmail: text(r.owner),
      data: (jsonOf(r.data) as Prisma.InputJsonValue | undefined) ?? undefined,
    });
  }
  for (const r of rows("tabComment").filter((x) => x.reference_doctype === PO)) {
    const where = `Comment ${r.name}`;
    const kind = enumOf(COMMENT_KIND, r.comment_type, where, issues) ?? "INFO";
    const deleted = kind === "DELETED";
    const content = deleted ? (jsonOf(r.content) as Record<string, unknown> | undefined) : undefined;
    const orderNumber = text(r.reference_name) ?? (content && typeof content.name === "string" ? content.name : "") ?? "";
    out.orderEvents.push({
      id: importId("ev", `Comment:${r.name}`), erpnextName: `Comment:${r.name}`, source: "Comment",
      orderId: deleted ? null : poIds.get(orderNumber) ?? null, orderNumber, kind, at: localDateTime(r.creation)!,
      byEmail: text(r.comment_email) ?? text(r.owner), subject: text(r.subject), content: deleted ? null : text(r.content),
      data: deleted ? (content as Prisma.InputJsonValue | undefined) : undefined,
    });
  }
  for (const r of rows("tabCommunication").filter((x) => x.reference_doctype === PO)) {
    out.orderEvents.push({
      id: importId("ev", `Communication:${r.name}`), erpnextName: `Communication:${r.name}`, source: "Communication",
      orderId: poIds.get(r.reference_name!) ?? null, orderNumber: r.reference_name ?? "", kind: "EMAIL",
      at: localDateTime(r.communication_date) ?? localDateTime(r.creation)!, byEmail: text(r.sender), subject: text(r.subject), content: text(r.content),
      data: {
        recipients: r.recipients, cc: r.cc, bcc: r.bcc, sentOrReceived: r.sent_or_received, medium: r.communication_medium, status: r.status,
      },
    });
  }

  // Phase II: the stock documents' history, comments and emails, mapped as the PO's are above.
  for (const r of rows("tabVersion").filter((x) => STOCK_EVENT_DOCTYPES.has(x.ref_doctype ?? ""))) {
    out.docEvents.push({
      id: importId("dev", `Version:${r.name}`), erpnextName: `Version:${r.name}`, source: "Version", doctype: r.ref_doctype!,
      docName: r.docname ?? "", kind: "VERSION", at: localDateTime(r.creation)!, byEmail: text(r.owner),
      data: (jsonOf(r.data) as Prisma.InputJsonValue | undefined) ?? undefined,
    });
  }
  for (const r of rows("tabComment").filter((x) => STOCK_EVENT_DOCTYPES.has(x.reference_doctype ?? ""))) {
    const kind = enumOf(COMMENT_KIND, r.comment_type, `Comment ${r.name}`, issues) ?? "INFO";
    const deleted = kind === "DELETED";
    const content = deleted ? (jsonOf(r.content) as Record<string, unknown> | undefined) : undefined;
    out.docEvents.push({
      id: importId("dev", `Comment:${r.name}`), erpnextName: `Comment:${r.name}`, source: "Comment", doctype: r.reference_doctype!,
      docName: text(r.reference_name) ?? (content && typeof content.name === "string" ? content.name : "") ?? "", kind,
      at: localDateTime(r.creation)!, byEmail: text(r.comment_email) ?? text(r.owner), subject: text(r.subject),
      content: deleted ? null : text(r.content), data: deleted ? (content as Prisma.InputJsonValue | undefined) : undefined,
    });
  }
  for (const r of rows("tabCommunication").filter((x) => STOCK_EVENT_DOCTYPES.has(x.reference_doctype ?? ""))) {
    out.docEvents.push({
      id: importId("dev", `Communication:${r.name}`), erpnextName: `Communication:${r.name}`, source: "Communication",
      doctype: r.reference_doctype!, docName: r.reference_name ?? "", kind: "EMAIL",
      at: localDateTime(r.communication_date) ?? localDateTime(r.creation)!, byEmail: text(r.sender), subject: text(r.subject), content: text(r.content),
      data: {
        recipients: r.recipients, cc: r.cc, bcc: r.bcc, sentOrReceived: r.sent_or_received, medium: r.communication_medium, status: r.status,
      },
    });
  }

  out.attachments = rows("tabFile").filter((r) => !bool(r.is_folder)).map((r) => ({
    id: importId("att", r.name!), erpnextName: r.name!, orderId: poIds.get(r.attached_to_name!) ?? null, fileName: r.file_name ?? r.name!,
    fileUrl: r.file_url ?? "", isPrivate: bool(r.is_private), fileSize: intOrNull(r.file_size), contentHash: text(r.content_hash),
    uploadedBy: text(r.owner), uploadedAt: localDateTime(r.creation) ?? undefined,
  }));

  const rolesOf = new Map<string, string[]>();
  for (const r of rows("tabHas Role")) rolesOf.set(r.parent!, [...(rolesOf.get(r.parent!) ?? []), r.role!]);
  out.users = rows("tabUser").map((r) => ({
    email: r.name!, firstName: text(r.first_name), lastName: text(r.last_name), fullName: text(r.full_name), enabled: bool(r.enabled),
    userType: text(r.user_type), roles: (rolesOf.get(r.name!) ?? []).sort(), legacy: legacyOf(r, USER_PRIVATE),
  }));

  out.sourceCounts = Object.fromEntries([...tables.entries()].map(([t, d]) => [t, d.rows.length]));
  out.issues = issues;
  // Likes: Frappe kept who liked a record in its _liked_by (a JSON list of users), on the POs and
  // on every master that has a screen here.
  const likeSources: [string, string, Map<string, string>][] = [
    ["tabPurchase Order", "Purchase Order", poIds],
    ["tabSupplier", "Supplier", supplierIds],
    ["tabItem", "Item", itemIds],
    ["tabAddress", "Address", addressIds],
    ["tabContact", "Contact", contactIds],
    ["tabPurchase Taxes and Charges Template", "Purchase Taxes and Charges Template", taxTemplateIds],
    ["tabPayment Terms Template", "Payment Terms Template", paymentTermsTemplateIds],
    ["tabPayment Term", "Payment Term", paymentTermIds],
    ["tabTerms and Conditions", "Terms and Conditions", termsIds],
  ];
  out.likes = [];
  for (const [table, doctype, ids] of likeSources) {
    for (const r of rows(table)) {
      const raw = text(r._liked_by);
      if (!raw) continue;
      let users: unknown;
      try {
        users = JSON.parse(raw);
      } catch {
        issues.push(`${doctype} ${r.name}: its likes (_liked_by) are not a list — not imported`);
        continue;
      }
      const recordId = ids.get(r.name!);
      if (!Array.isArray(users) || !recordId) continue;
      for (const email of new Set(users.filter((u): u is string => typeof u === "string" && u.trim() !== ""))) {
        out.likes.push({ id: importId("like", `${doctype}|${r.name}|${email}`), doctype, recordId, email });
      }
    }
  }

  // Phase II: the Stock module's documents, linked to the masters and POs imported above (their
  // placeholders included).
  const { issues: stockIssues, ...stock } = buildStock(tables, {
    items: new Set(out.items.map((i) => i.code)),
    warehouses: new Set(out.warehouses.map((w) => w.code)),
    suppliers: new Set(out.suppliers.map((s) => s.code)),
    customers: new Set(out.customers.map((c) => c.code)),
    orders: new Set(out.orders.map((o) => o.number)),
    orderItems: new Set(out.orderItems.map((i) => i.erpnextName).filter((n): n is string => !!n)),
    priceLists: new Set(out.priceLists.map((p) => p.code)),
  });
  Object.assign(out, stock);
  issues.push(...stockIssues);

  return out;
}
