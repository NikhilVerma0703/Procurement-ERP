// Number behaviour of the old site, exactly.
//
// ERPNext computed every PO figure with Python floats (IEEE doubles — the same
// as a JavaScript number) and rounded them with Frappe's `flt(value,
// precision)` under the site's rounding method, "Banker's Rounding (legacy)"
// (System Settings, read from the backup). Reproducing the stored figures to
// the last decimal therefore needs Python's own rounding semantics, not
// Math.round / toFixed:
//   * Python round(x, n) rounds the double's EXACT value, ties to even;
//   * "%.nf" formatting does the same;
//   * Python's float % takes the divisor's sign.
// The exact value of a double is computed with BigInt (a double is m·2^e,
// i.e. m·5^k / 10^k when e = -k), so nothing here is approximate. Pure.

/** A double's exact value as integer / 10^scale. */
function exactDecimal(x: number): { neg: boolean; int: bigint; scale: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const neg = hi >>> 31 === 1;
  const expBits = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (expBits === 0x7ff) throw new Error(`Not a finite number: ${x}`);
  const mant = expBits === 0 ? frac : frac | (1n << 52n);
  const exp2 = (expBits === 0 ? 1 : expBits) - 1075;
  if (mant === 0n) return { neg, int: 0n, scale: 0 };
  if (exp2 >= 0) return { neg, int: mant << BigInt(exp2), scale: 0 };
  const k = -exp2;
  return { neg, int: mant * 5n ** BigInt(k), scale: k };
}

/** Exact value rounded half-to-even at n decimals, as integer / 10^n. */
function roundHalfEvenScaled(x: number, n: number): { neg: boolean; q: bigint } {
  const { neg, int, scale } = exactDecimal(x);
  if (scale <= n) return { neg, q: int * 10n ** BigInt(n - scale) };
  const div = 10n ** BigInt(scale - n);
  let q = int / div;
  const r = int % div;
  const half = div / 2n;
  if (r > half || (r === half && q % 2n === 1n)) q += 1n;
  return { neg, q };
}

const toNumber = (neg: boolean, q: bigint, n: number) => {
  if (q === 0n) return neg ? -0 : 0;
  return Number(`${neg ? "-" : ""}${q}e-${n}`);
};

/** Python's round(x, n) for n >= 0 (and round(x) when n = 0). */
export function pyRound(x: number, n = 0): number {
  if (!Number.isFinite(x)) return x;
  const { neg, q } = roundHalfEvenScaled(x, n);
  return toNumber(neg, q, n);
}

/** Python's "%.nf" % x. */
export function pyFormatFixed(x: number, n: number): string {
  const { neg, q } = roundHalfEvenScaled(x, n);
  let s = q.toString().padStart(n + 1, "0");
  if (n > 0) s = `${s.slice(0, -n)}.${s.slice(-n)}`;
  return (neg && q !== 0n ? "-" : "") + s;
}

/** Python's float a % b (the result takes the divisor's sign). */
export function pyMod(a: number, b: number): number {
  let m = a % b;
  if (m && b < 0 !== m < 0) m += b;
  return m;
}

/** Frappe's _bankers_rounding_legacy — the old site's rounding method. */
export function bankersRoundingLegacy(num: number, precision: number): number {
  const multiplier = 10 ** precision;
  const scaled = pyRound(precision ? num * multiplier : num, 8);
  const floorNum = Math.floor(scaled);
  const decimalPart = scaled - floorNum;
  let r: number;
  if (!precision && decimalPart === 0.5) r = floorNum % 2 === 0 ? floorNum : floorNum + 1;
  else if (decimalPart === 0.5) r = floorNum + 1;
  else r = pyRound(scaled);
  return precision ? r / multiplier : r;
}

/** Frappe's flt(value, precision): a float, rounded when a precision is given. */
export function flt(value: number | string | null | undefined, precision?: number): number {
  let num: number;
  if (typeof value === "string") num = Number(value.replace(/,/g, ""));
  else num = value ?? 0;
  if (!Number.isFinite(num)) num = 0;
  return precision === undefined ? num : bankersRoundingLegacy(num, precision);
}

/** Frappe's cint. */
export function cint(value: number | string | null | undefined): number {
  const n = Math.trunc(Number(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/** Frappe's remainder(numerator, denominator, precision). */
export function remainder(numerator: number, denominator: number, precision = 2): number {
  const multiplier = 10 ** precision;
  const r = precision ? pyMod(numerator * multiplier, denominator * multiplier) / multiplier : pyMod(numerator, denominator);
  return flt(r, precision);
}

/**
 * The text MariaDB stored for a Python float in a DECIMAL(21,9) column. The driver sends the
 * float's shortest repr (the same digits as JavaScript's toString) and MariaDB rounds that
 * decimal half away from zero. Used to compare and store computed figures exactly.
 */
export function dbDecimal(x: number, scale = 9): string {
  if (!Number.isFinite(x)) throw new Error(`Not a finite number: ${x}`);
  const [mant, expPart] = Math.abs(x).toString().split("e");
  const exp = expPart ? Number(expPart) : 0;
  const [ip, fp = ""] = mant.split(".");
  let digits = ip + fp;
  let point = ip.length + exp; // position of the decimal point within `digits`
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) digits += "0".repeat(point - digits.length);
  const intPart = digits.slice(0, point) || "0";
  const fracPart = digits.slice(point);
  let q = BigInt(intPart + fracPart.slice(0, scale).padEnd(scale, "0"));
  if (fracPart.length > scale && fracPart[scale] >= "5") q += 1n;
  let s = q.toString().padStart(scale + 1, "0");
  if (scale > 0) s = `${s.slice(0, -scale)}.${s.slice(-scale)}`;
  return (x < 0 && q !== 0n ? "-" : "") + s;
}

/** Frappe's round_based_on_smallest_currency_fraction (the PO's Rounded Total). */
export function roundToCurrencyFraction(value: number, smallestFraction: number, precision: number): number {
  let v = value;
  if (smallestFraction) {
    const r = remainder(v, smallestFraction, precision);
    if (r > smallestFraction / 2) v += smallestFraction - r;
    else v -= r;
  } else {
    v = bankersRoundingLegacy(v, 0);
  }
  return flt(v, precision);
}
