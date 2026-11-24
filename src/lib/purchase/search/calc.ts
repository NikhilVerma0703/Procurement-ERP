// The search box's calculator (Frappe 14's awesome bar make_calculator): text that starts with a
// digit, "(" or "=" is worked out — "(55 + 434) / 4", "=Math.sin(Math.PI/2)". The old site handed the
// text to JavaScript's eval; here a small parser takes only arithmetic: numbers, + - * / % **,
// brackets, and Math's functions and constants. Anything else is "not a sum", as eval's error was.
// Pure.

const FUNCS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs, acos: Math.acos, asin: Math.asin, atan: Math.atan, atan2: Math.atan2, cbrt: Math.cbrt, ceil: Math.ceil,
  cos: Math.cos, exp: Math.exp, floor: Math.floor, hypot: Math.hypot, log: Math.log, log10: Math.log10, log2: Math.log2,
  max: Math.max, min: Math.min, pow: Math.pow, round: Math.round, sign: Math.sign, sin: Math.sin, sqrt: Math.sqrt, tan: Math.tan,
  trunc: Math.trunc,
};
const CONSTS: Record<string, number> = { E: Math.E, LN10: Math.LN10, LN2: Math.LN2, LOG10E: Math.LOG10E, LOG2E: Math.LOG2E, PI: Math.PI, SQRT1_2: Math.SQRT1_2, SQRT2: Math.SQRT2 };

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "id"; v: string };

function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?)/i.exec(s.slice(i));
    if (num) {
      // The old site's eval ran in strict mode, where "03517" (a leading zero) is an error, not a sum.
      if (/^0\d/.test(num[0])) throw new Error("not a sum");
      out.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^Math\.[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) { out.push({ t: "id", v: id[0].slice(5) }); i += id[0].length; continue; }
    if (s.startsWith("**", i)) { out.push({ t: "op", v: "**" }); i += 2; continue; }
    if ("+-*/%(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error("not a sum");
  }
  return out;
}

/** The value of an arithmetic expression, or null when the text is not one. */
export function evaluate(text: string): number | null {
  let toks: Tok[];
  try {
    toks = tokens(text);
  } catch {
    return null;
  }
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error("expected " + v);
    p++;
  };
  // JavaScript's precedence: ** binds tighter than unary minus on its right, * / % over + -.
  const additive = (): number => {
    let v = multiplicative();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      const r = multiplicative();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const multiplicative = (): number => {
    let v = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = (toks[p++] as { v: string }).v;
      const r = unary();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const unary = (): number => {
    if (isOp("-")) { p++; return -unary(); }
    if (isOp("+")) { p++; return +unary(); }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (isOp("**")) { p++; return base ** unary(); }
    return base;
  };
  const primary = (): number => {
    const t = peek();
    if (!t) throw new Error("end");
    if (t.t === "num") { p++; return t.v; }
    if (t.t === "id") {
      p++;
      if (t.v in FUNCS) {
        expect("(");
        const args: number[] = [];
        if (!isOp(")")) {
          args.push(additive());
          while (isOp(",")) { p++; args.push(additive()); }
        }
        expect(")");
        return FUNCS[t.v](...args);
      }
      if (t.v in CONSTS) return CONSTS[t.v];
      throw new Error("unknown");
    }
    if (isOp("(")) {
      p++;
      const v = additive();
      expect(")");
      return v;
    }
    throw new Error("unexpected");
  };
  try {
    const v = additive();
    if (p !== toks.length) return null;
    return v;
  } catch {
    return null;
  }
}
