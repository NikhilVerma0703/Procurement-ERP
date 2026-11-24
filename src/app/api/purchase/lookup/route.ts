// Link-field search for the PO form (Frappe's search_link and the PO form's
// set_query filters): GET /api/purchase/lookup?type=supplier&q=jyo[&company=…]
//
// As on the old site, a search leaves out disabled records, and each link
// keeps its form's filter: purchase items that are not templates or past
// their end of life (item_query), service items for Cost Overheads (the
// add-on), the company's warehouses and cost centres that are not groups,
// the tax account types ERPNext offered on purchase tax rows, the supplier's
// own addresses and contacts, the company's addresses, an item's own UOMs.
// Results: { value, description } — the name, and what Frappe showed under it.
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { COUNTRIES } from "@/lib/purchase/countries";
import { siteToday } from "@/lib/purchase/format";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { db } from "@/lib/purchase/server/db";
import { labelOf, PO_STATUS_KEYS } from "@/lib/purchase/orders/labels";
import { financialYears } from "@/lib/purchase/stock/gate-entry-meta";

export const dynamic = "force-dynamic";

const LIMIT = 20;
type Row = { value: string; description?: string | null };
interface Args {
  q: string;
  company: string | null;
  supplier: string | null;
  customer: string | null;
  item: string | null;
  attribute: string | null;
  /** Any other parameter of the request (a set_query's filters). */
  extra: (key: string) => string | null;
}

const has = (q: string) => ({ contains: q, mode: "insensitive" as const });
const PURCHASE_TAX_ACCOUNT_TYPES = ["Tax", "Chargeable", "Income Account", "Expenses Included In Valuation"];

/** Exact and leading matches first, as Frappe ranked them. */
function rank(rows: Row[], q: string): Row[] {
  const s = q.toLowerCase();
  const score = (r: Row) => {
    const v = r.value.toLowerCase();
    if (!s) return 0;
    if (v === s) return 0;
    if (v.startsWith(s)) return 1;
    if (v.includes(s)) return 2;
    return 3;
  };
  return rows.sort((a, b) => score(a) - score(b) || a.value.localeCompare(b.value)).slice(0, LIMIT);
}

const companyFilter = (company: string | null) => (company ? { company: { code: company } } : {});

const LOOKUPS: Record<string, (a: Args) => Promise<Row[]>> = {
  supplier: async ({ q }) =>
    (await db.purchaseSupplier.findMany({
      where: { disabled: false, ...(q ? { OR: [{ code: has(q) }, { supplierName: has(q) }] } : {}) },
      select: { code: true, supplierName: true, supplierGroup: { select: { code: true } } },
      take: 60,
      orderBy: { code: "asc" },
    })).map((s) => ({ value: s.code, description: [s.supplierName !== s.code ? s.supplierName : null, s.supplierGroup?.code].filter(Boolean).join(", ") })),

  company: async ({ q }) =>
    (await db.purchaseCompany.findMany({ where: q ? { code: has(q) } : {}, select: { code: true }, take: LIMIT })).map((c) => ({ value: c.code })),

  // The masters' own links (Step 8).
  country: async ({ q }) => COUNTRIES.filter((c) => !q || c.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map((c) => ({ value: c })),

  supplierGroup: async ({ q }) =>
    (await db.purchaseSupplierGroup.findMany({ where: q ? { code: has(q) } : {}, select: { code: true }, take: 60 })).map((g) => ({ value: g.code })),

  itemGroup: async ({ q }) =>
    (await db.purchaseItemGroup.findMany({ where: q ? { code: has(q) } : {}, select: { code: true }, take: 60, orderBy: { code: "asc" } })).map((g) => ({ value: g.code })),

  // India Compliance: "You can search code by the description of the category."
  hsnCode: async ({ q }) =>
    (await db.purchaseHsnCode.findMany({
      where: q ? { OR: [{ code: { startsWith: q } }, { description: has(q) }] } : {},
      select: { code: true, description: true },
      take: 60,
      orderBy: { code: "asc" },
    })).map((h) => ({ value: h.code, description: h.description ? h.description.slice(0, 120) : null })),

  itemAttribute: async ({ q }) =>
    (await db.purchaseItemAttribute.findMany({ where: q ? { code: has(q) } : {}, select: { code: true }, take: 60 })).map((a) => ({ value: a.code })),

  // An attribute's values (the variant's Attribute Value), with the abbreviation its code takes.
  itemAttributeValue: async ({ q, attribute }) =>
    attribute
      ? (await db.purchaseItemAttributeValue.findMany({
          where: { attribute: { code: attribute }, ...(q ? { attributeValue: has(q) } : {}) },
          select: { attributeValue: true, abbr: true },
          orderBy: { idx: "asc" },
          take: 60,
        })).map((v) => ({ value: v.attributeValue, description: v.abbr !== v.attributeValue ? v.abbr : null }))
      : [],

  // A contact's User Id: the old site's users.
  user: async ({ q }) =>
    (await db.purchaseUser.findMany({
      where: { enabled: true, ...(q ? { OR: [{ email: has(q) }, { fullName: has(q) }] } : {}) },
      select: { email: true, fullName: true },
      take: 60,
    })).map((u) => ({ value: u.email, description: u.fullName })),

  // No Tax Withholding Category table came across (one supplier ever had one): the values in use.
  taxWithholdingCategory: async ({ q }) =>
    (await db.purchaseSupplier.findMany({
      where: { taxWithholdingCategory: q ? has(q) : { not: null } },
      select: { taxWithholdingCategory: true },
      distinct: ["taxWithholdingCategory"],
      take: 60,
    })).filter((s) => s.taxWithholdingCategory).map((s) => ({ value: s.taxWithholdingCategory! })),

  item: async ({ q }) => {
    const today = new Date(`${siteToday()}T00:00:00Z`);
    const rows = await db.purchaseItem.findMany({
      where: {
        disabled: false,
        hasVariants: false,
        isPurchaseItem: true,
        OR: [{ endOfLife: null }, { endOfLife: { gt: today } }],
        ...(q ? { AND: [{ OR: [{ code: has(q) }, { itemName: has(q) }, { description: has(q) }] }] } : {}),
      },
      select: { code: true, itemName: true, itemGroup: { select: { code: true } } },
      take: 60,
      orderBy: { code: "asc" },
    });
    return rows.map((i) => ({ value: i.code, description: [i.itemName !== i.code ? i.itemName : null, i.itemGroup?.code].filter(Boolean).join(", ") }));
  },

  serviceItem: async ({ q }) =>
    (await db.purchaseItem.findMany({
      where: { disabled: false, serviceItem: true, ...(q ? { OR: [{ code: has(q) }, { itemName: has(q) }] } : {}) },
      select: { code: true, itemName: true },
      take: 60,
      orderBy: { code: "asc" },
    })).map((i) => ({ value: i.code, description: i.itemName !== i.code ? i.itemName : null })),

  currency: async ({ q }) =>
    (await db.purchaseCurrency.findMany({ where: { enabled: true, ...(q ? { code: has(q) } : {}) }, select: { code: true }, take: 60 })).map((c) => ({ value: c.code })),

  priceList: async ({ q }) =>
    (await db.purchasePriceList.findMany({
      where: { enabled: true, buying: true, ...(q ? { code: has(q) } : {}) },
      select: { code: true, currency: true },
      take: 60,
    })).map((p) => ({ value: p.code, description: p.currency })),

  warehouse: async ({ q, company }) =>
    (await db.purchaseWarehouse.findMany({
      where: { disabled: false, isGroup: false, ...companyFilter(company), ...(q ? { OR: [{ code: has(q) }, { warehouseName: has(q) }] } : {}) },
      select: { code: true },
      take: 60,
    })).map((w) => ({ value: w.code })),

  costCenter: async ({ q, company }) =>
    (await db.purchaseCostCenter.findMany({
      where: { disabled: false, isGroup: false, ...companyFilter(company), ...(q ? { OR: [{ code: has(q) }, { costCenterName: has(q) }] } : {}) },
      select: { code: true },
      take: 60,
    })).map((c) => ({ value: c.code })),

  // get_expense_account: the company's ledger accounts.
  expenseAccount: async ({ q, company }) =>
    (await db.purchaseAccount.findMany({
      where: { disabled: false, isGroup: false, ...companyFilter(company), ...(q ? { OR: [{ code: has(q) }, { accountName: has(q) }] } : {}) },
      select: { code: true },
      take: 60,
    })).map((a) => ({ value: a.code })),

  // tax_account_query on a purchase: these account types, the company's, not groups.
  taxAccount: async ({ q, company }) =>
    (await db.purchaseAccount.findMany({
      where: {
        disabled: false, isGroup: false, accountType: { in: PURCHASE_TAX_ACCOUNT_TYPES }, ...companyFilter(company),
        ...(q ? { OR: [{ code: has(q) }, { accountName: has(q) }] } : {}),
      },
      select: { code: true, accountType: true },
      take: 60,
    })).map((a) => ({ value: a.code, description: a.accountType })),

  itemTaxTemplate: async ({ q }) =>
    (await db.purchaseItemTaxTemplate.findMany({
      where: { disabled: false, ...(q ? { OR: [{ code: has(q) }, { title: has(q) }] } : {}) },
      select: { code: true },
      take: 60,
    })).map((t) => ({ value: t.code })),

  taxCategory: async ({ q }) =>
    (await db.purchaseTaxCategory.findMany({ where: { disabled: false, ...(q ? { code: has(q) } : {}) }, select: { code: true }, take: 60 })).map((t) => ({ value: t.code })),

  taxTemplate: async ({ q, company }) =>
    (await db.purchaseTaxTemplate.findMany({
      where: { disabled: false, ...companyFilter(company), ...(q ? { code: has(q) } : {}) },
      select: { code: true },
      take: 60,
    })).map((t) => ({ value: t.code })),

  // address_query: addresses linked to the party.
  supplierAddress: async ({ q, supplier }) => addresses(q, supplier ? { supplier: { code: supplier } } : null),
  companyAddress: async ({ q, company }) => addresses(q, company ? { company: { code: company } } : null),

  supplierContact: async ({ q, supplier }) => contacts(q, supplier ? { supplier: { code: supplier } } : null),
  customerContact: async ({ q, customer }) => contacts(q, customer ? { customer: { code: customer } } : null),

  customer: async ({ q }) =>
    (await db.purchaseCustomer.findMany({
      where: { disabled: false, ...(q ? { OR: [{ code: has(q) }, { customerName: has(q) }] } : {}) },
      select: { code: true, customerName: true },
      take: 60,
    })).map((c) => ({ value: c.code, description: c.customerName !== c.code ? c.customerName : null })),

  paymentTermsTemplate: async ({ q }) =>
    (await db.purchasePaymentTermsTemplate.findMany({ where: q ? { code: has(q) } : {}, select: { code: true }, take: 60 })).map((t) => ({ value: t.code })),

  paymentTerm: async ({ q }) =>
    (await db.purchasePaymentTerm.findMany({ where: q ? { code: has(q) } : {}, select: { code: true }, take: 60 })).map((t) => ({ value: t.code })),

  // Terms and Conditions for buying.
  termsTemplate: async ({ q }) =>
    (await db.purchaseTermsTemplate.findMany({
      where: { disabled: false, buying: true, ...(q ? { OR: [{ code: has(q) }, { title: has(q) }] } : {}) },
      select: { code: true },
      take: 60,
    })).map((t) => ({ value: t.code })),

  letterHead: async ({ q }) =>
    (await db.purchaseLetterHead.findMany({ where: { disabled: false, ...(q ? { code: has(q) } : {}) }, select: { code: true }, take: LIMIT })).map((l) => ({ value: l.code })),

  // Phase II (Stock): the receipt form's links.
  // A row's batch: the item's own batches (ERPNext's batch query).
  batch: async ({ q, item }) =>
    (await db.purchaseBatch.findMany({
      where: { ...(item ? { itemCode: item } : {}), ...(q ? { code: has(q) } : {}) },
      select: { code: true, itemCode: true, manufacturingDate: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    })).map((b) => ({ value: b.code, description: [b.itemCode, b.manufacturingDate ? b.manufacturingDate.toISOString().slice(0, 10) : null].filter(Boolean).join(", ") })),

  // A receipt's Gate Entry (the add-on's): submitted entries, of the receipt's supplier when it has one.
  gateEntry: async ({ q, supplier }) =>
    (await db.purchaseGateEntry.findMany({
      where: { docStatus: "SUBMITTED", ...(supplier ? { supplierCode: supplier } : {}), ...(q ? { OR: [{ number: has(q) }, { orderNumber: has(q) }, { invoiceNo: has(q) }] } : {}) },
      select: { number: true, orderNumber: true, supplierCode: true },
      orderBy: { number: "desc" },
      take: 60,
    })).map((g) => ({ value: g.number, description: [g.orderNumber, g.supplierCode].filter(Boolean).join(", ") })),

  // The Gate Entry's Po No (the add-on's set_query): submitted, not Closed, less than 99 % received.
  // Its description as the old picker showed it (the PO's search fields): supplier, status, date and
  // grand total as Python printed them ("298890.0").
  gateEntryOrder: async ({ q }) =>
    (await db.purchaseOrder.findMany({
      where: { docStatus: "SUBMITTED", status: { not: "CLOSED" }, perReceived: { lt: 99 }, ...(q ? { OR: [{ number: has(q) }, { supplierName: has(q) }, { supplier: { code: has(q) } }] } : {}) },
      select: { number: true, status: true, transactionDate: true, grandTotal: true, supplier: { select: { code: true } } },
      orderBy: { number: "asc" },
      take: 60,
    })).map((o) => {
      const total = Number(o.grandTotal);
      return {
        value: o.number,
        description: [o.supplier.code, labelOf(PO_STATUS_KEYS, o.status), o.transactionDate.toISOString().slice(0, 10), Number.isInteger(total) ? total.toFixed(1) : String(total)].join(", "),
      };
    }),

  // The Gate Entry's Financial Year (the company's April-to-March years).
  fiscalYear: async ({ q }) => financialYears(siteToday()).filter((y) => !q || y.includes(q)).map((y) => ({ value: y })),

  // A Purchase Order to receive against: submitted, of the supplier, not closed or fully received.
  purchaseOrder: async ({ q, supplier }) =>
    (await db.purchaseOrder.findMany({
      where: {
        docStatus: "SUBMITTED", status: { notIn: ["CLOSED", "ON_HOLD", "COMPLETED", "DELIVERED"] },
        ...(supplier ? { supplier: { code: supplier } } : {}), ...(q ? { OR: [{ number: has(q) }, { supplierName: has(q) }] } : {}),
      },
      select: { number: true, supplierName: true, transactionDate: true },
      orderBy: { number: "desc" },
      take: 60,
    })).map((o) => ({ value: o.number, description: [o.supplierName, o.transactionDate.toISOString().slice(0, 10)].join(", ") })),

  // --- The Stock screens drawn from their definitions (owner, 24-11-2026): Frappe's own search over a
  // DocType (enabled records), narrowed by each form script's set_query. ---
  // Any item (search_link over Item); "variants=0" leaves out templates (item_price.js).
  stdItem: async ({ q, extra }) =>
    (await db.purchaseItem.findMany({
      where: { disabled: false, ...(extra("variants") === "0" ? { hasVariants: false } : {}), ...(q ? { OR: [{ code: has(q) }, { itemName: has(q) }, { description: has(q) }] } : {}) },
      select: { code: true, itemName: true, itemGroup: { select: { code: true } } },
      take: 60,
      orderBy: { code: "asc" },
    })).map((i) => ({ value: i.code, description: [i.itemName !== i.code ? i.itemName : null, i.itemGroup?.code].filter(Boolean).join(", ") })),

  // item_alternative.js: items that allow an alternative.
  alternativeItem: async ({ q }) =>
    (await db.$queryRaw<{ code: string; item_name: string }[]>`
      SELECT code, item_name FROM purchase_items
      WHERE disabled = false AND legacy->>'allow_alternative_item' = '1'
        AND (${q} = '' OR code ILIKE ${`%${q}%`} OR item_name ILIKE ${`%${q}%`})
      ORDER BY code LIMIT 60`).map((i) => ({ value: i.code, description: i.item_name !== i.code ? i.item_name : null })),

  // product_bundle.py get_new_item_code: items not kept in stock, not fixed assets, not bundles already.
  bundleItem: async ({ q }) => {
    const bundled = (await db.purchaseDocument.findMany({ where: { doctype: "Product Bundle" }, select: { erpnextName: true } })).map((b) => b.erpnextName);
    return (await db.purchaseItem.findMany({
      where: { disabled: false, isStockItem: false, isFixedAsset: false, code: { notIn: bundled }, ...(q ? { OR: [{ code: has(q) }, { itemName: has(q) }] } : {}) },
      select: { code: true, itemName: true },
      take: 60,
      orderBy: { code: "asc" },
    })).map((i) => ({ value: i.code, description: i.itemName !== i.code ? i.itemName : null }));
  },

  // Any enabled price list; pricing_rule.js narrows it to the rule's selling, buying and currency.
  anyPriceList: async ({ q, extra }) =>
    (await db.purchasePriceList.findMany({
      where: {
        enabled: true,
        ...(extra("buying") === "1" ? { buying: true } : {}),
        ...(extra("selling") === "1" ? { selling: true } : {}),
        ...(extra("currency") ? { currency: extra("currency")! } : {}),
        ...(q ? { code: has(q) } : {}),
      },
      select: { code: true, currency: true },
      take: 60,
      orderBy: { code: "asc" },
    })).map((p) => ({ value: p.code, description: p.currency })),

  // item_group.js: a parent is a group, and not the group itself.
  parentItemGroup: async ({ q, extra }) =>
    (await db.purchaseItemGroup.findMany({
      where: { isGroup: true, ...(extra("exclude") ? { code: { not: extra("exclude")! } } : {}), ...(q ? { AND: [{ code: has(q) }] } : {}) },
      select: { code: true },
      take: 60,
      orderBy: { code: "asc" },
    })).map((g) => ({ value: g.code })),

  stockEntryType: async ({ q }) =>
    (await db.purchaseStockEntryType.findMany({ where: q ? { code: has(q) } : {}, select: { code: true }, take: 60, orderBy: { code: "asc" } })).map((t) => ({ value: t.code })),

  // An Account (search_link): the company's, not groups.
  account: async ({ q, company }) =>
    (await db.purchaseAccount.findMany({
      where: { disabled: false, isGroup: false, ...companyFilter(company), ...(q ? { OR: [{ code: has(q) }, { accountName: has(q) }] } : {}) },
      select: { code: true },
      take: 60,
    })).map((a) => ({ value: a.code })),

  // get_item_uom_query: the item's stock UOM and the UOMs of its conversion table.
  uom: async ({ q, item }) => {
    if (!item) {
      return (await db.purchaseUom.findMany({ where: { enabled: true, ...(q ? { name: has(q) } : {}) }, select: { name: true }, take: 60 })).map((u) => ({ value: u.name }));
    }
    const i = await db.purchaseItem.findUnique({ where: { code: item }, select: { stockUom: true, uomConversions: { select: { uom: true, conversionFactor: true } } } });
    if (!i) return [];
    const rows: Row[] = [{ value: i.stockUom, description: "1" }, ...i.uomConversions.filter((c) => c.uom !== i.stockUom).map((c) => ({ value: c.uom, description: String(Number(c.conversionFactor)) }))];
    return rows.filter((r) => !q || r.value.toLowerCase().includes(q.toLowerCase()));
  },
};

async function addresses(q: string, link: Prisma.PurchaseAddressLinkWhereInput | null): Promise<Row[]> {
  if (!link) return [];
  const rows = await db.purchaseAddress.findMany({
    where: { disabled: false, links: { some: link }, ...(q ? { OR: [{ code: has(q) }, { addressLine1: has(q) }, { city: has(q) }] } : {}) },
    select: { code: true, addressLine1: true, city: true },
    orderBy: [{ isPrimaryAddress: "desc" }, { code: "asc" }],
    take: 60,
  });
  return rows.map((a) => ({ value: a.code, description: [a.addressLine1, a.city].filter(Boolean).join(", ") }));
}

async function contacts(q: string, link: Prisma.PurchaseContactLinkWhereInput | null): Promise<Row[]> {
  if (!link) return [];
  const rows = await db.purchaseContact.findMany({
    where: { links: { some: link }, ...(q ? { OR: [{ code: has(q) }, { firstName: has(q) }, { emailId: has(q) }] } : {}) },
    select: { code: true, firstName: true, lastName: true, emailId: true },
    orderBy: [{ isPrimaryContact: "desc" }, { code: "asc" }],
    take: 60,
  });
  return rows.map((c) => ({ value: c.code, description: [[c.firstName, c.lastName].filter(Boolean).join(" "), c.emailId].filter(Boolean).join(", ") }));
}

export async function GET(req: NextRequest) {
  const g = await purchaseGate("view");
  if (!g.ok) return NextResponse.json({ error: purchaseRefusal(g) }, { status: g.status });
  const sp = req.nextUrl.searchParams;
  const lookup = LOOKUPS[sp.get("type") ?? ""];
  if (!lookup || !Object.prototype.hasOwnProperty.call(LOOKUPS, sp.get("type") ?? "")) {
    return NextResponse.json({ error: "Unknown lookup" }, { status: 400 });
  }
  const q = (sp.get("q") ?? "").trim().slice(0, 140);
  const rows = await lookup({
    q, company: sp.get("company"), supplier: sp.get("supplier"), customer: sp.get("customer"), item: sp.get("item"), attribute: sp.get("attribute"),
    extra: (key) => (sp.get(key) ?? "").slice(0, 140) || null,
  });
  return NextResponse.json({ results: rank(rows, q) });
}
