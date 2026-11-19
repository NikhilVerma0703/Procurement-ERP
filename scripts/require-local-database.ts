// Stops a command meant for this machine's database before it reaches any other (standalone only;
// the Main ERP has its own, scripts/require-local-database.ts, with the same rule).
//
//   npx tsx scripts/require-local-database.ts ["what is about to run"]
//
// It runs in front of `npm run db:migrate` (prisma migrate dev), which can offer to RESET a database
// it finds out of step with prisma/migrations: pointed at production, one keypress would empty it.
// Exits 0 when the DATABASE_URL Prisma would use names this machine, 1 with a plain message
// otherwise. It reads; it never connects to anything.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { localDatabaseRefusal, prismaDatabaseUrl } from "@/lib/purchase/migrate/target";

const what = process.argv[2] || "This command";
const read = (file: string): string | null => {
  const p = join(process.cwd(), file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

const refusal = localDatabaseRefusal(prismaDatabaseUrl(process.env, read), what);
if (refusal) {
  console.error(`\n  ✖ ${refusal}\n`);
  process.exit(1);
}
