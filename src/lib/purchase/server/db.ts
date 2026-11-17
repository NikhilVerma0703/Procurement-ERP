// The module's database client — the one place the Purchase module gets Prisma.
//
// STANDALONE: its own client, kept on globalThis in development so hot reloads
// do not open a new connection pool each time. AT THE MERGE: re-exports the
// Main ERP's `prisma` (lib/prisma.ts), which carries the View-as write guard.
// Nothing else in the module may construct a PrismaClient (CLAUDE.md, seams).
import "server-only";
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { purchaseDb?: PrismaClient };

export const db: PrismaClient = g.purchaseDb ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") g.purchaseDb = db;
