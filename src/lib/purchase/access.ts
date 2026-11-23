// WHO MAY USE THE PURCHASE MODULE — the one rule (the shape of the Main ERP's
// lib/pigment/access.ts).
//
// STANDALONE: the app's own logins carry one of four roles, mirroring the old
// site's workflow (plan §3): PURCHASE creates and edits drafts (ERPNext
// "Purchase Head"), APPROVER approves and rejects (ERPNext "Admin"), ADMIN
// does everything. STORE (Phase II, owner 21-11-2026) is the storekeeper: all
// that PURCHASE does — he raises POs on the same screens — and the Stock module
// besides (docs/12 §6). AT THE MERGE this file is rewired to the Main ERP's roles
// (a capped PURCHASE role, as PIGMENT is; STORE is the ERP's own store role)
// without the screens changing: they only ever ask purchaseCan(user, action).
// Which buttons a PO in a given state shows is orders/workflow.ts.
//
// PURE AND EDGE-SAFE: no Prisma, no `next/headers`, no server-only imports.
// The server gate over it is server/gate.ts.

export type PurchaseTier = "PURCHASE" | "APPROVER" | "ADMIN" | "STORE";

export const PURCHASE_TIERS: readonly PurchaseTier[] = ["PURCHASE", "APPROVER", "ADMIN", "STORE"];

/** The tier of a user (anything with a `role`), or null when the module is not theirs. */
export function purchaseTierOf(user: unknown): PurchaseTier | null {
  if (!user) return null;
  const role = String((user as { role?: string | null }).role ?? "");
  return (PURCHASE_TIERS as readonly string[]).includes(role) ? (role as PurchaseTier) : null;
}

/** Every action the module's screens and routes ask about. */
export const PURCHASE_ACTIONS = [
  /** Open any Purchase page or read any Purchase API: lists, a PO, every export. */
  "view",
  /** Create a PO, edit a draft, duplicate, amend a cancelled PO, delete a draft. */
  "save",
  /** Approve or reject a draft (the workflow's transitions). */
  "approve",
  /** After approval: cancel, close, hold, resume, and update the fields that may change then. */
  "manage",
  /** Comment on a PO, and edit or delete one's own comments (ERPNext asked only to read the PO). */
  "comment",
  /** Attach files to a PO and remove them, whatever its state (as the old form's sidebar allowed). */
  "attach",
  /** Email a PO from its timeline (New Email), its sheet attached. */
  "email",
  /** Create and edit the masters a PO links to: suppliers, items, addresses, contacts, templates. */
  "masters",
  /** Like a PO or a master (the ♥ on a list row and in a form), as anyone who could open it could. */
  "like",
  /** Open and work in the Stock module: receipts, stock transactions, stock reports (Phase II). */
  "stock",
] as const;

export type PurchaseAction = (typeof PURCHASE_ACTIONS)[number];

/**
 * Who may do each action. ADMIN is on every line so the table can be read as it is.
 * The old site's workflow: drafts (state Created) were edited by "Purchase Head"; Approve
 * and Reject, and editing an approved PO, by "Admin" (po_setup.json, workflow).
 */
export const PURCHASE_ACTORS: Record<PurchaseAction, readonly PurchaseTier[]> = {
  view: ["PURCHASE", "STORE", "APPROVER", "ADMIN"],
  // Both buyers raise POs on the one set of screens: Althaf 2,166 of the old site's 3,227, Thiru R
  // (STORE) 891 (owner, 21-11-2026: "shared rather than duplicated").
  save: ["PURCHASE", "STORE", "ADMIN"],
  approve: ["APPROVER", "ADMIN"],
  manage: ["APPROVER", "ADMIN"],
  comment: ["PURCHASE", "STORE", "APPROVER", "ADMIN"],
  attach: ["PURCHASE", "STORE", "APPROVER", "ADMIN"],
  email: ["PURCHASE", "STORE", "APPROVER", "ADMIN"],
  // The people who raise POs keep the records they need (ERPNext: Purchase Master Manager, Item
  // Manager); approvers see them.
  masters: ["PURCHASE", "STORE", "ADMIN"],
  like: ["PURCHASE", "STORE", "APPROVER", "ADMIN"],
  // The Stock module is the storekeeper's (owner, 21-11-2026: Althaf "Buying", Thiru R "complete
  // Procurement ERP"). Buyers and approvers are not shown it.
  stock: ["STORE", "ADMIN"],
};

/** May this user do this? An action nobody defined fails closed, a prototype key included. */
export function purchaseCan(user: unknown, action: PurchaseAction): boolean {
  if (!(PURCHASE_ACTIONS as readonly string[]).includes(action)) return false;
  const tier = purchaseTierOf(user);
  return tier !== null && PURCHASE_ACTORS[action].includes(tier);
}

/** May this login reach /purchase or /api/purchase at all? */
export function maySeePurchaseModule(user: unknown): boolean {
  return purchaseCan(user, "view");
}

/** Is this path the module's (a page or an API)? Exact or a sub-path, so "/purchases" is not. */
export function isPurchasePath(p: string): boolean {
  const q = p.indexOf("?");
  const path = q === -1 ? p : p.slice(0, q);
  return path === "/purchase" || path.startsWith("/purchase/") || path === "/api/purchase" || path.startsWith("/api/purchase/");
}
