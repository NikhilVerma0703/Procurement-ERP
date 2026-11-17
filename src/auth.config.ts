import type { NextAuthConfig } from "next-auth";

// STANDALONE ONLY — the sign-in of the app while it runs on its own (plan §3).
// At the merge the Main ERP's auth takes over and this file stays behind.
//
// EDGE-SAFE: middleware.ts imports this file, so it holds no Prisma and no
// bcrypt; the credential check is in auth.ts. The session is a JWT naming the
// login and its role; the module re-reads the login on every request
// (lib/purchase/server/current-user.ts), so the token is a door pass only.

export const authConfig = {
  trustHost: true,
  // An office working day, refreshed while in use (the Main ERP's numbers).
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 30 * 60 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    /** The door: everything but the sign-in page and its API needs a session. */
    authorized({ auth, request }) {
      const p = request.nextUrl.pathname;
      if (p === "/login" || p.startsWith("/api/auth/")) return true;
      if (auth?.user) return true;
      // An API answers 401 rather than being redirected to an HTML page.
      if (p.startsWith("/api/")) return Response.json({ error: "Sign in first." }, { status: 401 });
      return false; // → /login?callbackUrl=…
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? "");
        session.user.role = String(token.role ?? "");
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
