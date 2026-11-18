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
import { siteToday } from "@/lib/purchase/format";
import { purchaseGate, purchaseRefusal } from "@/lib/purchase/server/gate";
import { db } from "@/lib/purchase/server/db";

export const dynamic = "force-dynamic";

const LIMIT = 20;
type Row = { value: string; description?: string | null };
interface Args {
  q: string;
  company: string | null;
  supplier: string | null;
  customer: string | null;
  item: string | null;
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
  const rows = await lookup({ q, company: sp.get("company"), supplier: sp.get("supplier"), customer: sp.get("customer"), item: sp.get("item") });
  return NextResponse.json({ results: rank(rows, q) });
}
