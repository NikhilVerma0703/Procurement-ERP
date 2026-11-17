import { randomBytes } from "node:crypto";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/purchase/server/db";
import { authConfig } from "./auth.config";

// STANDALONE ONLY — the app's own sign-in: email and password against
// purchase_logins (accounts are made with `npm run users`). At the merge the
// Main ERP's auth replaces this file, and the module's seam
// (lib/purchase/server/current-user.ts) is pointed at it.

/** Failed attempts allowed per address in the window before it is locked for the rest of it. */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { n: number; since: number }>();

/** "Too many attempts" without saying whether the address exists: unknown addresses count the same. */
export class LoginThrottled extends CredentialsSignin {
  code = "throttled";
  readonly userMessage: string;
  constructor(minutes: number) {
    super(`Login throttled for ${minutes} more minute(s)`);
    this.userMessage = `Too many failed attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
}

function lockedMinutes(key: string): number {
  const f = failures.get(key);
  if (!f) return 0;
  const left = f.since + WINDOW_MS - Date.now();
  if (left <= 0) {
    failures.delete(key);
    return 0;
  }
  return f.n >= MAX_FAILURES ? Math.ceil(left / 60000) : 0;
}

function countFailure(key: string) {
  const f = failures.get(key);
  if (!f || f.since + WINDOW_MS < Date.now()) failures.set(key, { n: 1, since: Date.now() });
  else f.n += 1;
}

// An unknown address is checked against this hash, so it takes as long to
// refuse as a wrong password does and the timing does not reveal which
// addresses have accounts.
let dummyHash: string | null = null;
const timingHash = () => (dummyHash ??= bcrypt.hashSync(randomBytes(16).toString("hex"), 10));

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const locked = lockedMinutes(email);
        if (locked) throw new LoginThrottled(locked);

        const login = await db.purchaseLogin.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, login?.passwordHash ?? timingHash());
        if (!login || !login.active || !ok) {
          countFailure(email);
          return null;
        }
        failures.delete(email);
        await db.purchaseLogin.update({ where: { id: login.id }, data: { lastSignInAt: new Date() } });
        return { id: login.id, email: login.email, name: login.name, role: login.role };
      },
    }),
  ],
});
