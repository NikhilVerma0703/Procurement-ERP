// The Stock Reports' filters, read from the page's address (Phase II, owner 21-11-2026).
//
// As the old reports' filter bars (erpnext/stock/report/stock_balance/stock_balance.js and
// stock_ledger/stock_ledger.js, 14.92): Company (the user's default), From Date (a month ago) and
// To Date (today) required; Item Group, Item, Warehouse; the ledger also Batch No and Voucher #.
// Pure.

export interface StockReportFilters {
  company: string;
  fromDate: string;
  toDate: string;
  itemGroup: string | null;
  itemCode: string | null;
  warehouse: string | null;
  batchNo: string | null;
  voucherNo: string | null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** frappe.datetime.add_months (moment): the same day n months on, clamped to the month's end. */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
  return out.toISOString().slice(0, 10);
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 140) : null;
};

export function parseStockFilters(sp: Params, today: string, defaultCompany: string): StockReportFilters {
  const date = (v: string | null, fallback: string) => (v && YMD.test(v) ? v : fallback);
  return {
    company: one(sp.company) ?? defaultCompany,
    fromDate: date(one(sp.from_date), addMonths(today, -1)),
    toDate: date(one(sp.to_date), today),
    itemGroup: one(sp.item_group),
    itemCode: one(sp.item_code),
    warehouse: one(sp.warehouse),
    batchNo: one(sp.batch_no),
    voucherNo: one(sp.voucher_no),
  };
}
