// Writes a built import into the database — all of it or none of it.
//
// One transaction: empty the module's tables (TRUNCATE … CASCADE), then insert
// every table in INSERT_ORDER in chunks. Any failure rolls the whole thing
// back and the database is exactly as it was. KEEP_ON_RELOAD is never
// emptied: the history of the imports themselves, and the sign-in accounts.
//
// A RELOAD, NOT A MERGE: this is for bringing the old site's data in before
// go-live (again on the final backup). Once POs have been raised in this
// system, reloading would wipe them — so assertReloadAllowed() refuses unless
// the caller forces it.
import { Prisma, type PrismaClient } from "@prisma/client";
import { INSERT_ORDER, type Built } from "./build";

/** Each Built list → the Prisma delegate that stores it. */
const DELEGATE: Record<(typeof INSERT_ORDER)[number], string> = {
  companies: "purchaseCompany", currencies: "purchaseCurrency", currencyExchanges: "purchaseCurrencyExchange",
  uoms: "purchaseUom", priceLists: "purchasePriceList", taxCategories: "purchaseTaxCategory", accounts: "purchaseAccount",
  costCenters: "purchaseCostCenter", warehouses: "purchaseWarehouse", letterHeads: "purchaseLetterHead",
  namingSeries: "purchaseNamingSeries", taxTemplates: "purchaseTaxTemplate", taxTemplateRows: "purchaseTaxTemplateRow",
  itemTaxTemplates: "purchaseItemTaxTemplate", itemTaxTemplateRates: "purchaseItemTaxTemplateRate",
  paymentTerms: "purchasePaymentTerm", paymentTermsTemplates: "purchasePaymentTermsTemplate",
  paymentTermsTemplateRows: "purchasePaymentTermsTemplateRow", termsTemplates: "purchaseTermsTemplate",
  supplierGroups: "purchaseSupplierGroup", addresses: "purchaseAddress", contacts: "purchaseContact",
  contactEmails: "purchaseContactEmail", contactPhones: "purchaseContactPhone", customers: "purchaseCustomer",
  suppliers: "purchaseSupplier", addressLinks: "purchaseAddressLink", contactLinks: "purchaseContactLink",
  itemGroups: "purchaseItemGroup", items: "purchaseItem", itemUomConversions: "purchaseItemUomConversion",
  itemDefaults: "purchaseItemDefault", itemTaxes: "purchaseItemTax", itemAttributes: "purchaseItemAttribute",
  itemAttributeValues: "purchaseItemAttributeValue", itemVariantAttributes: "purchaseItemVariantAttribute", hsnCodes: "purchaseHsnCode",
  orders: "purchaseOrder", orderItems: "purchaseOrderItem",
  orderTaxes: "purchaseOrderTax", orderCostOverheads: "purchaseOrderCostOverhead",
  orderPaymentSchedules: "purchaseOrderPaymentSchedule", orderLinks: "purchaseOrderLink", orderEvents: "purchaseOrderEvent",
  attachments: "purchaseAttachment", users: "purchaseUser",
};

/** The module's tables, read from the schema itself (purchase_* except the run log). */
/** Module tables a reload leaves alone: the import log, and the standalone app's sign-in accounts. */
export const KEEP_ON_RELOAD: readonly string[] = ["purchase_import_runs", "purchase_logins"];

export function moduleTables(): string[] {
  return Prisma.dmmf.datamodel.models
    .map((m) => m.dbName ?? m.name)
    .filter((t) => t.startsWith("purchase_") && !KEEP_ON_RELOAD.includes(t));
}

/**
 * Refuses a reload that would wipe records made in this system: POs raised here, and suppliers,
 * items, addresses and contacts made on the masters screens (Step 8). Imported rows carry
 * `legacy`; these do not.
 */
export async function assertReloadAllowed(db: PrismaClient, force: boolean): Promise<void> {
  const none = { legacy: { equals: Prisma.DbNull } };
  const [orders, suppliers, items, addresses, contacts] = await Promise.all([
    db.purchaseOrder.count({ where: none }),
    db.purchaseSupplier.count({ where: none }),
    db.purchaseItem.count({ where: none }),
    db.purchaseAddress.count({ where: none }),
    db.purchaseContact.count({ where: none }),
  ]);
  const made = [[orders, "purchase order"], [suppliers, "supplier"], [items, "item"], [addresses, "address"], [contacts, "contact"]] as const;
  const found = made.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}${n === 1 ? "" : what.endsWith("s") ? "es" : "s"}`);
  if (found.length && !force) {
    throw new Error(
      `${found.join(", ")} were made in this system after the import. Reloading the old site's data ` +
        `would delete them. Nothing was changed. (Run with --force only if that is really intended.)`,
    );
  }
}

type CreateMany = { createMany(args: { data: unknown[] }): Promise<{ count: number }> };

/** Postgres takes at most 65,535 bind parameters per statement; stay well under. */
const MAX_PARAMS = 30_000;

export async function loadAll(db: PrismaClient, built: Built, log: (msg: string) => void): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await db.$transaction(
    async (tx) => {
      const tables = moduleTables().map((t) => `"${t}"`).join(", ");
      // All the module's tables in one statement, and no CASCADE: inside the Main ERP, a table of
      // another module pointing at one of these makes Postgres refuse rather than empty it too.
      await tx.$executeRawUnsafe(`TRUNCATE ${tables}`);
      for (const key of INSERT_ORDER) {
        const data = built[key] as unknown[];
        const delegate = (tx as unknown as Record<string, CreateMany>)[DELEGATE[key]];
        const width = Math.max(1, ...data.slice(0, 50).map((r) => Object.keys(r as object).length));
        const chunk = Math.max(1, Math.floor(MAX_PARAMS / width));
        let n = 0;
        for (let i = 0; i < data.length; i += chunk) {
          n += (await delegate.createMany({ data: data.slice(i, i + chunk) })).count;
        }
        counts[key] = n;
        log(`  ${key.padEnd(26)} ${String(n).padStart(6)}`);
      }
    },
    { timeout: 30 * 60_000, maxWait: 60_000 },
  );
  return counts;
}
