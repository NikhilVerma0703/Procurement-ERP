// The old forms' show/hide conditions (depends_on), evaluated safely (Phase II, owner 21-11-2026).
//
// Frappe ran "eval:…" conditions as JavaScript against the document (doc) and, in a child row, its
// parent. The 193 distinct conditions of the captured forms (doc/layouts) use a small part of the
// language: fields of doc / parent, literals, ! && || === !== == != < > <= >=, + - * /, parentheses,
// array literals, .length, .includes(), .indexOf(), and the helpers in_list(), cint(), flt() and
// erpnext.is_perpetual_inventory_enabled(). This parses and evaluates exactly that — nothing is run
// as code. A plain condition (no "eval:") is a fieldname: shown when the field has a value.
// Anything unparseable shows the field (as a visible field is the safer mistake). Pure.

type Value = unknown;
export interface DependsContext {
  doc: Record<string, Value>;
  parent?: Record<string, Value>;
}

type Tok = { k: "num" | "str" | "id" | "op"; v: string };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] ?? ""))) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(s.slice(i))!;
      out.push({ k: "num", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let v = "";
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\" && j + 1 < s.length) { v += s[j + 1]; j += 2; continue; }
        v += s[j++];
      }
      if (j >= s.length) throw new Error("unterminated string");
      out.push({ k: "str", v });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(i))!;
      out.push({ k: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    const three = s.slice(i, i + 3);
    const two = s.slice(i, i + 2);
    if (three === "===" || three === "!==") { out.push({ k: "op", v: three }); i += 3; continue; }
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { out.push({ k: "op", v: two }); i += 2; continue; }
    if ("()[],.!<>+-*/;?:".includes(c)) { out.push({ k: "op", v: c }); i++; continue; }
    throw new Error(`unexpected "${c}"`);
  }
  return out;
}

type Node =
  | { t: "lit"; v: Value }
  | { t: "id"; v: string }
  | { t: "arr"; items: Node[] }
  | { t: "member"; obj: Node; prop: Node | string }
  | { t: "call"; callee: Node; args: Node[] }
  | { t: "unary"; op: string; arg: Node }
  | { t: "bin"; op: string; l: Node; r: Node }
  | { t: "cond"; test: Node; yes: Node; no: Node };

const PRECEDENCE: Record<string, number> = {
  "||": 1, "&&": 2, "===": 3, "!==": 3, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6,
};

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (v?: string) => {
    const t = tokens[p];
    if (!t || (v !== undefined && t.v !== v)) throw new Error(`expected ${v ?? "a token"}`);
    p++;
    return t;
  };
  const primary = (): Node => {
    const t = eat();
    if (t.k === "num") return { t: "lit", v: Number(t.v) };
    if (t.k === "str") return { t: "lit", v: t.v };
    if (t.k === "id") {
      if (t.v === "true") return { t: "lit", v: true };
      if (t.v === "false") return { t: "lit", v: false };
      if (t.v === "null") return { t: "lit", v: null };
      if (t.v === "undefined") return { t: "lit", v: undefined };
      return { t: "id", v: t.v };
    }
    if (t.v === "(") { const e = expr(0); eat(")"); return e; }
    if (t.v === "[") {
      const items: Node[] = [];
      while (peek() && peek().v !== "]") { items.push(expr(0)); if (peek()?.v === ",") eat(","); }
      eat("]");
      return { t: "arr", items };
    }
    if (t.v === "!" || t.v === "-" || t.v === "+") return { t: "unary", op: t.v, arg: unary() };
    throw new Error(`unexpected ${t.v}`);
  };
  const postfix = (): Node => {
    let n = primary();
    for (;;) {
      const t = peek();
      if (t?.v === ".") { eat("."); n = { t: "member", obj: n, prop: eat().v }; continue; }
      if (t?.v === "[") { eat("["); const prop = expr(0); eat("]"); n = { t: "member", obj: n, prop }; continue; }
      if (t?.v === "(") {
        eat("(");
        const args: Node[] = [];
        while (peek() && peek().v !== ")") { args.push(expr(0)); if (peek()?.v === ",") eat(","); }
        eat(")");
        n = { t: "call", callee: n, args };
        continue;
      }
      return n;
    }
  };
  const unary = (): Node => {
    const t = peek();
    if (t && t.k === "op" && (t.v === "!" || t.v === "-" || t.v === "+")) { eat(); return { t: "unary", op: t.v, arg: unary() }; }
    return postfix();
  };
  const expr = (min: number): Node => {
    let l = unary();
    for (;;) {
      const t = peek();
      if (t?.v === "?" && min === 0) {
        eat("?"); const yes = expr(0); eat(":"); const no = expr(0);
        l = { t: "cond", test: l, yes, no };
        continue;
      }
      const prec = t && t.k === "op" ? PRECEDENCE[t.v] : undefined;
      if (prec === undefined || prec <= min) return l;
      eat();
      l = { t: "bin", op: t!.v, l, r: expr(prec) };
    }
  };
  const node = expr(0);
  while (peek()?.v === ";") eat(";");
  if (p !== tokens.length) throw new Error("trailing tokens");
  return node;
}

const looseEq = (a: Value, b: Value): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b && ["number", "boolean", "string"].includes(typeof a) && ["number", "boolean", "string"].includes(typeof b)) {
    return Number(a) === Number(b);
  }
  return false;
};
const cint = (v: Value) => { const n = parseInt(String(v ?? 0), 10); return Number.isFinite(n) ? n : 0; };
const flt = (v: Value) => { const n = parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };

function evaluate(n: Node, ctx: DependsContext): Value {
  switch (n.t) {
    case "lit": return n.v;
    case "arr": return n.items.map((i) => evaluate(i, ctx));
    case "id":
      if (n.v === "doc") return ctx.doc;
      if (n.v === "parent") return ctx.parent ?? {};
      if (n.v === "erpnext") return { is_perpetual_inventory_enabled: () => 1 };
      return undefined;
    case "member": {
      const obj = evaluate(n.obj, ctx) as Record<string, Value> | null | undefined;
      const prop = typeof n.prop === "string" ? n.prop : String(evaluate(n.prop, ctx));
      if (obj == null) return undefined;
      if ((Array.isArray(obj) || typeof obj === "string") && prop === "length") return obj.length;
      if (Array.isArray(obj) || typeof obj === "string") {
        if (prop === "includes") return (v: Value) => (obj as unknown as { includes(x: Value): boolean }).includes(v);
        if (prop === "indexOf") return (v: Value) => (obj as unknown as { indexOf(x: Value): number }).indexOf(v);
        if (Array.isArray(obj) && /^\d+$/.test(prop)) return obj[Number(prop)];
        return undefined;
      }
      return Object.prototype.hasOwnProperty.call(obj, prop) ? obj[prop] : undefined;
    }
    case "call": {
      if (n.callee.t === "id") {
        const args = n.args.map((a) => evaluate(a, ctx));
        if (n.callee.v === "in_list") return Array.isArray(args[0]) && args[0].includes(args[1]);
        if (n.callee.v === "cint") return cint(args[0]);
        if (n.callee.v === "flt") return flt(args[0]);
        throw new Error(`unknown function ${n.callee.v}`);
      }
      const fn = evaluate(n.callee, ctx);
      if (typeof fn !== "function") throw new Error("not a function");
      return (fn as (...a: Value[]) => Value)(...n.args.map((a) => evaluate(a, ctx)));
    }
    case "unary": {
      const v = evaluate(n.arg, ctx);
      return n.op === "!" ? !v : n.op === "-" ? -Number(v) : Number(v);
    }
    case "cond": return evaluate(n.test, ctx) ? evaluate(n.yes, ctx) : evaluate(n.no, ctx);
    case "bin": {
      if (n.op === "&&") { const l = evaluate(n.l, ctx); return l ? evaluate(n.r, ctx) : l; }
      if (n.op === "||") { const l = evaluate(n.l, ctx); return l ? l : evaluate(n.r, ctx); }
      const l = evaluate(n.l, ctx);
      const r = evaluate(n.r, ctx);
      switch (n.op) {
        case "===": return l === r;
        case "!==": return l !== r;
        case "==": return looseEq(l, r);
        case "!=": return !looseEq(l, r);
        case "<": return (l as number) < (r as number);
        case ">": return (l as number) > (r as number);
        case "<=": return (l as number) <= (r as number);
        case ">=": return (l as number) >= (r as number);
        case "+": return typeof l === "string" || typeof r === "string" ? `${l ?? ""}${r ?? ""}` : Number(l) + Number(r);
        case "-": return Number(l) - Number(r);
        case "*": return Number(l) * Number(r);
        case "/": return Number(l) / Number(r);
      }
      return undefined;
    }
  }
}

const cache = new Map<string, Node | null>();

/** Is a field (or section) with this depends_on shown for this document? */
export function dependsOn(expression: string | null | undefined, ctx: DependsContext): boolean {
  const e = (expression ?? "").trim();
  if (!e) return true;
  if (!e.startsWith("eval:")) {
    if (e.startsWith("fn:")) return true;
    const v = ctx.doc[e];
    return Array.isArray(v) ? v.length > 0 : !!v;
  }
  const src = e.slice(5);
  let node = cache.get(src);
  if (node === undefined) {
    try {
      node = parse(tokenize(src));
    } catch {
      node = null;
    }
    cache.set(src, node);
  }
  if (!node) return true;
  try {
    return !!evaluate(node, ctx);
  } catch {
    return true;
  }
}

/** Whether a condition is one this evaluator understands (tests hold every captured one to it). */
export function canParse(expression: string): boolean {
  const e = expression.trim();
  if (!e.startsWith("eval:")) return true;
  try {
    parse(tokenize(e.slice(5)));
    return true;
  } catch {
    return false;
  }
}
