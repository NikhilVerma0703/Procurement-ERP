// What Frappe's Standard print looks up (standard-print.ts), from this ERP's data: the currencies, each
// company's currency, the titles linked records print with; and a record of each DocType as the print
// reads it. Server only.
import "server-only";
import { db } from "../server/db";
import { loadReceiptDoc } from "../stock/receipts";
import type { PrintRecord, PrintSystem } from "./standard-print";

type Legacy = Record<string, unknown>;

export async function printSystem(linkTitles: Record<string, string> = {}): Promise<PrintSystem> {
  const [currencies, companies] = await Promise.all([
    db.purchaseCurrency.findMany({ select: { code: true, symbol: true, fractionUnits: true } }),
    db.purchaseCompany.findMany({ select: { code: true, defaultCurrency: true } }),
  ]);
  return {
    currencies: Object.fromEntries(currencies.map((c) => [c.code, { symbol: c.symbol, fractionUnits: c.fractionUnits }])),
    companyCurrency: Object.fromEntries(companies.map((c) => [c.code, c.defaultCurrency ?? "INR"])),
    linkTitles,
    defaultCurrency: "INR",
  };
}

/** A record and its child tables, split as the print reads them. */
export function recordOf(doctype: string, doc: Legacy, tables: readonly string[]): PrintRecord {
  const values: Legacy = {};
  const children: Record<string, Legacy[]> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (tables.includes(k)) children[k] = Array.isArray(v) ? (v as Legacy[]) : [];
    else values[k] = v;
  }
  return { doctype, values, children };
}

/** A Purchase Receipt as the form shows it (the GST Breakup built as India Compliance built it). */
export async function receiptPrintRecord(id: string): Promise<{ record: PrintRecord; system: PrintSystem } | null> {
  const loaded = await loadReceiptDoc(db, id);
  if (!loaded) return null;
  const titles = Object.fromEntries([...loaded.linkTitles].map(([k, v]) => [k.replace("\u0000", "::"), v]));
  return { record: recordOf("Purchase Receipt", loaded.doc, ["items", "taxes", "services_items", "supplied_items", "pricing_rules"]), system: await printSystem(titles) };
}
