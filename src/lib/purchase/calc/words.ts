// "In Words" — the amount in words the PO shows and prints, exactly as the old
// site wrote it: "INR Twenty Lakh, One Thousand, Three Hundred And Twenty Six
// only." Frappe's money_in_words over the num2words library (English, and
// Indian English — lakh and crore — for currencies formatted #,##,###.##).
// This is a re-implementation of their behaviour, pinned by golden tests over
// every historical PO. Pure.
import { pyFormatFixed } from "./pymath";

type Pair = { text: string; num: number };
type Node = Pair | Node[];
const isPair = (n: Node): n is Pair => !Array.isArray(n);

const MID: [number, string][] = [
  [1000, "thousand"], [100, "hundred"], [90, "ninety"], [80, "eighty"], [70, "seventy"],
  [60, "sixty"], [50, "fifty"], [40, "forty"], [30, "thirty"],
];
const LOW = [
  "twenty", "nineteen", "eighteen", "seventeen", "sixteen", "fifteen", "fourteen", "thirteen", "twelve",
  "eleven", "ten", "nine", "eight", "seven", "six", "five", "four", "three", "two", "one", "zero",
];
const LOW_CARDS: [number, string][] = LOW.map((w, i) => [LOW.length - 1 - i, w]);

/** International English: million, billion, trillion, quadrillion. */
const EN_CARDS: [number, string][] = [[1e15, "quadrillion"], [1e12, "trillion"], [1e9, "billion"], [1e6, "million"], ...MID, ...LOW_CARDS];
/** Indian English: crore and lakh only (num2words' EN_IN), up to 10^10. */
const EN_IN_CARDS: [number, string][] = [[1e7, "crore"], [1e5, "lakh"], ...MID, ...LOW_CARDS];
const EN_IN_MAX = 1e10;

function splitnum(value: number, cards: [number, string][]): Node[] {
  for (const [elem, word] of cards) {
    if (elem > value) continue;
    const out: Node[] = [];
    const div = value === 0 ? 1 : Math.floor(value / elem);
    const mod = value === 0 ? 0 : value - div * elem;
    if (div === 1) out.push({ text: "one", num: 1 });
    else out.push(splitnum(div, cards));
    out.push({ text: word, num: elem });
    if (mod) out.push(splitnum(mod, cards));
    return out;
  }
  throw new Error(`Cannot say ${value} in words`);
}

function merge(l: Pair, r: Pair): Pair {
  if (l.num === 1 && r.num < 100) return r;
  if (100 > l.num && l.num > r.num) return { text: `${l.text}-${r.text}`, num: l.num + r.num };
  if (l.num >= 100 && 100 > r.num) return { text: `${l.text} and ${r.text}`, num: l.num + r.num };
  if (r.num > l.num) return { text: `${l.text} ${r.text}`, num: l.num * r.num };
  return { text: `${l.text}, ${r.text}`, num: l.num + r.num };
}

function clean(input: Node[]): Pair {
  let val = input;
  let out: Node[] = val;
  while (val.length !== 1) {
    out = [];
    const [left, right] = val;
    if (isPair(left) && isPair(right)) {
      out.push(merge(left, right));
      if (val.length > 2) out.push(val.slice(2));
    } else {
      for (const elem of val) {
        if (Array.isArray(elem)) out.push(elem.length === 1 ? elem[0] : clean(elem));
        else out.push(elem);
      }
    }
    val = out;
  }
  const only = out[0];
  return isPair(only) ? only : clean(only);
}

/** num2words(integer) in English (international) or Indian English; hyphens → spaces, as Frappe's in_words. */
export function inWords(integer: number, inMillion: boolean): string {
  const n = Math.trunc(integer);
  const cards = !inMillion && n < EN_IN_MAX ? EN_IN_CARDS : EN_CARDS;
  return clean(splitnum(n, cards)).text.replace(/-/g, " ");
}

/** Python's str.title(). */
export function pyTitle(s: string): string {
  let out = "";
  let prevCased = false;
  for (const ch of s) {
    const cased = ch.toLowerCase() !== ch.toUpperCase();
    out += cased ? (prevCased ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    prevCased = cased;
  }
  return out;
}

const NUMBER_FORMAT_DECIMALS: Record<string, number> = {
  "#,###.##": 2, "#.###,##": 2, "# ###.##": 2, "# ###,##": 2, "#'###.##": 2, "#, ###.##": 2,
  "#,##,###.##": 2, "#,###.###": 3, "#.###": 0, "#,###": 0, "#.########": 8,
};

export interface WordsCurrency {
  code: string;
  /** The currency's fraction name ("Paisa", "Cent"). */
  fraction?: string | null;
  /** The currency's number format ("#,##,###.##" for INR). */
  numberFormat?: string | null;
}

/** Frappe's money_in_words(amount, currency). `systemNumberFormat` is the site default (#,###.###). */
export function moneyInWords(amount: number, currency: WordsCurrency, systemNumberFormat = "#,###.###"): string {
  if (amount < 0) return "";
  const fractionCurrency = currency.fraction || "Cent";
  const numberFormat = currency.numberFormat || systemNumberFormat || "#,###.##";
  const fractionLength = NUMBER_FORMAT_DECIMALS[numberFormat] ?? 2;
  const n = pyFormatFixed(amount, fractionLength);
  let [main, fraction] = n.includes(".") ? n.split(".") : [n, "00"];
  if (fraction.length < fractionLength) fraction += "0".repeat(fractionLength - fraction.length);
  const inMillion = numberFormat !== "#,##,###.##";
  if (main === "0" && (fraction === "00" || fraction === "000")) return `${currency.code} Zero only.`;
  if (main === "0") return `${pyTitle(inWords(Number(fraction), inMillion))} ${fractionCurrency} only.`;
  let out = `${currency.code} ${pyTitle(inWords(Number(main), inMillion))}`;
  if (Number(fraction)) out += ` and ${pyTitle(inWords(Number(fraction), inMillion))} ${fractionCurrency}`;
  return `${out} only.`;
}
