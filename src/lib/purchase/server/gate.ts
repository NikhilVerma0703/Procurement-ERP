// The server gate for Purchase pages, routes and server actions (the shape of
// the Main ERP's lib/pigment/server/gate.ts).
//
// Middleware (src/middleware.ts) stops a signed-out request at the door;
// purchaseGate(action) at the top of every /api/purchase route and every
// Purchase server action decides the action itself. A server action never
// passes through a page or layout, so it must call the gate on its own.
// The rule is ../access.ts, imported, never restated.
import "server-only";
import { purchaseCan, purchaseTierOf, type PurchaseAction, type PurchaseTier } from "../access";
import { currentUser, type PurchaseUser } from "./current-user";

export interface PurchaseGate {
  ok: boolean;
  /** 401 no session · 403 not allowed · 200 ok */
  status: 200 | 401 | 403;
  user: PurchaseUser | null;
  tier: PurchaseTier | null;
}

/** Revalidates the session (current-user.ts) and confirms the user may perform `action`.
 *  The default is "view": a caller that forgets to name its action gets the read gate, never a write. */
export async function purchaseGate(action: PurchaseAction = "view"): Promise<PurchaseGate> {
  const user = await currentUser();
  if (!user) return { ok: false, status: 401, user: null, tier: null };
  const tier = purchaseTierOf(user);
  if (!purchaseCan(user, action)) return { ok: false, status: 403, user, tier };
  return { ok: true, status: 200, user, tier };
}

/** The sentence a refused request answers with. */
export function purchaseRefusal(g: PurchaseGate): string {
  if (g.status === 401) return "Your session has ended — sign in again.";
  return "You do not have access to the Purchase module.";
}
