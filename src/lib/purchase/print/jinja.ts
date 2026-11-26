// The old site's Jinja print formats, run as they are (owner, 25-11-2026: "exactly same look and same
// work as previous website"). Frappe 14 rendered a print format with Jinja2 over the document as
// Python held it; here nunjucks (Jinja's syntax for JavaScript) runs the same template text, with
// Python's rules put back where the two differ:
//
//   * printing: a float as Python's str ("36.0", "1814.4"), an int as "1", None as "None", True as
//     "True", a list as its repr;
//   * Frappe's DebugUndefined: a field the document does not have prints
//     "{{ no such element: <class> object['<name>'] }}", an unknown name "{{ <name> }}" (both seen on
//     the captured prints), and is false, empty, and 0.0 to |float;
//   * truth: an empty list, "", 0 and None are false (in `if`, `and`, `or`, `not`, `x if c else y`);
//   * comparison and arithmetic: ints stay ints (int + int), a float makes a float, % takes the
//     divisor's sign;
//   * lists and strings have Python's methods (append, split, strip, …), a frappe._dict answers None
//     for a missing key, and the filters format ("%0.2f"), float, int, sum, length, round and default
//     behave as Jinja's.
//
// Pure (no database): the print loader (receipt-print.ts) hands it the document and the frappe
// helpers the templates call, already loaded.
import nunjucks from "nunjucks";
import { pyFormatFixed, pyMod, pyRound } from "../calc/pymath";
import { pyStr } from "../pdf/pyfmt";

// ---------------------------------------------------------------------------------------------
// Python values

/** A Python int (an Int or Check field, idx, docstatus, a length): prints without ".0". */
// Recognised by process-wide markers, not by which copy of this module made them: the app's bundler may
// load the module more than once while nunjucks (and its patched runtime) is loaded once.
const INT = Symbol.for("purchase.jinja.PyInt");
const UNDEF = Symbol.for("purchase.jinja.PyUndefined");
const marked = (v: unknown, mark: symbol) => v !== null && typeof v === "object" && (v as Record<symbol, unknown>)[mark] === true;

export class PyInt {
  readonly [INT] = true;
  static [Symbol.hasInstance](v: unknown) {
    return marked(v, INT);
  }
  constructor(readonly v: number) {}
  valueOf(): number {
    return this.v;
  }
  toString(): string {
    return String(this.v);
  }
}

/** Jinja's DebugUndefined: false, empty, and printed as the text Frappe showed. */
export class PyUndefined {
  readonly [UNDEF] = true;
  static [Symbol.hasInstance](v: unknown) {
    return marked(v, UNDEF);
  }
  constructor(readonly text: string) {}
  valueOf(): number {
    return Number.NaN;
  }
  toString(): string {
    return this.text;
  }
}

const META = Symbol.for("purchase.jinja.py");
interface PyMeta {
  /** Its class as Python named it ("erpnext.stock.doctype.….PurchaseReceipt"; "frappe._dict"). */
  cls: string;
  /** A frappe._dict: a missing key is None. */
  dict: boolean;
}
export type PyObject = Record<string, unknown> & { [META]: PyMeta };

/** A Frappe document (or child row) as the template saw it: its fields, and its methods. */
export function pyDoc(cls: string, values: Record<string, unknown>, methods: Record<string, (...a: unknown[]) => unknown> = {}): PyObject {
  const o = Object.create(null) as PyObject;
  Object.assign(o, values);
  for (const [k, f] of Object.entries(methods)) Object.defineProperty(o, k, { value: f, enumerable: false });
  Object.defineProperty(o, META, { value: { cls, dict: false }, enumerable: false });
  return o;
}

/** A frappe._dict (what frappe.get_all answers): attribute or key; None when it is not there. */
export function pyDict(values: Record<string, unknown>): PyObject {
  const o = Object.create(null) as PyObject;
  Object.assign(o, values);
  Object.defineProperty(o, META, { value: { cls: "frappe._dict", dict: true }, enumerable: false });
  return o;
}

const metaOf = (v: unknown): PyMeta | null => (v !== null && typeof v === "object" && META in (v as object) ? (v as PyObject)[META] : null);
const num = (v: unknown): unknown => (v instanceof PyInt ? v.v : v);
const isInt = (v: unknown): v is PyInt => v instanceof PyInt;
const isUndef = (v: unknown): v is PyUndefined => v instanceof PyUndefined || v === undefined;

/** jinja2.utils.object_type_repr. */
function typeRepr(obj: unknown): string {
  if (obj === null || obj === undefined) return "None";
  const m = metaOf(obj);
  if (m) return `${m.cls} object`;
  if (Array.isArray(obj)) return "list object";
  if (typeof obj === "string") return "str object";
  if (obj instanceof PyInt) return "int object";
  if (typeof obj === "number") return "float object";
  if (typeof obj === "boolean") return "bool object";
  return "dict object";
}

/** Python's repr of a str. */
function strRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
}

/** Python's repr (inside a printed list or dict). */
export function pyRepr(v: unknown): string {
  if (typeof v === "string") return strRepr(v);
  return pyPrint(v);
}

/** What `{{ v }}` printed. */
export function pyPrint(v: unknown): string {
  if (v instanceof PyUndefined) return v.text;
  if (v === undefined) return "";
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return pyStr(v);
  if (v instanceof PyInt) return String(v.v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(", ")}]`;
  const m = metaOf(v);
  if (m) {
    const o = v as PyObject;
    if (m.dict) return `{${Object.keys(o).map((k) => `${strRepr(k)}: ${pyRepr(o[k])}`).join(", ")}}`;
    return `<${m.cls.split(".").pop()}: ${pyPrint(o.name ?? null)}>`;
  }
  return String(v);
}

/** Python truth. */
export function pyBool(v: unknown): boolean {
  if (v === undefined || v === null || v instanceof PyUndefined) return false;
  if (v instanceof PyInt) return v.v !== 0;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof nunjucks.runtime.SafeString) return String(v).length > 0;
  const m = metaOf(v);
  if (m?.dict) return Object.keys(v as object).length > 0;
  return Boolean(v);
}

function pyEq(a: unknown, b: unknown): boolean {
  const x = num(typeof a === "boolean" ? Number(a) : a);
  const y = num(typeof b === "boolean" ? Number(b) : b);
  if (isUndef(x) || isUndef(y)) return isUndef(x) && isUndef(y);
  if (x instanceof nunjucks.runtime.SafeString || y instanceof nunjucks.runtime.SafeString) return String(x) === String(y);
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((e, i) => pyEq(e, y[i]));
  return x === y;
}

/** A comparison, Python's way. */
export function pyCompare(a: unknown, op: string, b: unknown): boolean {
  switch (op) {
    case "==":
    case "===":
      return pyEq(a, b);
    case "!=":
    case "!==":
      return !pyEq(a, b);
  }
  const x = num(a) as number;
  const y = num(b) as number;
  switch (op) {
    case "<":
      return x < y;
    case ">":
      return x > y;
    case "<=":
      return x <= y;
    case ">=":
      return x >= y;
  }
  throw new Error(`Unknown comparison ${op}`);
}

/** Arithmetic, Python's way: int with int stays int; a float makes a float. */
export function pyArith(op: string, a: unknown, b: unknown): unknown {
  if (op === "+" && typeof a === "string" && typeof b === "string") return a + b;
  if (op === "+" && Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (op === "*" && typeof a === "string" && isInt(b)) return a.repeat(Math.max(0, b.v));
  const x = Number(num(typeof a === "boolean" ? Number(a) : a));
  const y = Number(num(typeof b === "boolean" ? Number(b) : b));
  const ints = (isInt(a) || typeof a === "boolean") && (isInt(b) || typeof b === "boolean");
  let r: number;
  switch (op) {
    case "+":
      r = x + y;
      break;
    case "-":
      r = x - y;
      break;
    case "*":
      r = x * y;
      break;
    case "/":
      return x / y;
    case "//":
      r = Math.floor(x / y);
      break;
    case "%":
      r = pyMod(x, y);
      break;
    case "**":
      r = Math.pow(x, y);
      break;
    default:
      throw new Error(`Unknown operator ${op}`);
  }
  return ints ? new PyInt(r) : r;
}

// ---------------------------------------------------------------------------------------------
// Python's methods on str, list and dict, as attribute lookups saw them

const STR_METHODS: Record<string, (s: string, ...a: unknown[]) => unknown> = {
  split: (s, sep, max) => {
    const limit = max === undefined || max === null ? -1 : Number(num(max));
    if (sep === undefined || sep === null) {
      const parts = s.trim().split(/\s+/).filter(Boolean);
      return limit < 0 || parts.length <= limit + 1 ? parts : [...parts.slice(0, limit), s.trim().split(/\s+/).slice(limit).join(" ")];
    }
    const all = s.split(String(sep));
    return limit < 0 || all.length <= limit + 1 ? all : [...all.slice(0, limit), all.slice(limit).join(String(sep))];
  },
  strip: (s, chars) => (chars === undefined || chars === null ? s.trim() : s.replace(new RegExp(`^[${escapeClass(String(chars))}]+|[${escapeClass(String(chars))}]+$`, "g"), "")),
  lstrip: (s) => s.trimStart(),
  rstrip: (s) => s.trimEnd(),
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: (s) => s.toLowerCase().replace(/(^|[^A-Za-z])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase()),
  replace: (s, a, b) => s.split(String(a)).join(String(b)),
  startswith: (s, p) => s.startsWith(String(p)),
  endswith: (s, p) => s.endsWith(String(p)),
  find: (s, p) => new PyInt(s.indexOf(String(p))),
  join: (s, list) => (Array.isArray(list) ? list.map((x) => (typeof x === "string" ? x : pyPrint(x))).join(s) : ""),
  // str.format: {0} / {} / {name} (no format specs: the print templates use none).
  format: (s, ...args) => {
    const kw = (args.length && isKeywords(args[args.length - 1]) ? args.pop() : {}) as Record<string, unknown>;
    let next = 0;
    return s.replace(/\{(\w*)\}/g, (_m, key: string) => {
      const v = key === "" ? args[next++] : /^\d+$/.test(key) ? args[Number(key)] : kw[key];
      return typeof v === "string" ? v : v instanceof nunjucks.runtime.SafeString ? String(v) : pyPrint(v);
    });
  },
};
/** nunjucks passes keyword arguments as a last object marked __keywords. */
export const isKeywords = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && "__keywords" in (v as object);
const escapeClass = (s: string) => s.replace(/[\\\]^-]/g, "\\$&");

const LIST_METHODS: Record<string, (l: unknown[], ...a: unknown[]) => unknown> = {
  append: (l, x) => {
    l.push(x);
    return null;
  },
  extend: (l, x) => {
    if (Array.isArray(x)) l.push(...x);
    return null;
  },
  pop: (l, i) => (i === undefined ? l.pop() ?? null : l.splice(Number(num(i)), 1)[0] ?? null),
  index: (l, x) => new PyInt(l.findIndex((e) => pyEq(e, x))),
  count: (l, x) => new PyInt(l.filter((e) => pyEq(e, x)).length),
};

const DICT_METHODS: Record<string, (d: PyObject, ...a: unknown[]) => unknown> = {
  get: (d, k, dflt) => (String(k) in d ? d[String(k)] : dflt ?? null),
  keys: (d) => Object.keys(d),
  values: (d) => Object.values(d),
  items: (d) => Object.entries(d),
};

/** obj.name / obj['name'] / obj[i]. */
export function pyLookup(obj: unknown, key: unknown): unknown {
  const k = num(key);
  if (obj === undefined || obj === null || obj instanceof PyUndefined) {
    return new PyUndefined(`{{ no such element: ${typeRepr(obj instanceof PyUndefined ? null : obj)}[${pyRepr(k)}] }}`);
  }
  if (typeof obj === "string") {
    if (typeof k === "number") return obj.at(k) ?? new PyUndefined(`{{ no such element: str object[${k}] }}`);
    const m = STR_METHODS[String(k)];
    return m ? (...a: unknown[]) => m(obj, ...a) : new PyUndefined(`{{ no such element: str object[${strRepr(String(k))}] }}`);
  }
  if (Array.isArray(obj)) {
    if (typeof k === "number") {
      const v = obj.at(k);
      return v === undefined ? new PyUndefined(`{{ no such element: list object[${k}] }}`) : v;
    }
    const m = LIST_METHODS[String(k)];
    return m ? (...a: unknown[]) => m(obj, ...a) : new PyUndefined(`{{ no such element: list object[${strRepr(String(k))}] }}`);
  }
  const meta = metaOf(obj);
  if (meta) {
    const o = obj as PyObject;
    const name = String(k);
    if (name in o) {
      const v = o[name];
      return typeof v === "function" ? (...a: unknown[]) => (v as (...x: unknown[]) => unknown).apply(o, a) : v;
    }
    if (meta.dict) {
      const m = DICT_METHODS[name];
      return m ? (...a: unknown[]) => m(o, ...a) : null;
    }
    return new PyUndefined(`{{ no such element: ${meta.cls} object[${strRepr(name)}] }}`);
  }
  // Anything else handed to the template (the frappe helpers): plain JavaScript.
  const target = obj as Record<string, unknown>;
  const v = target[String(k)];
  if (typeof v === "function") return (...a: unknown[]) => (v as (...x: unknown[]) => unknown).apply(obj, a);
  return v === undefined ? new PyUndefined(`{{ no such element: ${typeRepr(obj)}[${strRepr(String(k))}] }}`) : v;
}

// ---------------------------------------------------------------------------------------------
// Jinja's filters and tests

/** Python's "fmt % args" for %s %r %d %i %f %F %% (with flags, width and precision). */
export function pyPercent(fmt: string, args: unknown): string {
  const list = Array.isArray(args) ? args : [args];
  let i = 0;
  return fmt.replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdifFr%])/g, (_m, flags: string, width: string | undefined, prec: string | undefined, conv: string) => {
    if (conv === "%") return "%";
    const v = list[i++];
    let out: string;
    if (conv === "s") out = typeof v === "string" ? v : pyPrint(v);
    else if (conv === "r") out = pyRepr(v);
    else {
      const x = Number(num(v));
      if (Number.isNaN(x) && !(typeof v === "number")) throw new Error("%" + conv + " format: a number is required");
      out = conv === "d" || conv === "i" ? String(Math.trunc(x)) : pyFormatFixed(x, prec === undefined ? 6 : Number(prec));
      if (flags.includes("+") && x >= 0) out = `+${out}`;
      else if (flags.includes(" ") && x >= 0) out = ` ${out}`;
    }
    const w = width ? Number(width) : 0;
    if (out.length < w) {
      if (flags.includes("-")) out = out.padEnd(w);
      else if (flags.includes("0") && conv !== "s" && conv !== "r") {
        const sign = /^[+\- ]/.test(out) ? out[0] : "";
        out = sign + out.slice(sign.length).padStart(w - sign.length, "0");
      } else out = out.padStart(w);
    }
    return out;
  });
}

/** Python's float(): numbers, numeric text; else the default (Jinja's |float). */
export function pyFloat(v: unknown, dflt: unknown = 0): number {
  const x = num(v);
  if (typeof x === "number") return x;
  if (typeof x === "boolean") return Number(x);
  if (typeof x === "string") {
    const t = x.trim().replace(/_/g, "");
    if (/^[+-]?(\d+\.?\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?)$/i.test(t)) return Number(t);
    if (/^[+-]?(inf|infinity)$/i.test(t)) return t.startsWith("-") ? -Infinity : Infinity;
  }
  return Number(num(dflt));
}

/** Templates that others import or include by name (Frappe's standard print: frappe-templates.ts). */
const TEMPLATES = new Map<string, string>();
export function registerTemplates(templates: Record<string, string>) {
  for (const [name, src] of Object.entries(templates)) TEMPLATES.set(name, src);
}
const LOADER = {
  getSource(name: string) {
    const src = TEMPLATES.get(name);
    if (src === undefined) throw new Error(`TemplateNotFound: ${name}`);
    return { src, path: name, noCache: false };
  },
} as unknown as nunjucks.ILoader;

function makeEnvironment(): nunjucks.Environment {
  const env = new nunjucks.Environment(LOADER, { autoescape: false, throwOnUndefined: false });
  env.addFilter("format", (fmt: unknown, ...args: unknown[]) => pyPercent(String(fmt), args.length === 1 ? args[0] : args));
  env.addFilter("float", (v: unknown, d: unknown = 0) => pyFloat(v, d));
  env.addFilter("int", (v: unknown, d: unknown = new PyInt(0)) => {
    const x = pyFloat(v, Number.NaN);
    return Number.isNaN(x) ? d : new PyInt(Math.trunc(x));
  });
  env.addFilter("sum", (list: unknown, attribute?: unknown, start: unknown = new PyInt(0)) => {
    const items = Array.isArray(list) ? list : [];
    return items.reduce((acc: unknown, x) => pyArith("+", acc, attribute ? pyLookup(x, attribute) : x), start);
  });
  const length = (v: unknown) => new PyInt(Array.isArray(v) || typeof v === "string" ? v.length : metaOf(v)?.dict ? Object.keys(v as object).length : 0);
  env.addFilter("length", length);
  env.addFilter("count", length);
  env.addFilter("round", (v: unknown, precision: unknown = 0, method: unknown = "common") => {
    const x = pyFloat(v);
    const p = Number(num(precision));
    const f = 10 ** p;
    if (method === "ceil") return Math.ceil(x * f) / f;
    if (method === "floor") return Math.floor(x * f) / f;
    // Jinja's "common" rounds half away from zero.
    return method === "common" ? Math.sign(x) * (Math.round(Math.abs(x) * f) / f) : pyRound(x, p);
  });
  const dflt = (v: unknown, d: unknown = "", boolean: unknown = false) => (isUndef(v) || (pyBool(boolean) && !pyBool(v)) ? d : v);
  env.addFilter("default", dflt);
  env.addFilter("d", dflt);
  env.addFilter("string", (v: unknown) => (typeof v === "string" ? v : pyPrint(v)));
  // Frappe rendered its print with filters={"len": len}.
  env.addFilter("len", length);
  // Python's list slice, rows[start:end] (nunjucks has no syntax for it; frappe-templates.ts).
  env.addFilter("pyslice", (v: unknown, start: unknown = null, end: unknown = null) => {
    const s = start === null || start === undefined ? undefined : Number(num(start));
    const e = end === null || end === undefined ? undefined : Number(num(end));
    return Array.isArray(v) || typeof v === "string" ? v.slice(s, e) : v;
  });
  env.addFilter("map", (v: unknown, ...args: unknown[]) => {
    const kw = (args.length && isKeywords(args[args.length - 1]) ? args.pop() : {}) as Record<string, unknown>;
    return Array.isArray(v) && kw.attribute !== undefined ? v.map((x) => pyLookup(x, kw.attribute)) : v;
  });
  env.addFilter("list", (v: unknown) => (Array.isArray(v) ? [...v] : typeof v === "string" ? [...v] : []));
  // addTest is in nunjucks 3 (not in its type definitions).
  const addTest = (env as unknown as { addTest(n: string, f: (v: unknown) => boolean): void }).addTest.bind(env);
  addTest("defined", (v: unknown) => !isUndef(v));
  addTest("undefined", (v: unknown) => isUndef(v));
  addTest("none", (v: unknown) => v === null);
  addTest("null", (v: unknown) => v === null);
  return env;
}

// ---------------------------------------------------------------------------------------------
// The compiler and runtime, made to follow Python (applied each time this module loads; same functions)

type Emitter = { _emit(s: string): void; _emitLine(s: string): void; compile(n: unknown, f: unknown): void; _compileExpression(n: unknown, f: unknown): void; _withScopedSyntax(f: () => void): void };
type Node = Record<string, unknown> & { ops?: { type: string; expr: unknown }[] };

function patchNunjucks() {
  // nunjucks's own modules, as its index exports them: the very instances its Environment renders with
  // (a require of "nunjucks/src/…" could load a second copy under the app's bundler).
  const nj = nunjucks as unknown as { compiler: { Compiler: { prototype: unknown } }; runtime: Record<string, unknown> & { __python?: boolean }; parser: { Parser: { prototype: unknown } }; lexer: { TOKEN_INT: string } };
  const compiler = nj.compiler;
  const runtime = nj.runtime as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  // nunjucks's own functions, kept once (the patches below may be applied again when this module loads again).
  const originals = (runtime.__pyOriginals ??= {
    parsePrimary: (nj.parser.Parser.prototype as Record<string, unknown>).parsePrimary,
    compileLiteral: (compiler.Compiler.prototype as Record<string, unknown>).compileLiteral,
    fromIterator: runtime.fromIterator,
    contextOrFrameLookup: runtime.contextOrFrameLookup,
    suppressValue: runtime.suppressValue,
  }) as Record<string, (...a: any[]) => any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const C = compiler.Compiler.prototype as Record<string, (this: Emitter, node: Node, frame: unknown, async?: boolean) => void>;
  const parserModule = nj.parser;
  const lexer = nj.lexer;
  // An integer literal is a Python int ({{ 80 }}px printed "80px"); 80.0 stays a float.
  const P = parserModule.Parser.prototype as { parsePrimary(this: { peekToken(): { type: string } | null }, noPostfix?: boolean): Node };
  const parsePrimary = originals.parsePrimary as typeof P.parsePrimary;
  P.parsePrimary = function (noPostfix) {
    const tok = this.peekToken();
    const node = parsePrimary.call(this, noPostfix);
    if (tok && tok.type === lexer.TOKEN_INT && node && (node as { typename?: string }).typename === "Literal") (node as Node).pyInt = true;
    return node;
  };
  const compileLiteral = originals.compileLiteral as typeof C.compileLiteral;
  C.compileLiteral = function (node, frame) {
    if (node.pyInt) this._emit(`new runtime.PyInt(${Number(node.value)})`);
    else compileLiteral.call(this, node, frame);
  };

  C.compileIf = function (node, frame, async) {
    this._emit("if(runtime.pyBool(");
    this._compileExpression(node.cond, frame);
    this._emitLine(")) {");
    this._withScopedSyntax(() => {
      this.compile(node.body, frame);
      if (async) this._emit("cb()");
    });
    if (node.else_) {
      this._emitLine("}\nelse {");
      this._withScopedSyntax(() => {
        this.compile(node.else_, frame);
        if (async) this._emit("cb()");
      });
    } else if (async) {
      this._emitLine("}\nelse {");
      this._emit("cb()");
    }
    this._emitLine("}");
  };
  C.compileInlineIf = function (node, frame) {
    this._emit("(runtime.pyBool(");
    this.compile(node.cond, frame);
    this._emit(")?");
    this.compile(node.body, frame);
    this._emit(":");
    if (node.else_ !== null) this.compile(node.else_, frame);
    else this._emit('""');
    this._emit(")");
  };
  // `a or b` / `a and b` answer an operand, as Python's do; b is only worked out when needed.
  C.compileOr = function (node, frame) {
    this._emit("runtime.pyOr(");
    this.compile(node.left, frame);
    this._emit(", function(){ return ");
    this.compile(node.right, frame);
    this._emit("; })");
  };
  C.compileAnd = function (node, frame) {
    this._emit("runtime.pyAnd(");
    this.compile(node.left, frame);
    this._emit(", function(){ return ");
    this.compile(node.right, frame);
    this._emit("; })");
  };
  C.compileNot = function (node, frame) {
    this._emit("!runtime.pyBool(");
    this.compile(node.target, frame);
    this._emit(")");
  };
  const arith = (op: string) =>
    function (this: Emitter, node: Node, frame: unknown) {
      this._emit(`runtime.pyArith(${JSON.stringify(op)}, `);
      this.compile(node.left, frame);
      this._emit(", ");
      this.compile(node.right, frame);
      this._emit(")");
    };
  C.compileAdd = arith("+");
  C.compileSub = arith("-");
  C.compileMul = arith("*");
  C.compileDiv = arith("/");
  C.compileFloorDiv = arith("//");
  C.compileMod = arith("%");
  C.compilePow = arith("**");
  // A Python tuple, ("Int", "Float"), is a sequence (nunjucks read it as its last item); (x) stays x.
  C.compileGroup = function (node, frame) {
    const children = (node.children as unknown[]) ?? [];
    (this as unknown as { _compileAggregate(n: Node, f: unknown, a: string, b: string): void })._compileAggregate(node, frame, children.length > 1 ? "[" : "(", children.length > 1 ? "]" : ")");
  };
  C.compileConcat = function (node, frame) {
    this._emit("(runtime.pyStrOf(");
    this.compile(node.left, frame);
    this._emit(") + runtime.pyStrOf(");
    this.compile(node.right, frame);
    this._emit("))");
  };
  // loop.index and the rest are ints (they printed "1", not "1.0").
  (C as unknown as Record<string, (this: Emitter, node: Node, arr: string, i: string, len: string) => void>)._emitLoopBindings = function (_node, _arr, i, len) {
    const int = (x: string) => `new runtime.PyInt(${x})`;
    const bindings = [
      ["index", int(`${i} + 1`)], ["index0", int(i)], ["revindex", int(`${len} - ${i}`)], ["revindex0", int(`${len} - ${i} - 1`)],
      ["first", `${i} === 0`], ["last", `${i} === ${len} - 1`], ["length", int(len)],
    ];
    for (const [name, val] of bindings) this._emitLine(`frame.set("loop.${name}", ${val});`);
  };
  C.compileNeg = function (node, frame) {
    this._emit("runtime.pyArith(\"-\", new runtime.PyInt(0), ");
    this.compile(node.target, frame);
    this._emit(")");
  };
  C.compileCompare = function (node, frame) {
    // a < b < c: each pair compared, all must hold (Python's chain).
    const ops = node.ops ?? [];
    this._emit("(function(){ var l = ");
    this.compile(node.expr, frame);
    this._emit(", r; ");
    ops.forEach((op) => {
      this._emit("r = ");
      this.compile(op.expr, frame);
      this._emit(`; if (!runtime.pyCompare(l, ${JSON.stringify(op.type)}, r)) return false; l = r; `);
    });
    this._emit("return true; })()");
  };

  runtime.PyInt = PyInt;
  runtime.pyBool = pyBool;
  runtime.pyCompare = pyCompare;
  runtime.pyArith = pyArith;
  runtime.pyStrOf = (v: unknown) => (typeof v === "string" ? v : v instanceof nunjucks.runtime.SafeString ? String(v) : pyPrint(v));
  runtime.pyOr = (a: unknown, b: () => unknown) => (pyBool(a) ? a : b());
  runtime.pyAnd = (a: unknown, b: () => unknown) => (pyBool(a) ? b() : a);
  runtime.memberLookup = pyLookup;
  const fromIterator = originals.fromIterator;
  runtime.fromIterator = (v: unknown) => (v instanceof PyUndefined ? [] : metaOf(v)?.dict ? Object.keys(v as object) : fromIterator(v));
  const contextOrFrameLookup = originals.contextOrFrameLookup;
  runtime.contextOrFrameLookup = (context: unknown, frame: unknown, name: string) => {
    const v = contextOrFrameLookup(context, frame, name);
    if (v !== undefined) return v;
    if (name === "True") return true;
    if (name === "False") return false;
    if (name === "None") return null;
    return new PyUndefined(`{{ ${name} }}`);
  };
  const suppressValue = originals.suppressValue;
  runtime.suppressValue = (v: unknown, autoescape: boolean) =>
    v instanceof nunjucks.runtime.SafeString || typeof v === "string" ? suppressValue(v, autoescape) : suppressValue(pyPrint(v), autoescape);
}

patchNunjucks();
const ENV = makeEnvironment();
const compiled = new Map<string, nunjucks.Template>();

/** Renders a Jinja template (compiled once per text) with this context, as Frappe's Jinja did. */
export function renderJinja(template: string, context: Record<string, unknown>): string {
  let t = compiled.get(template);
  if (!t) {
    t = new nunjucks.Template(template, ENV, undefined, true);
    compiled.set(template, t);
  }
  return t.render(context);
}
