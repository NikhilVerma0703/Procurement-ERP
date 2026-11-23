// Tools › "Update Rate as per Last Purchase" on a draft PO (purchase_order.py get_last_purchase_rate,
// buying/utils.py get_last_purchase_details): each row's rates become those of the item's last
// purchase, in this row's UOM and this PO's currency.
//
//   * The last purchase is the item's line on the latest submitted PO other than this one (by date,
//     then name). Its rates are per stock unit (divided by that line's conversion factor), then
//     multiplied by this row's factor; the PO's exchange rate turns the company-currency rate into
//     this PO's currency. The discount % comes as it was.
//   * An item never bought on a submitted PO keeps the item's own Last Purchase Rate, put in as it is
//     for every rate (ERPNext did not convert it).
//   * ERPNext also looked at the item's last Purchase Receipt and took it when newer. Receipts are not
//     part of this module (they were made from these POs at these rates), so the PO line decides.
// Server only.
import "server-only";
import { db } from "../server/db";

export interface LastPurchaseRow {
  itemCode: string | null;
  /** This row's UOM conversion factor. */
  conversionFactor: number;
}

export interface LastPurchaseRates {
  priceListRate: number;
  discountPercentage: number;
  rate: number;
}

const num = (v: { toString(): string } | null | undefined) => (v == null ? 0 : Number(v.toString()));

/** The rates for each row, in order; null where nothing is known (the row is left as it is). */
export async function lastPurchaseRates(rows: readonly LastPurchaseRow[], excludeNumber: string | null, conversionRate: number): Promise<(LastPurchaseRates | null)[]> {
  const codes = [...new Set(rows.map((r) => r.itemCode).filter((c): c is string => Boolean(c)))];
  if (!codes.length) return rows.map(() => null);
  const lines = await db.purchaseOrderItem.findMany({
    where: { itemCode: { in: codes }, order: { docStatus: "SUBMITTED", ...(excludeNumber ? { number: { not: excludeNumber } } : {}) } },
    select: {
      itemCode: true,
      conversionFactor: true,
      basePriceListRate: true,
      baseRate: true,
      discountPercentage: true,
      order: { select: { transactionDate: true, number: true } },
    },
    orderBy: [{ order: { transactionDate: "desc" } }, { order: { number: "desc" } }],
  });
  const last = new Map<string, (typeof lines)[number]>();
  for (const l of lines) if (!last.has(l.itemCode)) last.set(l.itemCode, l);
  const items = await db.purchaseItem.findMany({ where: { code: { in: codes } }, select: { code: true, lastPurchaseRate: true } });
  const itemRate = new Map(items.map((i) => [i.code, num(i.lastPurchaseRate)]));
  const fx = conversionRate || 1;

  return rows.map((r) => {
    if (!r.itemCode) return null;
    const l = last.get(r.itemCode);
    const factor = r.conversionFactor || 1;
    if (l) {
      const lineFactor = num(l.conversionFactor) || 1;
      const basePriceListRate = (num(l.basePriceListRate) / lineFactor) * factor;
      const baseRate = (num(l.baseRate) / lineFactor) * factor;
      return { priceListRate: basePriceListRate / fx, discountPercentage: num(l.discountPercentage), rate: baseRate / fx };
    }
    const own = itemRate.get(r.itemCode);
    return own ? { priceListRate: own, discountPercentage: 0, rate: own } : null;
  });
}
