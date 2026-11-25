// The top search box ("Search or type a command (Ctrl + G)") — the old site's awesome bar
// (Frappe 14.101 awesome_bar.js and search_utils.js, captured from the old site on 23-11-2026:
// data/erpnext-live/live-search-capture-20261123.json; its answers to 30 real searches are in
// live-search-results-20261123.json and tests/purchase/search.test.ts holds them). Owner, 23-11-2026:
// "make that search box … same functionality and behaviour".
//
// What it offers, as the old box did, in the same order (by score, highest first):
//   * "<DocType> List" and "New <DocType>" for every screen the user may open, scored by the old
//     fuzzy match (search/fuzzy.ts); "new …" ranks the New entries; "<text> in <DocType>" finds the
//     text in that list; "Report <name>" for the stock reports;
//   * "Search for <text> ↵" (the global search over documents), "Find <text> in <the list on screen>",
//     a calculator for text starting with a digit, "(" or "=", and "Generate Random Password";
//   * with nothing typed: the pages visited most, and the recent ones; always "Help on Search".
// Left out because this ERP has no such screen: the report view of a list ("… Report" beside every
// "… List"), workspaces, dashboards, pages, tags, the calendar. Pure: the search box component runs it.

import { purchaseCan } from "../access";
import { PURCHASE_PATHS } from "../routes";
import { evaluate } from "./calc";
import { boldenMatchPart, fuzzySearch } from "./fuzzy";

export interface SearchDoctype {
  doctype: string;
  /** The list's page. */
  list: string;
  /** A new record's page, when the user may create one. */
  create?: string;
  /** The list's address-bar parameter for "Find <text> in …" (its ID / title search). */
  find: string;
  /**
   * The list is the old list view (doc/DocList), which takes Frappe's route options: "Find <text> in
   * <DocType>" sets name like %text%, and the list on screen its title field (or name) like %text%
   * (awesome_bar.js make_search_in_list / make_search_in_current, captured 23-11-2026).
   */
  routeOptions?: { title: string | null };
}

export interface SearchReport {
  report: string;
  href: string;
}

/**
 * The screens, in the order the old site's boot listed them (frappe.boot.user.can_read: Terms and
 * Conditions 28, Supplier 50, Address 149, Payment Terms Template 155, Contact 191, Purchase Order 328,
 * Item 369, Purchase Receipt 416, Purchase Taxes and Charges Template 434, Payment Term 442, Gate
 * Entry 472) — equal scores keep that order. `action` is who may open it; `createAction` who may add one.
 */
const DOCTYPES: readonly (SearchDoctype & { action: "view" | "stock"; createAction: "save" | "masters" | "stock" })[] = [
  { doctype: "Terms and Conditions", list: PURCHASE_PATHS.terms, create: `${PURCHASE_PATHS.terms}/new`, find: "name", routeOptions: { title: null }, action: "view", createAction: "masters" },
  { doctype: "Supplier", list: PURCHASE_PATHS.suppliers, create: `${PURCHASE_PATHS.suppliers}/new`, find: "name", routeOptions: { title: "supplier_name" }, action: "view", createAction: "masters" },
  { doctype: "Address", list: PURCHASE_PATHS.addresses, create: `${PURCHASE_PATHS.addresses}/new`, find: "name", routeOptions: { title: null }, action: "view", createAction: "masters" },
  { doctype: "Payment Terms Template", list: PURCHASE_PATHS.paymentTermsTemplates, create: `${PURCHASE_PATHS.paymentTermsTemplates}/new`, find: "name", routeOptions: { title: null }, action: "view", createAction: "masters" },
  { doctype: "Contact", list: PURCHASE_PATHS.contacts, create: `${PURCHASE_PATHS.contacts}/new`, find: "name", routeOptions: { title: null }, action: "view", createAction: "masters" },
  { doctype: "Purchase Order", list: PURCHASE_PATHS.orders, create: PURCHASE_PATHS.orderNew, find: "name", action: "view", createAction: "save" },
  { doctype: "Item", list: PURCHASE_PATHS.items, create: `${PURCHASE_PATHS.items}/new`, find: "name", routeOptions: { title: "item_name" }, action: "view", createAction: "masters" },
  { doctype: "Purchase Receipt", list: PURCHASE_PATHS.receipts, create: `${PURCHASE_PATHS.receipts}/new`, find: "name", routeOptions: { title: "title" }, action: "stock", createAction: "stock" },
  { doctype: "Purchase Taxes and Charges Template", list: PURCHASE_PATHS.taxTemplates, create: `${PURCHASE_PATHS.taxTemplates}/new`, find: "name", routeOptions: { title: "title" }, action: "view", createAction: "masters" },
  { doctype: "Payment Term", list: PURCHASE_PATHS.paymentTerms, create: `${PURCHASE_PATHS.paymentTerms}/new`, find: "name", routeOptions: { title: null }, action: "view", createAction: "masters" },
  { doctype: "Gate Entry", list: PURCHASE_PATHS.gateEntries, create: `${PURCHASE_PATHS.gateEntries}/new`, find: "name", routeOptions: { title: null }, action: "stock", createAction: "stock" },
];

const REPORTS: readonly (SearchReport & { action: "stock" })[] = [
  { report: "Stock Ledger", href: PURCHASE_PATHS.stockLedger, action: "stock" },
  { report: "Stock Balance", href: PURCHASE_PATHS.stockBalance, action: "stock" },
];

/** The screens and reports this user may open (the boot's can_read / can_create / all_reports). */
export function searchScope(user: unknown): { doctypes: SearchDoctype[]; reports: SearchReport[] } {
  return {
    doctypes: DOCTYPES.filter((d) => purchaseCan(user, d.action)).map((d) => ({
      doctype: d.doctype, list: d.list, find: d.find, ...(d.routeOptions ? { routeOptions: d.routeOptions } : {}), ...(d.create && purchaseCan(user, d.createAction) ? { create: d.create } : {}),
    })),
    reports: REPORTS.filter((r) => purchaseCan(user, r.action)).map(({ report, href }) => ({ report, href })),
  };
}

/** What a page of this module is, for "recent" and "frequent" (Frappe's route and get_route_label). */
export interface VisitedPage {
  /** The page's address (no query). */
  path: string;
  kind: "List" | "Form" | "Report";
  /** The DocType or report. */
  name: string;
  /** A form's document name. */
  doc?: string;
}

/** The module page behind an address, or null (a new record's form, the print view, anything else). */
export function visitedPage(pathname: string, title: string | null, scope: { doctypes: SearchDoctype[]; reports: SearchReport[] }): VisitedPage | null {
  const path = pathname.replace(/\/+$/, "");
  const report = scope.reports.find((r) => r.href === path);
  if (report) return { path, kind: "Report", name: report.report };
  for (const d of scope.doctypes) {
    if (path === d.list) return { path, kind: "List", name: d.doctype };
    if (path.startsWith(`${d.list}/`)) {
      const rest = path.slice(d.list.length + 1);
      if (!rest || rest === "new" || rest.includes("/")) return null;
      // The page's title holds the document's name: "<title> - <name>" or just "<name>".
      const doc = (title ?? "").replace(/ · Procurement ERP$/, "").split(" - ").pop()?.trim();
      return doc ? { path, kind: "Form", name: d.doctype, doc } : null;
    }
  }
  return null;
}

/** An entry of the box's list. `label` is HTML (the old box's <mark>/<b>); `value` is the plain text. */
export interface SearchOption {
  type?: string;
  label: string;
  value: string;
  index: number;
  /** The page it opens. */
  href?: string;
  /** What it does instead of opening a page. */
  action?: { kind: "global-search"; text: string } | { kind: "help" } | { kind: "message"; title: string; html: string } | { kind: "random" };
  recent?: boolean;
}

export interface SearchContext {
  doctypes: SearchDoctype[];
  reports: SearchReport[];
  /** The list on screen ("Find <text> in <it>"), when the page is a list. */
  currentList: SearchDoctype | null;
  /** Pages visited, newest first (Frappe's recent documents and route history). */
  recent: VisitedPage[];
  /** Pages by how often they were visited (Frappe's Route History counts), most first. */
  frequent: { page: VisitedPage; count: number }[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const bold = (s: string) => `<b>${s}</b>`;

/** A list's address with "<field> like %text%": route options, or the list's own search parameter. */
const findHref = (d: SearchDoctype, text: string, current = false) =>
  d.routeOptions
    ? `${d.list}?${new URLSearchParams({ [(current && d.routeOptions.title) || "name"]: JSON.stringify(["like", `%${text}%`]) })}`
    : `${d.list}?${new URLSearchParams({ [d.find]: text })}`;

/** get_route_label / the recent-pages labels. */
function pageLabel(p: VisitedPage, html: boolean): string {
  const b = html ? (s: string) => bold(esc(s)) : (s: string) => s;
  if (p.kind === "List") return `${b(p.name)} List`;
  if (p.kind === "Report") return `${b(p.name)} Report`;
  return html ? `${esc(p.name)} ${bold(esc(p.doc ?? ""))}` : `${p.name} ${p.doc ?? ""}`;
}

/** get_recent_pages: visited pages whose label holds the text (index 80, newest first). */
function recentPages(keywords: string, ctx: SearchContext): SearchOption[] {
  const k = keywords.toLowerCase();
  return ctx.recent
    .filter((p) => {
      const label = (p.kind === "Form" ? p.doc ?? "" : p.name).toLowerCase().replace(/-/g, " ");
      return k === label || label.includes(k);
    })
    .map((p) => ({ label: pageLabel(p, true), value: pageLabel(p, false), href: p.path, index: 80, recent: true }));
}

/** get_frequent_links: the five pages visited most (index: how often), or the recent ones. */
function frequentLinks(ctx: SearchContext): SearchOption[] {
  const out = ctx.frequent.slice(0, 5).map(({ page, count }) => ({ label: esc(pageLabel(page, false)), value: pageLabel(page, false), href: page.path, index: count }));
  return out.length ? out : recentPages("", ctx);
}

/** get_creatables: "new <doctype>". */
function creatables(keywords: string, ctx: SearchContext): SearchOption[] {
  if (keywords.split(" ")[0].toLowerCase() !== "new") return [];
  const rest = keywords.substr(4);
  return ctx.doctypes.flatMap((d) => {
    const level = d.create ? fuzzySearch(rest, d.doctype) : 0;
    return level ? [{ type: "New", label: `New ${boldenMatchPart(d.doctype, rest)}`, value: `New ${d.doctype}`, index: 1 + level, href: d.create }] : [];
  });
}

/** get_search_in_list: "<text> in <doctype>". */
function searchInList(keywords: string, ctx: SearchContext): SearchOption[] {
  if (!keywords.split(" ").includes("in") || keywords.slice(-2) === "in") return [];
  const parts = keywords.split(" in ");
  return ctx.doctypes.flatMap((d) => {
    const level = fuzzySearch(parts[1], d.doctype);
    return level
      ? [{ type: "In List", label: `Find ${esc(parts[0])} in ${boldenMatchPart(d.doctype, parts[1])}`, value: `Find ${parts[0]} in ${d.doctype}`, index: 1 + level, href: findHref(d, parts[0]) }]
      : [];
  });
}

/** get_doctypes: "<doctype> List" (and "New <doctype>" just below it). */
function doctypes(keywords: string, ctx: SearchContext): SearchOption[] {
  return ctx.doctypes.flatMap((d) => {
    const level = fuzzySearch(keywords, d.doctype);
    if (!level) return [];
    const out: SearchOption[] = [];
    if (d.create) out.push({ type: "New", label: `New ${boldenMatchPart(d.doctype, keywords)}`, value: `New ${d.doctype}`, index: level + 0.015, href: d.create });
    // A DocType whose name ends in "List" is not called "… List List".
    const named = boldenMatchPart(d.doctype, keywords);
    out.push({ type: "List", label: d.doctype.endsWith("List") ? named : `${named} List`, value: `${d.doctype} List`, index: level + 0.05, href: d.list });
    return out;
  });
}

/** get_reports: "Report <name>". */
function reports(keywords: string, ctx: SearchContext): SearchOption[] {
  return ctx.reports.flatMap((r) => {
    const level = fuzzySearch(keywords, r.report);
    return level > 0 ? [{ type: "Report", label: `Report ${boldenMatchPart(r.report, keywords)}`, value: `Report ${r.report}`, index: level, href: r.href }] : [];
  });
}

/** deduplicate: one entry per page, the better-scored one (a recent page never replaces another). */
export function deduplicate(options: SearchOption[]): SearchOption[] {
  const out: SearchOption[] = [];
  const routes: string[] = [];
  for (const o of options) {
    if (o.href) {
      const route = o.href;
      const at = routes.indexOf(route);
      if (at === -1) {
        out.push(o);
        routes.push(route);
      } else if (out[at].index < o.index && !o.recent) {
        out[at] = o;
      }
    } else {
      out.push(o);
      routes.push("");
    }
  }
  return out;
}

/** build_options: everything the text matches, best first. */
function buildOptions(txt: string, ctx: SearchContext): SearchOption[] {
  let options = [...creatables(txt, ctx), ...searchInList(txt, ctx), ...doctypes(txt, ctx), ...reports(txt, ctx), ...recentPages(txt || "", ctx)];
  if (txt.charAt(0) === "#") options = []; // tags: this ERP has none
  return deduplicate(options).sort((a, b) => b.index - a.index);
}

/** add_defaults: global search, the list on screen, the calculator, a random password. */
function defaults(txt: string, ctx: SearchContext): SearchOption[] {
  const out: SearchOption[] = [];
  if (txt.charAt(0) !== "#") {
    out.push({
      type: "Search", label: `Search for ${bold(esc(txt))}`, value: `Search for ${txt}`, index: 100,
      action: { kind: "global-search", text: txt },
    });
  }
  if (ctx.currentList && txt.indexOf(" in") === -1) {
    out.push({
      type: "Current", label: `Find ${bold(esc(txt))} in ${bold(esc(ctx.currentList.doctype))}`, value: `Find ${txt} in ${ctx.currentList.doctype}`, index: 90,
      href: findHref(ctx.currentList, txt, true),
    });
  }
  const first = txt.substr(0, 1);
  if (/^[0-9]$/.test(first) || first === "(" || first === "=") {
    const expr = first === "=" ? txt.substr(1) : txt;
    const val = evaluate(expr);
    if (val !== null) {
      const html = `${esc(expr)} = ${bold(esc(String(val)))}`;
      out.push({ type: "Calculator", label: html, value: `${expr} = ${val}`, index: 80, action: { kind: "message", title: "Result", html } });
    }
  }
  if (txt.toLowerCase().includes("random")) out.push({ label: "Generate Random Password", value: "Generate Random Password", index: 0, action: { kind: "random" } });
  return out;
}

/** The old box's list for what is typed (its "input" handler), at most 99 entries. */
export function searchOptions(input: string, ctx: SearchContext): SearchOption[] {
  const txt = input.trim().replace(/\s\s+/g, " ");
  let options: SearchOption[] = [];
  if (txt && txt.length > 1) {
    const lastSpace = txt.lastIndexOf(" ");
    // set_specifics: "gate entry list" — the options for "gate entry" whose kind starts with "list".
    if (lastSpace !== -1) {
      const end = txt.slice(lastSpace + 1).toLowerCase();
      for (const o of buildOptions(txt.slice(0, lastSpace), ctx)) if (o.type && o.type.toLowerCase().indexOf(end) === 0) options.push(o);
    }
    options.push(...defaults(txt, ctx));
    options = options.concat(buildOptions(txt, ctx));
  } else {
    options = options.concat(deduplicate(recentPages(txt || "", ctx)));
    options = options.concat(frequentLinks(ctx));
  }
  options.push({ type: "Help", label: "Help on Search", value: "Help on Search", index: -10, action: { kind: "help" } });
  // Awesomplete's own order: by index, highest first (a stable sort keeps the order of equals).
  return deduplicate(options)
    .map((o, i) => ({ o, i }))
    .sort((a, b) => b.o.index - a.o.index || a.i - b.i)
    .map(({ o }) => o)
    .slice(0, 99);
}

/** The "Help on Search" table (its rows as the old dialog had them). */
export const SEARCH_HELP: readonly [string, string][] = [
  ["Create a new record", "new type of document"],
  ["List a document type", "document type..., e.g. customer"],
  ["Search in a document type", "text in document type"],
  ["Tags", "tag name..., e.g. #tag"],
  ["Open a module or tool", "module name..."],
  ["Calculate", "e.g. (55 + 434) / 4 or =Math.sin(Math.PI/2)..."],
];

/** frappe.utils.get_random(16): letters and digits. */
export function randomPassword(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
