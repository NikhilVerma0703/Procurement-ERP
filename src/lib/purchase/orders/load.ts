// Reading a stored PO for the form, the save and the workflow actions. Server
// only; the pure views of the record are in record.ts.
import "server-only";
import type { Prisma } from "@prisma/client";
import type { CurrencyDisplay } from "../format";
import { db } from "../server/db";
import { ORDER_INCLUDE, type OrderRecord } from "./record";

type Client = Prisma.TransactionClient | typeof db;

/** A PO with everything the form and its history need, or null. */
export function orderRecord(id: string, client: Client = db): Promise<OrderRecord | null> {
  return client.purchaseOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
}

/** How a currency's amounts are shown (its symbol and fraction). */
export async function currencyDisplay(code: string, client: Client = db): Promise<CurrencyDisplay> {
  const c = await client.purchaseCurrency.findUnique({ where: { code }, select: { symbol: true, fractionUnits: true } });
  return { symbol: c?.symbol ?? null, fractionUnits: c?.fractionUnits ?? null };
}
