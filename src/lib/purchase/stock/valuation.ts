// FIFO stock valuation, exactly as ERPNext 14.92 kept it (erpnext/stock/valuation.py FIFOValuation,
// round_off_if_near_zero). Phase II, owner 21-11-2026: the old site valued stock by FIFO (Stock
// Settings). A queue of [qty, rate] bins: stock comes in at the end, goes out from the front (or from
// the bin with the outgoing rate, when one is given). Python floats there, JS doubles here, the same
// operations in the same order. Pure; checked against every entry of the old ledger
// (scripts/golden-ledger.ts).

export type StockBin = [number, number];

/** round_off_if_near_zero: a number within 1e-precision of zero is zero. */
export function roundOffIfNearZero(n: number, precision = 7): number {
  return Math.abs(0 - n) < 1 / 10 ** precision ? 0 : n;
}

export class FifoQueue {
  constructor(public queue: StockBin[] = []) {}

  /** get_total_stock_and_value. */
  total(): [number, number] {
    let qty = 0;
    let value = 0;
    for (const [q, r] of this.queue) {
      qty += q;
      value += q * r;
    }
    return [roundOffIfNearZero(qty), roundOffIfNearZero(value)];
  }

  /** add_stock: merged into the last bin at the same rate; a negative last bin is filled first. */
  add(qty: number, rate: number): void {
    if (!this.queue.length) this.queue.push([0, 0]);
    const last = this.queue[this.queue.length - 1];
    if (last[1] === rate) last[0] += qty;
    else if (last[0] > 0) this.queue.push([qty, rate]);
    else {
      const balance = last[0] + qty;
      if (balance > 0) this.queue[this.queue.length - 1] = [balance, rate];
      else last[0] = balance;
    }
  }

  /** remove_stock: consumed first-in first-out (or from the bin at the outgoing rate); returns what was consumed. */
  remove(qty: number, outgoingRate = 0, rateGenerator: () => number = () => 0): StockBin[] {
    const consumed: StockBin[] = [];
    while (qty) {
      if (!this.queue.length) this.queue.push([0, rateGenerator()]);
      let index = 0;
      if (outgoingRate > 0) {
        const at = this.queue.findIndex((b) => b[1] === outgoingRate);
        index = at === -1 ? 0 : at;
      }
      const bin = this.queue[index];
      if (qty >= bin[0]) {
        qty = roundOffIfNearZero(qty - bin[0]);
        const [taken] = this.queue.splice(index, 1);
        consumed.push([taken[0], taken[1]]);
        if (!this.queue.length && qty) {
          // Stock ran out with quantity still to take: a negative bin.
          this.queue.push([-qty, outgoingRate || bin[1]]);
          consumed.push([qty, outgoingRate || bin[1]]);
          break;
        }
      } else {
        bin[0] = roundOffIfNearZero(bin[0] - qty);
        consumed.push([qty, bin[1]]);
        qty = 0;
      }
    }
    return consumed;
  }
}
