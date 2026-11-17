"use server";

import { AuthError } from "next-auth";
import { LoginThrottled, signIn, signOut } from "@/auth";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";

// STANDALONE ONLY — sign in and sign out (src/auth.ts).

/**
 * Where to go after signing in: the page the door stopped, if it is one of
 * this app's pages. Only the path and query are kept, so the address can
 * never send anyone to another site.
 */
function landing(raw: string): string {
  if (!raw) return PURCHASE_PATHS.orders;
  try {
    const u = new URL(raw, "http://local");
    const path = `${u.pathname}${u.search}`;
    return path.startsWith("/") && !path.startsWith("//") && u.pathname !== "/login" ? path : PURCHASE_PATHS.orders;
  } catch {
    return PURCHASE_PATHS.orders;
  }
}

export async function authenticate(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: landing(String(formData.get("callbackUrl") ?? "")),
    });
  } catch (error) {
    if (error instanceof LoginThrottled) return error.userMessage;
    if (error instanceof AuthError) return "Invalid email or password.";
    throw error; // the redirect after a good sign-in travels as an error
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
