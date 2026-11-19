// The Links table an Address or Contact keeps (Frappe's Dynamic Link): which
// parties it belongs to. Link Name searches the records of the row's Link
// Document Type. Lead links came across from the old site (35 addresses,
// 193 contacts) but there is no Lead here: they are kept as they are and
// cannot be added. Pure, client-safe.
import type { TableSpec, Values } from "./spec";

export const LINK_DOCTYPE_OPTIONS = ["", "Supplier", "Customer", "Company", "Lead"] as const;

const LOOKUP: Record<string, string> = { Supplier: "supplier", Customer: "customer", Company: "company" };

export const linksTable: TableSpec = {
  label: "Links",
  columns: [
    { name: "link_doctype", label: "Link Document Type", kind: "select", options: LINK_DOCTYPE_OPTIONS, required: true, readOnly: (v) => v.link_doctype === "Lead" },
    { name: "link_name", label: "Link Name", kind: "link", linkOf: (v: Values) => LOOKUP[String(v.link_doctype ?? "")] ?? null, required: true },
    { name: "link_title", label: "Link Title", kind: "readonly" },
  ],
  newRow: () => ({ link_doctype: null, link_name: null, link_title: null }),
};
