// STANDALONE ONLY — the sign-in accounts of the standalone app (purchase_logins).
//
//   npm run users -- list
//   npm run users -- add <email> --name "<Full Name>" --role PURCHASE|APPROVER|ADMIN
//   npm run users -- password <email>
//   npm run users -- role <email> PURCHASE|APPROVER|ADMIN
//   npm run users -- disable <email>        (enable <email> to undo)
//
// Roles: PURCHASE creates and edits drafts, APPROVER approves and rejects, ADMIN does everything.
// The password is asked for without echoing it. Without a terminal (a script), it is read from the
// environment variable PURCHASE_USER_PASSWORD instead. It is never printed or stored in clear.
import readline from "node:readline";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";
import { PrismaClient, type PurchaseLoginRole } from "@prisma/client";

const ROLES: readonly PurchaseLoginRole[] = ["PURCHASE", "APPROVER", "ADMIN"];
const MIN_PASSWORD = 8;

const db = new PrismaClient();
const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function roleOf(v: string | undefined): PurchaseLoginRole {
  const r = (v ?? "").toUpperCase();
  if (!(ROLES as readonly string[]).includes(r)) fail(`Role must be one of ${ROLES.join(", ")}.`);
  return r as PurchaseLoginRole;
}

function emailOf(v: string | undefined): string {
  const e = (v ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail("Give the login's email address.");
  return e;
}

/** Asks twice without echoing; or takes PURCHASE_USER_PASSWORD when there is no terminal. */
async function askPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const p = process.env.PURCHASE_USER_PASSWORD ?? "";
    if (p.length < MIN_PASSWORD) fail(`No terminal: set PURCHASE_USER_PASSWORD (at least ${MIN_PASSWORD} characters).`);
    return p;
  }
  const ask = (q: string) =>
    new Promise<string>((resolve) => {
      let muted = false;
      const out = new Writable({
        write(chunk, _enc, done) {
          if (!muted) process.stdout.write(chunk);
          done();
        },
      });
      const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
      rl.question(q, (answer) => {
        rl.close();
        process.stdout.write("\n");
        resolve(answer);
      });
      muted = true;
    });
  const first = await ask("Password: ");
  if (first.length < MIN_PASSWORD) fail(`The password needs at least ${MIN_PASSWORD} characters.`);
  if ((await ask("Again: ")) !== first) fail("The two passwords differ. Nothing was changed.");
  return first;
}

async function main() {
  switch (command) {
    case "list": {
      const logins = await db.purchaseLogin.findMany({ orderBy: { email: "asc" } });
      if (!logins.length) console.log("No logins yet. Add one with: npm run users -- add <email> --name \"…\" --role ADMIN");
      for (const l of logins) {
        const last = l.lastSignInAt ? `last sign-in ${l.lastSignInAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "never signed in";
        console.log(`${l.active ? " " : "x"} ${l.email.padEnd(36)} ${l.role.padEnd(9)} ${l.name}  (${last})`);
      }
      break;
    }
    case "add": {
      const email = emailOf(rest[0]);
      const name = (flag("--name") ?? "").trim() || fail('Give a name: --name "Full Name".');
      const role = roleOf(flag("--role"));
      if (await db.purchaseLogin.findUnique({ where: { email } })) fail(`${email} already has a login.`);
      const passwordHash = await bcrypt.hash(await askPassword(), 10);
      await db.purchaseLogin.create({ data: { email, name, role, passwordHash } });
      console.log(`Added ${email} (${role}).`);
      break;
    }
    case "password": {
      const email = emailOf(rest[0]);
      if (!(await db.purchaseLogin.findUnique({ where: { email } }))) fail(`${email} has no login.`);
      const passwordHash = await bcrypt.hash(await askPassword(), 10);
      await db.purchaseLogin.update({ where: { email }, data: { passwordHash } });
      console.log(`Password changed for ${email}.`);
      break;
    }
    case "role": {
      const email = emailOf(rest[0]);
      const role = roleOf(rest[1]);
      await db.purchaseLogin.update({ where: { email }, data: { role } }).catch(() => fail(`${email} has no login.`));
      console.log(`${email} is now ${role}.`);
      break;
    }
    case "disable":
    case "enable": {
      const email = emailOf(rest[0]);
      const active = command === "enable";
      await db.purchaseLogin.update({ where: { email }, data: { active } }).catch(() => fail(`${email} has no login.`));
      console.log(`${email} ${active ? "can sign in again" : "can no longer sign in"}.`);
      break;
    }
    default:
      console.log("Commands: list · add <email> --name \"…\" --role PURCHASE|APPROVER|ADMIN · password <email> · role <email> <ROLE> · disable <email> · enable <email>");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
