// The Item master on the server: its list, one item's form values, its save
// and delete, and its variants. A save re-checks the form and applies
// ERPNext's Item.validate as the old site ran it (Stock Settings named items
// by Item Code; India Compliance checked HSN/SAC; Item Variant Settings let a
// template's save update its variants), and sets what Frappe set itself: the
// Item Name and Description when empty, the stock UOM's conversion row.
import "server-only";
import type { Prisma } from "@prisma/client";
import { isCountry } from "../../countries";
import { siteToday } from "../../format";
import { htmlToText, sanitizeHtml } from "../../html";
import type { ActionResult } from "../../orders/form-schema";
import { masterPath } from "../../routes";
import type { PurchaseUser } from "../../server/current-user";
import { db } from "../../server/db";
import type { SaveMasterRequest } from "../address/server";
import { assertFresh, dateOf, MasterError, masterResult, refuseIf, stampsOf, syncRows, ymd, type Stamp } from "../kit";
import type { ListPage, ListShape, MasterListQuery } from "../list-query";
import type { Row, Values } from "../spec";
import { checkNewName, cleanValues, flag, mandatoryErrors, num, rnum, rowsOf, rstr, str } from "../values";
import { itemIndicator, itemSpec, VARIANT_FIELDS, variantNames } from "./spec";

type Tx = Prisma.TransactionClient;
const fieldError = (field: string, message: string) => new MasterError(message, { [field]: message });

// The list ----------------------------------------------------------------------------------------

/** Item list: Item Group, Has Variants and Variant Of are its standard filters; latest change first. */
export const ITEM_LIST: ListShape = {
  filters: ["item_group", "has_variants", "variant_of", "disabled"],
  sorts: ["modified", "creation", "name", "item_name"],
  defaultSort: "modified",
  defaultOrder: "desc",
};

const ORDER: Record<string, (o: "asc" | "desc") => Prisma.PurchaseItemOrderByWithRelationInput> = {
  modified: (o) => ({ updatedAt: o }),
  creation: (o) => ({ createdAt: o }),
  name: (o) => ({ code: o }),
  item_name: (o) => ({ itemName: o }),
};

export async function listItems(q: MasterListQuery): Promise<ListPage> {
  const has = (s: string) => ({ contains: s, mode: "insensitive" as const });
  const yes = (k: string) => (q.filters[k] === "Yes" ? true : q.filters[k] === "No" ? false : undefined);
  const base: Prisma.PurchaseItemWhereInput = {
    ...(q.q ? { OR: [{ code: has(q.q) }, { itemName: has(q.q) }] } : {}),
    ...(q.filters.item_group ? { itemGroup: { code: q.filters.item_group } } : {}),
    ...(yes("has_variants") !== undefined ? { hasVariants: yes("has_variants") } : {}),
    ...(yes("disabled") !== undefined ? { disabled: yes("disabled") } : {}),
    ...(q.filters.variant_of ? { variantOf: { code: q.filters.variant_of } } : {}),
  };
  const where: Prisma.PurchaseItemWhereInput = q.idFilter ? { AND: [base, { id: q.idFilter }] } : base;
  const today = siteToday();
  const [rows, total] = await Promise.all([
    db.purchaseItem.findMany({
      where,
      orderBy: [(ORDER[q.sort] ?? ORDER.modified)(q.order), { code: "asc" }],
      take: q.limit,
      select: { id: true, code: true, itemName: true, disabled: true, endOfLife: true, hasVariants: true, variantOfId: true, updatedAt: true, itemGroup: { select: { code: true } } },
    }),
    db.purchaseItem.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((i) => ({
      id: i.id,
      href: masterPath("items", i.id),
      title: i.itemName,
      name: i.code,
      pill: itemIndicator({ disabled: i.disabled, endOfLife: ymd(i.endOfLife), hasVariants: i.hasVariants, variantOf: i.variantOfId }, today),
      cells: { item_group: i.itemGroup?.code ?? null },
      updatedAt: i.updatedAt.toISOString(),
    })),
  };
}

export async function itemGroupNames(): Promise<string[]> {
  return (await db.purchaseItemGroup.findMany({ select: { code: true }, orderBy: { code: "asc" } })).map((g) => g.code);
}

// One item ----------------------------------------------------------------------------------------

const ITEM_INCLUDE = {
  itemGroup: { select: { code: true } },
  variantOf: { select: { code: true, itemName: true } },
  uomConversions: { orderBy: { idx: "asc" } },
  attributes: { orderBy: { idx: "asc" } },
  defaults: {
    orderBy: { idx: "asc" },
    include: { company: { select: { code: true } }, defaultWarehouse: { select: { code: true } }, buyingCostCenter: { select: { code: true } }, expenseAccount: { select: { code: true } } },
  },
  taxes: { orderBy: { idx: "asc" }, include: { itemTaxTemplate: { select: { code: true } }, taxCategory: { select: { code: true } } } },
} satisfies Prisma.PurchaseItemInclude;

type ItemRow = Prisma.PurchaseItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

/** An item's form values (the record's ids as the rows' keys). */
export function itemValues(i: ItemRow): Values {
  return {
    _name: i.code,
    item_code: i.code,
    item_name: i.itemName,
    item_group: i.itemGroup?.code ?? null,
    gst_hsn_code: i.gstHsnCode,
    stock_uom: i.stockUom,
    disabled: i.disabled,
    is_stock_item: i.isStockItem,
    has_variants: i.hasVariants,
    description: i.description,
    end_of_life: ymd(i.endOfLife),
    weight_per_unit: Number(i.weightPerUnit),
    weight_uom: i.weightUom,
    has_batch_no: i.hasBatchNo,
    has_serial_no: i.hasSerialNo,
    variant_of: i.variantOf?.code ?? null,
    variant_based_on: i.hasVariants || i.variantOfId ? "Item Attribute" : null,
    purchase_uom: i.purchaseUom,
    min_order_qty: Number(i.minOrderQty),
    safety_stock: Number(i.safetyStock),
    is_purchase_item: i.isPurchaseItem,
    lead_time_days: i.leadTimeDays,
    last_purchase_rate: Number(i.lastPurchaseRate) ? String(Number(i.lastPurchaseRate)) : "0",
    country_of_origin: i.countryOfOrigin,
    is_ineligible_for_itc: i.isIneligibleForItc,
    service_item: i.serviceItem,
    uoms: i.uomConversions.map((u) => ({ _key: u.id, uom: u.uom, conversion_factor: Number(u.conversionFactor) })),
    attributes: i.attributes.map((a) => ({ _key: a.id, attribute: a.attribute, attribute_value: a.attributeValue })),
    item_defaults: i.defaults.map((d) => ({
      _key: d.id,
      company: d.company.code,
      default_warehouse: d.defaultWarehouse?.code ?? null,
      default_price_list: d.defaultPriceList,
      buying_cost_center: d.buyingCostCenter?.code ?? null,
      default_supplier: d.defaultSupplier,
      expense_account: d.expenseAccount?.code ?? null,
    })),
    taxes: i.taxes.map((t) => ({
      _key: t.id,
      item_tax_template: t.itemTaxTemplate.code,
      tax_category: t.taxCategory?.code ?? null,
      valid_from: ymd(t.validFrom),
      minimum_net_rate: Number(t.minimumNetRate),
      maximum_net_rate: Number(t.maximumNetRate),
    })),
  };
}

export interface ItemDoc {
  id: string;
  code: string;
  title: string;
  updatedAt: string;
  indicator: ReturnType<typeof itemIndicator>;
  values: Values;
  /** The template's code (a variant), and how many variants a template has. */
  variantOf: string | null;
  variants: number;
  /** Purchase Orders with the item on a line (the Dashboard's connection). */
  orders: number;
  /** The template's attributes and the values each takes (to create variants). */
  attributeChoices: { attribute: string; values: { value: string; abbr: string }[] }[];
  created: Stamp;
  edited: Stamp;
}

export async function loadItem(id: string): Promise<ItemDoc | null> {
  const i = await db.purchaseItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
  if (!i) return null;
  const [orders, variants, choices, stamps] = await Promise.all([
    db.purchaseOrder.count({ where: { items: { some: { itemId: i.id } } } }),
    i.hasVariants ? db.purchaseItem.count({ where: { variantOfId: i.id } }) : Promise.resolve(0),
    i.hasVariants ? attributeChoices(i.attributes.map((a) => a.attribute)) : Promise.resolve([]),
    stampsOf(i),
  ]);
  return {
    id: i.id,
    code: i.code,
    title: i.itemName,
    updatedAt: i.updatedAt.toISOString(),
    indicator: itemIndicator({ disabled: i.disabled, endOfLife: ymd(i.endOfLife), hasVariants: i.hasVariants, variantOf: i.variantOfId }, siteToday()),
    values: itemValues(i),
    variantOf: i.variantOf?.code ?? null,
    variants,
    orders,
    attributeChoices: choices,
    ...stamps,
  };
}

async function attributeChoices(attributes: string[]) {
  const rows = await db.purchaseItemAttribute.findMany({ where: { code: { in: attributes } }, include: { values: { orderBy: { idx: "asc" } } } });
  const by = new Map(rows.map((r) => [r.code, r]));
  return attributes.map((a) => ({ attribute: a, values: (by.get(a)?.values ?? []).map((v) => ({ value: v.attributeValue, abbr: v.abbr })) }));
}

// Save --------------------------------------------------------------------------------------------

export function saveItem(user: PurchaseUser, req: SaveMasterRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const cleaned = cleanValues(itemSpec, req.values);
    if ("invalid" in cleaned) throw new MasterError(cleaned.invalid);
    const v = cleaned.values;
    refuseIf(cleaned.errors);
    // Item.validate fills these before the mandatory check of the save (Item Name from the code).
    const missing = mandatoryErrors(itemSpec, v, isNew);
    refuseIf(missing.errors, missing.message);
    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchaseItem.findUnique({ where: { id: req.id }, include: ITEM_INCLUDE }) : null;
      if (req.id && !before) throw new MasterError("This Item no longer exists. It may have been deleted.");
      if (before) assertFresh("Item", before.updatedAt, req.expectedUpdatedAt);
      return writeItem(tx, user.email, v, before);
    });
  });
}

/**
 * Writes an item from cleaned values (a new one when `before` is null), checking it as
 * Item.validate did, and copies a template's fields to its variants (Item Variant Settings).
 */
async function writeItem(tx: Tx, by: string, v: Values, before: ItemRow | null): Promise<{ id: string; notices: string[] }> {
  const notices: string[] = [];
  const code = before ? before.code : (() => {
    const n = checkNewName("Item", str(v, "item_code"));
    if ("problem" in n) throw fieldError("item_code", n.problem);
    return n.name;
  })();
  const itemName = str(v, "item_name")?.trim() || code;
  const rawDescription = str(v, "description");
  // Stock Settings cleaned the description's HTML; an empty one becomes the Item Name.
  const description = rawDescription && htmlToText(rawDescription).trim() ? sanitizeHtml(rawDescription) : itemName;

  // Links.
  const group = await tx.purchaseItemGroup.findUnique({ where: { code: str(v, "item_group")! }, select: { id: true } });
  if (!group) throw fieldError("item_group", `Could not find Item Group: ${str(v, "item_group")}`);
  const stockUom = str(v, "stock_uom")!;
  for (const [field, label] of [["stock_uom", "Default Unit of Measure"], ["weight_uom", "Weight UOM"], ["purchase_uom", "Default Purchase Unit of Measure"]] as const) {
    const u = str(v, field);
    if (u && !(await tx.purchaseUom.findUnique({ where: { name: u }, select: { name: true } }))) throw fieldError(field, `Could not find ${label}: ${u}`);
  }
  const country = str(v, "country_of_origin");
  if (country && !isCountry(country)) throw fieldError("country_of_origin", `Could not find Country of Origin: ${country}`);

  // India Compliance: HSN/SAC is required of a sales item (all but one item was), 6 or 8 digits.
  const hsn = str(v, "gst_hsn_code");
  const salesItem = (before?.legacy as Record<string, unknown> | null)?.is_sales_item !== "0";
  if (salesItem) {
    if (!hsn) throw fieldError("gst_hsn_code", "HSN/SAC Code is required. Please enter a valid HSN/SAC code.");
    if (![6, 8].includes(hsn.length)) throw fieldError("gst_hsn_code", "HSN/SAC Code should be 6 or 8 digits long. Please enter a valid HSN/SAC code.");
  }
  if (hsn && !(await tx.purchaseHsnCode.findUnique({ where: { code: hsn }, select: { code: true } }))) throw fieldError("gst_hsn_code", `Could not find HSN/SAC: ${hsn}`);

  // A variant: of a template, with the template's Default Unit of Measure.
  const templateCode = before ? (before.variantOf?.code ?? null) : str(v, "variant_of");
  const template = templateCode ? await tx.purchaseItem.findUnique({ where: { code: templateCode }, select: { id: true, code: true, stockUom: true, hasVariants: true } }) : null;
  if (templateCode && (!template || !template.hasVariants)) throw new MasterError(`Could not find Variant Of: ${templateCode}`);
  if (template && template.stockUom !== stockUom) throw fieldError("stock_uom", `Default Unit of Measure for Variant '${stockUom}' must be same as in Template '${template.stockUom}'`);
  const hasVariants = template ? false : flag(v, "has_variants");

  // UOMs: changing the stock UOM clears the table; the stock UOM is always there at 1.
  let uoms = rowsOf(v, "uoms");
  if (before && before.stockUom !== stockUom) {
    uoms = [];
    notices.push("Successfully changed Stock UOM, please redefine conversion factors for new UOM.");
  }
  if (!uoms.some((r) => rstr(r, "uom") === stockUom)) uoms = [...uoms, { _key: "stock-uom", uom: stockUom, conversion_factor: 1 }];
  const seenUom = new Set<string>();
  for (const [i, r] of uoms.entries()) {
    const u = rstr(r, "uom")!;
    if (seenUom.has(u)) throw new MasterError(`Unit of Measure ${u} has been entered more than once in Conversion Factor Table`);
    seenUom.add(u);
    if (!(await tx.purchaseUom.findUnique({ where: { name: u }, select: { name: true } }))) throw new MasterError(`Row #${i + 1}: Could not find UOM: ${u}`);
    if (u === stockUom && rnum(r, "conversion_factor") !== 1) throw new MasterError(`Conversion factor for default Unit of Measure must be 1 in row ${i + 1}`);
  }

  const isStockItem = flag(v, "is_stock_item");
  if (flag(v, "has_serial_no") && !isStockItem) throw new MasterError("'Has Serial No' can not be 'Yes' for non-stock item");

  // Taxes: a template once per tax category; Maximum Net Rate not below the minimum.
  const taxes = rowsOf(v, "taxes");
  const seenTax = new Set<string>();
  const taxIds: { templateId: string; categoryId: string | null }[] = [];
  for (const [i, r] of taxes.entries()) {
    const t = rstr(r, "item_tax_template")!;
    const c = rstr(r, "tax_category");
    const key = `${t}|${c ?? ""}`;
    if (seenTax.has(key)) throw new MasterError(`${t} entered twice ${c ? `for tax category ${c}` : ""} in Item Taxes`.replace(/\s+/g, " "));
    seenTax.add(key);
    if ((rnum(r, "maximum_net_rate") ?? 0) < (rnum(r, "minimum_net_rate") ?? 0)) throw new MasterError(`Row #${i + 1}: Maximum Net Rate cannot be greater than Minimum Net Rate`);
    const tt = await tx.purchaseItemTaxTemplate.findUnique({ where: { code: t }, select: { id: true } });
    if (!tt) throw new MasterError(`Row #${i + 1}: Could not find Item Tax Template: ${t}`);
    const tc = c ? await tx.purchaseTaxCategory.findUnique({ where: { code: c }, select: { id: true } }) : null;
    if (c && !tc) throw new MasterError(`Row #${i + 1}: Could not find Tax Category: ${c}`);
    taxIds.push({ templateId: tt.id, categoryId: tc?.id ?? null });
  }

  // Variants: a template keeps its variants; its attributes, and a variant's values, must be valid.
  if (before?.hasVariants && !hasVariants && (await tx.purchaseItem.count({ where: { variantOfId: before.id } }))) throw fieldError("has_variants", "Item has variants.");
  const attributes = rowsOf(v, "attributes");
  if (hasVariants || template) {
    if (!attributes.length) throw new MasterError("Attribute table is mandatory");
    const seen = new Set<string>();
    for (const r of attributes) {
      const a = rstr(r, "attribute")!;
      if (seen.has(a)) throw new MasterError(`Attribute ${a} selected multiple times in Attributes Table`);
      seen.add(a);
      const attr = await tx.purchaseItemAttribute.findUnique({ where: { code: a }, include: { values: true } });
      if (!attr) throw new MasterError(`Could not find Attribute: ${a}`);
      const value = rstr(r, "attribute_value");
      if (template && value && !attr.numericValues && !attr.values.some((x) => x.attributeValue === value)) {
        throw new MasterError(`${value} is not a valid Value for Attribute ${a} of Item ${code}.`, { [`attributes.${attributes.indexOf(r)}.attribute_value`]: "Invalid Value" });
      }
    }
    if (template) {
      const same = await findVariant(tx, template.id, Object.fromEntries(attributes.map((r) => [rstr(r, "attribute")!, rstr(r, "attribute_value") ?? ""])), before?.id ?? null);
      if (same) throw new MasterError(`Item variant ${same} exists with same attributes`);
    }
  }

  // Item Defaults: one row per company; its warehouse, cost centre and account of that company.
  const defaults = rowsOf(v, "item_defaults");
  const companies = new Set<string>();
  const defaultIds: { companyId: string; warehouseId: string | null; costCenterId: string | null; accountId: string | null }[] = [];
  for (const [i, r] of defaults.entries()) {
    const company = await tx.purchaseCompany.findUnique({ where: { code: rstr(r, "company")! }, select: { id: true, code: true } });
    if (!company) throw new MasterError(`Row #${i + 1}: Could not find Company: ${rstr(r, "company")}`);
    if (companies.has(company.id)) throw new MasterError("Cannot set multiple Item Defaults for a company.");
    companies.add(company.id);
    const own = async (doctype: string, value: string | null, find: (code: string) => Promise<{ id: string; companyId: string | null } | null>) => {
      if (!value) return null;
      const x = await find(value);
      if (!x) throw new MasterError(`Row #${i + 1}: Could not find ${doctype}: ${value}`);
      if (x.companyId && x.companyId !== company.id) throw new MasterError(`Row #${i + 1}: ${doctype} ${value} doesn't belong to Company ${company.code}. Please select valid ${doctype}.`);
      return x.id;
    };
    const warehouseId = await own("Warehouse", rstr(r, "default_warehouse"), (c) => tx.purchaseWarehouse.findUnique({ where: { code: c }, select: { id: true, companyId: true } }));
    const costCenterId = await own("Cost Center", rstr(r, "buying_cost_center"), (c) => tx.purchaseCostCenter.findUnique({ where: { code: c }, select: { id: true, companyId: true } }));
    const accountId = await own("Account", rstr(r, "expense_account"), (c) => tx.purchaseAccount.findUnique({ where: { code: c }, select: { id: true, companyId: true } }));
    const supplier = rstr(r, "default_supplier");
    if (supplier && !(await tx.purchaseSupplier.findUnique({ where: { code: supplier }, select: { id: true } }))) throw new MasterError(`Row #${i + 1}: Could not find Supplier: ${supplier}`);
    const priceList = rstr(r, "default_price_list");
    if (priceList && !(await tx.purchasePriceList.findUnique({ where: { code: priceList }, select: { id: true } }))) throw new MasterError(`Row #${i + 1}: Could not find Price List: ${priceList}`);
    defaultIds.push({ companyId: company.id, warehouseId, costCenterId, accountId });
  }

  // cant_change: Maintain Stock once a submitted PO has the item; batch and serial once received.
  if (before) {
    const changed: string[] = [];
    if (before.isStockItem !== isStockItem && (await tx.purchaseOrderItem.findFirst({ where: { itemId: before.id, order: { docStatus: "SUBMITTED" } }, select: { id: true } }))) changed.push("Maintain Stock");
    const received = () => tx.purchaseOrderItem.findFirst({ where: { itemId: before.id, receivedQty: { gt: 0 } }, select: { id: true } });
    if (before.hasSerialNo !== flag(v, "has_serial_no") && (await received())) changed.push("Has Serial No");
    if (before.hasBatchNo !== flag(v, "has_batch_no") && (await received())) changed.push("Has Batch No");
    if (changed.length) throw new MasterError(`As there are existing submitted transactions against item ${code}, you can not change the value of ${changed.join(", ")}.`);
  }

  const data = {
    itemName,
    itemGroupId: group.id,
    stockUom,
    purchaseUom: str(v, "purchase_uom"),
    description,
    disabled: flag(v, "disabled"),
    isStockItem,
    isPurchaseItem: flag(v, "is_purchase_item"),
    hasVariants,
    hasBatchNo: flag(v, "has_batch_no"),
    hasSerialNo: flag(v, "has_serial_no"),
    serviceItem: flag(v, "service_item"),
    gstHsnCode: hsn,
    isIneligibleForItc: flag(v, "is_ineligible_for_itc"),
    minOrderQty: num(v, "min_order_qty") ?? 0,
    safetyStock: num(v, "safety_stock") ?? 0,
    leadTimeDays: num(v, "lead_time_days") ?? 0,
    weightPerUnit: num(v, "weight_per_unit") ?? 0,
    weightUom: str(v, "weight_uom"),
    countryOfOrigin: country,
    endOfLife: dateOf(str(v, "end_of_life")),
    updatedBy: by,
  };

  let id: string;
  if (before) {
    await tx.purchaseItem.update({ where: { id: before.id }, data });
    id = before.id;
  } else {
    if (await tx.purchaseItem.findUnique({ where: { code }, select: { id: true } })) throw fieldError("item_code", `Item ${code} already exists`);
    if (await tx.purchaseItemGroup.findUnique({ where: { code }, select: { id: true } })) throw fieldError("item_code", "An Item Group exists with same name, please change the item name or rename the item group");
    id = (await tx.purchaseItem.create({ data: { ...data, code, variantOfId: template?.id ?? null, createdBy: by } })).id;
  }

  const existing = before ?? { uomConversions: [], attributes: [], defaults: [], taxes: [] };
  await syncRows(existing.uomConversions.map((r) => r.id), uoms, {
    remove: (ids) => tx.purchaseItemUomConversion.deleteMany({ where: { id: { in: ids }, itemId: id } }),
    update: (rid, r, idx) => tx.purchaseItemUomConversion.update({ where: { id: rid }, data: { idx, uom: rstr(r, "uom")!, conversionFactor: rnum(r, "conversion_factor")! } }),
    create: (r, idx) => tx.purchaseItemUomConversion.create({ data: { itemId: id, idx, uom: rstr(r, "uom")!, conversionFactor: rnum(r, "conversion_factor")! } }),
  });
  const attrRows = hasVariants || template ? attributes : [];
  await syncRows(existing.attributes.map((r) => r.id), attrRows, {
    remove: (ids) => tx.purchaseItemVariantAttribute.deleteMany({ where: { id: { in: ids }, itemId: id } }),
    update: (rid, r, idx) => tx.purchaseItemVariantAttribute.update({ where: { id: rid }, data: { idx, attribute: rstr(r, "attribute")!, attributeValue: template ? rstr(r, "attribute_value") : null, variantOf: template?.code ?? null } }),
    create: (r, idx) => tx.purchaseItemVariantAttribute.create({ data: { itemId: id, idx, attribute: rstr(r, "attribute")!, attributeValue: template ? rstr(r, "attribute_value") : null, variantOf: template?.code ?? null } }),
  });
  const defaultData = (r: Row, i: number) => ({
    companyId: defaultIds[i].companyId,
    defaultWarehouseId: defaultIds[i].warehouseId,
    buyingCostCenterId: defaultIds[i].costCenterId,
    expenseAccountId: defaultIds[i].accountId,
    defaultSupplier: rstr(r, "default_supplier"),
    defaultPriceList: rstr(r, "default_price_list"),
  });
  await syncRows(existing.defaults.map((r) => r.id), defaults, {
    remove: (ids) => tx.purchaseItemDefault.deleteMany({ where: { id: { in: ids }, itemId: id } }),
    update: (rid, r, idx) => tx.purchaseItemDefault.update({ where: { id: rid }, data: { idx, ...defaultData(r, idx - 1) } }),
    create: (r, idx) => tx.purchaseItemDefault.create({ data: { itemId: id, idx, ...defaultData(r, idx - 1) } }),
  });
  const taxData = (r: Row, i: number) => ({
    itemTaxTemplateId: taxIds[i].templateId,
    taxCategoryId: taxIds[i].categoryId,
    validFrom: dateOf(rstr(r, "valid_from")),
    minimumNetRate: rnum(r, "minimum_net_rate") ?? 0,
    maximumNetRate: rnum(r, "maximum_net_rate") ?? 0,
  });
  await syncRows(existing.taxes.map((r) => r.id), taxes, {
    remove: (ids) => tx.purchaseItemTax.deleteMany({ where: { id: { in: ids }, itemId: id } }),
    update: (rid, r, idx) => tx.purchaseItemTax.update({ where: { id: rid }, data: { idx, ...taxData(r, idx - 1) } }),
    create: (r, idx) => tx.purchaseItemTax.create({ data: { itemId: id, idx, ...taxData(r, idx - 1) } }),
  });

  // Item.update_variants: a template's save copies Item Variant Settings' fields to its variants.
  if (before && hasVariants) {
    const n = await updateVariants(tx, id, by);
    if (n) notices.push("Item Variants updated");
  }
  return { id, notices };
}

/** copy_attributes_to_variant for every variant of a template; returns how many were updated. */
async function updateVariants(tx: Tx, templateId: string, by: string): Promise<number> {
  const t = await tx.purchaseItem.findUniqueOrThrow({ where: { id: templateId }, include: { uomConversions: true, defaults: true, taxes: true } });
  const variants = await tx.purchaseItem.findMany({ where: { variantOfId: templateId }, select: { id: true } });
  for (const v of variants) {
    await tx.purchaseItem.update({ where: { id: v.id }, data: variantFieldsOf(t, by) });
    await copyTables(tx, t, v.id);
  }
  return variants.length;
}

/** The template's scalar fields a variant takes (VARIANT_FIELDS). */
function variantFieldsOf(t: Prisma.PurchaseItemGetPayload<object>, by: string) {
  void VARIANT_FIELDS; // the list the copy follows (spec.ts); kept in step with the fields below
  return {
    itemGroupId: t.itemGroupId, gstHsnCode: t.gstHsnCode, stockUom: t.stockUom, isStockItem: t.isStockItem, endOfLife: t.endOfLife,
    hasSerialNo: t.hasSerialNo, hasBatchNo: t.hasBatchNo, weightPerUnit: t.weightPerUnit, weightUom: t.weightUom, disabled: t.disabled,
    isPurchaseItem: t.isPurchaseItem, purchaseUom: t.purchaseUom, minOrderQty: t.minOrderQty, safetyStock: t.safetyStock,
    leadTimeDays: t.leadTimeDays, countryOfOrigin: t.countryOfOrigin, serviceItem: t.serviceItem, isIneligibleForItc: t.isIneligibleForItc,
    updatedBy: by,
  };
}

/** The template's UOMs, Item Defaults and Taxes, as the variant's own rows. */
async function copyTables(tx: Tx, t: Prisma.PurchaseItemGetPayload<{ include: { uomConversions: true; defaults: true; taxes: true } }>, variantId: string) {
  await tx.purchaseItemUomConversion.deleteMany({ where: { itemId: variantId } });
  await tx.purchaseItemDefault.deleteMany({ where: { itemId: variantId } });
  await tx.purchaseItemTax.deleteMany({ where: { itemId: variantId } });
  if (t.uomConversions.length) await tx.purchaseItemUomConversion.createMany({ data: t.uomConversions.map((u) => ({ itemId: variantId, idx: u.idx, uom: u.uom, conversionFactor: u.conversionFactor })) });
  if (t.defaults.length) {
    await tx.purchaseItemDefault.createMany({
      data: t.defaults.map((d) => ({ itemId: variantId, idx: d.idx, companyId: d.companyId, defaultWarehouseId: d.defaultWarehouseId, expenseAccountId: d.expenseAccountId, buyingCostCenterId: d.buyingCostCenterId, defaultSupplier: d.defaultSupplier, defaultPriceList: d.defaultPriceList })),
    });
  }
  if (t.taxes.length) {
    await tx.purchaseItemTax.createMany({
      data: t.taxes.map((x) => ({ itemId: variantId, idx: x.idx, itemTaxTemplateId: x.itemTaxTemplateId, taxCategoryId: x.taxCategoryId, validFrom: x.validFrom, minimumNetRate: x.minimumNetRate, maximumNetRate: x.maximumNetRate })),
    });
  }
}

/** find_variant: the template's variant with exactly these attribute values, other than `except`. */
async function findVariant(tx: Tx, templateId: string, args: Record<string, string>, except: string | null): Promise<string | null> {
  const keys = Object.keys(args);
  const candidates = await tx.purchaseItem.findMany({
    where: { variantOfId: templateId, ...(except ? { id: { not: except } } : {}) },
    select: { code: true, attributes: { select: { attribute: true, attributeValue: true } } },
  });
  const hit = candidates.find((c) => c.attributes.length === keys.length && keys.every((k) => c.attributes.some((a) => a.attribute === k && (a.attributeValue ?? "") === args[k])));
  return hit?.code ?? null;
}

// Variants ----------------------------------------------------------------------------------------

/**
 * Create → Single Variant (create_variant): the new variant's values, from the template (its
 * code and name with the values' abbreviations, Item Variant Settings' fields, the attributes
 * with their values), opened as a new item to save; or the variant that already has them.
 */
export async function variantDraft(templateId: string, args: Record<string, string>): Promise<{ values: Values } | { exists: string; id: string } | { error: string }> {
  const t = await db.purchaseItem.findUnique({ where: { id: templateId }, include: ITEM_INCLUDE });
  if (!t || !t.hasVariants) return { error: "This Item is not a Template." };
  const same = await findVariant(db, t.id, args, null);
  if (same) {
    const v = await db.purchaseItem.findUnique({ where: { code: same }, select: { id: true } });
    return { exists: same, id: v!.id };
  }
  const abbrs: string[] = [];
  for (const a of t.attributes) {
    const value = args[a.attribute];
    if (!value) continue;
    const attr = await db.purchaseItemAttribute.findUnique({ where: { code: a.attribute }, include: { values: true } });
    if (!attr) continue;
    abbrs.push(attr.numericValues ? value : (attr.values.find((x) => x.attributeValue === value)?.abbr ?? value));
  }
  const base = itemValues(t);
  const names = variantNames(t.code, t.itemName, abbrs);
  const values: Values = {
    ...base,
    _name: null,
    item_code: names?.code ?? null,
    item_name: names?.name ?? null,
    // Description is not one of Item Variant Settings' fields: the variant's becomes its Item Name.
    description: null,
    has_variants: false,
    variant_of: t.code,
    variant_based_on: "Item Attribute",
    last_purchase_rate: "0",
    attributes: t.attributes.filter((a) => args[a.attribute]).map((a, i) => ({ _key: `new-attr-${i}`, attribute: a.attribute, attribute_value: args[a.attribute] })),
    uoms: rowsOf(base, "uoms").map((r, i) => ({ ...r, _key: `new-uom-${i}` })),
    item_defaults: rowsOf(base, "item_defaults").map((r, i) => ({ ...r, _key: `new-default-${i}` })),
    taxes: rowsOf(base, "taxes").map((r, i) => ({ ...r, _key: `new-tax-${i}` })),
  };
  return { values };
}

/**
 * Create → Multiple Variants (create_multiple_variants): every combination of the values picked,
 * except those a variant already has, each saved as a new item. Fewer than 600 at a time.
 */
export function createVariants(user: PurchaseUser, templateId: string, picked: Record<string, string[]>): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const lists = Object.entries(picked).filter(([, vals]) => vals.length);
    const total = lists.reduce((n, [, vals]) => n * vals.length, lists.length ? 1 : 0);
    if (!total) throw new MasterError("Please select at least one value from each of the attributes.");
    if (total >= 600) throw new MasterError("Please do not create more than 500 items at a time");
    let combos: Record<string, string>[] = [{}];
    for (const [attr, vals] of lists) combos = combos.flatMap((c) => vals.map((x) => ({ ...c, [attr]: x })));
    return db.$transaction(
      async (tx) => {
        let created = 0;
        for (const args of combos) {
          if (await findVariant(tx, templateId, args, null)) continue;
          const draft = await variantDraft(templateId, args);
          if ("error" in draft) throw new MasterError(draft.error);
          if ("exists" in draft) continue;
          await writeItem(tx, user.email, draft.values, null);
          created++;
        }
        return { id: templateId, notices: [`${created} variants created.`] };
      },
      { timeout: 120_000 },
    );
  });
}

// Delete ------------------------------------------------------------------------------------------

/** Deletes an item no PO line, Cost Overhead row or variant points at (check_if_doc_is_linked). */
export function deleteItem(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const i = await tx.purchaseItem.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!i) throw new MasterError("This Item no longer exists. It may have been deleted.");
      const line = await tx.purchaseOrderItem.findFirst({ where: { itemId: i.id }, select: { idx: true, order: { select: { number: true } } }, orderBy: { order: { number: "asc" } } });
      if (line) throw new MasterError(`Cannot delete or cancel because Item ${i.code} is linked with Purchase Order ${line.order.number} at Row: ${line.idx}`);
      const overhead = await tx.purchaseOrderCostOverhead.findFirst({ where: { serviceItemId: i.id }, select: { idx: true, order: { select: { number: true } } } });
      if (overhead) throw new MasterError(`Cannot delete or cancel because Item ${i.code} is linked with Purchase Order ${overhead.order.number} at Row: ${overhead.idx}`);
      const variant = await tx.purchaseItem.findFirst({ where: { variantOfId: i.id }, select: { code: true } });
      if (variant) throw new MasterError(`Cannot delete or cancel because Item ${i.code} is linked with Item ${variant.code}`);
      await tx.purchaseItem.delete({ where: { id: i.id } });
    });
    return undefined;
  });
}
