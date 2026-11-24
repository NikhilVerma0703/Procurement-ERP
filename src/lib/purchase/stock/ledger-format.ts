// How the stock ledger's entries are written (Phase II): pure parts of stock/stock-post.ts, shared
// with the receipt's own rules (stock/receipt-doc.ts) and the tests.
import { pyStr } from "../pdf/pyfmt";
import type { StockBin } from "./valuation";

/** An entry a document posts (its item, warehouse, quantity in stock units, rates, and when). */
export interface PostEntry {
  itemCode: string;
  warehouse: string;
  company: string;
  stockUom: string | null;
  actualQty: number;
  incomingRate: number;
  outgoingRate?: number;
  voucherType: string;
  voucherNo: string;
  voucherDetailNo: string | null;
  /** "YYYY-MM-DD" and "HH:MM:SS(.ffffff)", the voucher's own (the old site's clock). */
  postingDate: string;
  postingTime: string;
}

/** April–March, as the company's fiscal years ran ("2026-2027"). */
export const fiscalYearOf = (date: string) => {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${start + 1}`;
};

/** The FIFO queue as ERPNext stored it (json.dumps of floats): "[[40.0, 250.0], [36.0, 280.0]]". */
export const queueText = (q: StockBin[]) => `[${q.map(([a, b]) => `[${pyStr(a)}, ${pyStr(b)}]`).join(", ")}]`;
