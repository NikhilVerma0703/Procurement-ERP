// WHO MAY USE THE PURCHASE MODULE — the one rule (the shape of the Main ERP's
// lib/pigment/access.ts).
//
// STANDALONE: the app's own logins carry one of three roles, mirroring the old
// site's workflow (plan §3): PURCHASE creates and edits drafts (ERPNext
// "Purchase Head"), APPROVER approves and rejects (ERPNext "Admin"), ADMIN
// does everything. AT THE MERGE this file is rewired to the Main ERP's roles
// (a capped PURCHASE role, as PIGMENT is) without the screens changing: they
// only ever ask purchaseCan(user, action).
//
// Actions are added as the screens that need them arrive: Step 5 (the list)
// needs only "view"; the form (Step 6) adds saving, approving and the rest.
//
// PURE AND EDGE-SAFE: no Prisma, no `next/headers`, no server-only imports.
// The server gate over it is server/gate.ts.

export type PurchaseTier = "PURCHASE" | "APPROVER" | "ADMIN";

export const PURCHASE_TIERS: readonly PurchaseTier[] = ["PURCHASE", "APPROVER", "ADMIN"];

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
] as const;

export type PurchaseAction = (typeof PURCHASE_ACTIONS)[number];

/** Who may do each action. ADMIN is on every line so the table can be read as it is. */
export const PURCHASE_ACTORS: Record<PurchaseAction, readonly PurchaseTier[]> = {
  view: ["PURCHASE", "APPROVER", "ADMIN"],
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
