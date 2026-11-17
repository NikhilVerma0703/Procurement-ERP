import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// STANDALONE ONLY — the door of the app while it runs on its own: no page or
// API but the sign-in is reached without a session (auth.config.ts,
// `authorized`). Each Purchase page and route still checks its own action
// (lib/purchase/server/gate.ts). At the merge the Main ERP's middleware,
// which already guards /purchase-style module paths, takes over.

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
