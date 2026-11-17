import type { DefaultSession } from "next-auth";

// STANDALONE ONLY, with src/auth.ts. The session carries which login it is and
// its role; the module reads the login again from the database on every
// request (lib/purchase/server/current-user.ts), so these are a door pass, not
// the authority. Role is a plain string so this compiles before `prisma
// generate` refreshes the client.

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"];
  }
  interface User {
    id?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
  }
}
