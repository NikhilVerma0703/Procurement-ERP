// WHICH DATABASE AN OPERATOR SCRIPT IS ABOUT TO TOUCH, and whether the importer may write there.
//
// Mirrors the Main ERP's src/lib/localDatabase.ts (its code review of 20-10-2026, SCR-2): the URL is
// the one Prisma itself would use (the shell's DATABASE_URL first, else .env, else prisma/.env, which
// never override a variable already set), read from the files rather than process.env because a tsx
// script has not loaded .env when it starts; and a database is "this machine" by the URL's own host,
// never by a substring.
//
// WHY IT MATTERS HERE: in the Main ERP the repo's .env holds the PRODUCTION Neon URL by convention,
// and the importer empties and reloads every purchase_* table. So the importer writes to a database
// that is not this machine only when the operator names that host on the command line
// (--target <host>), which is what the production cut-over does, once (docs/10-merge-guide.md §4).
// Pure: the caller passes the file reader.

type Env = Readonly<Record<string, string | undefined>>;

/** The hosts that are this machine (or a docker-compose Postgres named "postgres"). */
export const LOCAL_DATABASE_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "::1", "postgres"];

/** The files Prisma reads DATABASE_URL from, in the order it lets them win. */
export const PRISMA_ENV_FILES: readonly string[] = [".env", "prisma/.env"];

/** One variable's value from a .env file's text, as dotenv reads it; undefined when it is not set. */
export function dotEnvValue(text: string, key: string): string | undefined {
  let found: string | undefined;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!m || m[1] !== key) continue;
    let v = m[2]!.trim();
    const q = v[0];
    if ((q === '"' || q === "'" || q === "`") && v.length >= 2 && v.endsWith(q)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "").trim();
    found = v;
  }
  return found;
}

/** The DATABASE_URL Prisma would connect to from this checkout; "" when nothing sets it. */
export function prismaDatabaseUrl(env: Env, read: (file: string) => string | null): string {
  const own = String(env.DATABASE_URL ?? "").trim();
  if (own) return own;
  for (const file of PRISMA_ENV_FILES) {
    const text = read(file);
    if (text == null) continue;
    const v = dotEnvValue(text, "DATABASE_URL");
    if (v != null && v.trim()) return v.trim();
  }
  return "";
}

/** The URL's host, lower-case and without IPv6 brackets; null when it cannot be read. */
export function databaseHost(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = (u.hostname || u.searchParams.get("host") || "").replace(/^\[|\]$/g, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/** "host/database" for the log: never the user name or the password. */
export function databaseLabel(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${databaseHost(url) ?? "?"}${u.pathname && u.pathname !== "/" ? u.pathname : ""}`;
  } catch {
    return "(unreadable DATABASE_URL)";
  }
}

export const isLocalDatabaseHost = (host: string | null): boolean => host !== null && LOCAL_DATABASE_HOSTS.includes(host);

/**
 * Why the importer must not write to this database, in words for the person at the keyboard; null
 * when it may: the database is on this machine, or `named` (--target) is exactly its host.
 */
export function importTargetRefusal(url: string, named: string | undefined): string | null {
  if (!url.trim()) return "DATABASE_URL is not set, in the shell or in .env, so the importer cannot tell which database it would load. Nothing was changed.";
  const host = databaseHost(url);
  if (host == null) return "DATABASE_URL could not be read as a URL, so the importer cannot tell which database it would load. Nothing was changed.";
  if (isLocalDatabaseHost(host)) return null;
  if (named !== undefined && named.trim().toLowerCase() === host) return null;
  return (
    `DATABASE_URL points at ${host}, which is not this machine. The importer empties and reloads every purchase_* table there. ` +
    `To load that database on purpose (the production cut-over, docs/10-merge-guide.md §4), name it: --target ${host}. Nothing was changed.`
  );
}

/** Why a command meant for a local database only must not run against this URL; null when it may. */
export function localDatabaseRefusal(url: string, what: string): string | null {
  if (!url.trim()) return `${what} refuses to run: DATABASE_URL is not set, in the shell or in .env. Nothing was changed.`;
  const host = databaseHost(url);
  if (host == null) return `${what} refuses to run: DATABASE_URL could not be read as a URL. Nothing was changed.`;
  if (isLocalDatabaseHost(host)) return null;
  return `${what} refuses to run: DATABASE_URL points at ${host}, which is not this machine. It is for a local database only. Nothing was changed.`;
}
