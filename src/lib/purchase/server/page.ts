// The access check every Purchase PAGE makes first (the shape of the Main ERP's
// lib/pigment/server/page.ts).
//
// A page cannot lean on a layout's check: Next.js does not run a layout again
// on a click between two pages under it. So each page starts with
//
//   const gate = await purchasePageGate();
//
// A refusal goes to /login (no session) or /no-access, never to "/", which
// would send a refused login straight back here.
import "server-only";
import { redirect } from "next/navigation";
import type { PurchaseAction } from "../access";
import { purchaseGate, type PurchaseGate } from "./gate";

export const PURCHASE_REFUSED = "/no-access?from=/purchase";

/**
 * purchaseGate(action), or a redirect: /login for no session, /no-access otherwise. Buying pages
 * ask "view"; the Stock module's pages ask "stock" (lib/purchase/nav.ts MODULE_ACTION).
 */
export async function purchasePageGate(action: PurchaseAction = "view"): Promise<PurchaseGate> {
  const gate = await purchaseGate(action);
  if (!gate.ok) redirect(gate.status === 401 ? "/login" : PURCHASE_REFUSED);
  return gate;
}
