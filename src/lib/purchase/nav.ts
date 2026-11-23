// WHICH SIDEBAR MODULES A LOGIN SEES (Phase II, owner 21-11-2026).
//
// Althaf (PURCHASE) works in Buying; Thiru R (STORE) in the whole Procurement ERP, Buying and
// Stock (docs/12 §6). The modules and their cards are routes.ts; who may open one is access.ts.
// Pure: the standalone sidebar uses it now, the Main ERP's nav model at the merge.

import { purchaseCan, type PurchaseAction } from "./access";
import { PURCHASE_MODULES, type PurchaseNavModule } from "./routes";

/** The permission each module's pages ask for (their page gate). */
export const MODULE_ACTION: Record<PurchaseNavModule["key"], PurchaseAction> = { buying: "view", stock: "stock" };

/** The modules this user may open, each with only its cards that have rows. */
export function navModulesFor(user: unknown): PurchaseNavModule[] {
  return PURCHASE_MODULES.filter((m) => purchaseCan(user, MODULE_ACTION[m.key]))
    .map((m) => ({ ...m, groups: m.groups.filter((g) => g.rows.length > 0) }))
    .filter((m) => m.groups.length > 0);
}
