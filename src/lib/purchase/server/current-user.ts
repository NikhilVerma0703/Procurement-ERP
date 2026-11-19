// Who is signed in — the one place the Purchase module asks.
//
// STANDALONE: the app's own sign-in (src/auth.ts). The session only says which
// login it is; the login is read again from the database on every request, so
// a disabled login or a changed role takes effect at once, not when its token
// expires. AT THE MERGE: returns the Main ERP's currentUser() (lib/rbac.ts),
// which does the same revalidation and adds "View as".
import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "./db";
import type { PurchaseTier } from "../access";

export interface PurchaseUser {
  id: string;
  email: string;
  name: string;
  role: PurchaseTier;
}

/** The signed-in user, or null (signed out, or the login was disabled). Once per request. */
export const currentUser = cache(async (): Promise<PurchaseUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const login = await db.purchaseLogin.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!login?.active) return null;
  return { id: login.id, email: login.email, name: login.name, role: login.role };
});

/**
 * The names of the logins with these emails (lower-cased email → name), for the history lines
 * that name who did what. STANDALONE: this app's logins. AT THE MERGE: the Main ERP's users.
 */
export async function loginNames(emails: string[]): Promise<Map<string, string>> {
  if (!emails.length) return new Map();
  const logins = await db.purchaseLogin.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { email: true, name: true } });
  return new Map(logins.map((l) => [l.email.toLowerCase(), l.name]));
}
