// Checks the Material Request rules (stock/material-request.ts) against the old site's own figures
// (26-11-2026): every submitted request is worked out again — each row's Completed Qty from the
// submitted POs and Stock Entries made from it, % Ordered, the status — inside a transaction that is
// rolled back, and compared with what ERPNext stored. Read-only: nothing is kept.
//
//   npx tsx --conditions=react-server scripts/check-material-requests.ts
import { db } from "../src/lib/purchase/server/db";
import { refreshMaterialRequestsOrdered } from "../src/lib/purchase/stock/material-request";

class Rollback extends Error {}

async function main() {
  const before = await db.purchaseMaterialRequest.findMany({
    where: { docStatus: "SUBMITTED" },
    select: { number: true, status: true, perOrdered: true, items: { select: { erpnextName: true, orderedQty: true } } },
  });
  const diffs: string[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        await refreshMaterialRequestsOrdered(tx, before.map((m) => m.number), { email: "check@procurement.local", stamp: "2026-11-26 00:00:00.000000" });
        const after = await tx.purchaseMaterialRequest.findMany({
          where: { docStatus: "SUBMITTED" },
          select: { number: true, status: true, perOrdered: true, items: { select: { erpnextName: true, orderedQty: true } } },
        });
        const by = new Map(after.map((m) => [m.number, m]));
        for (const m of before) {
          const a = by.get(m.number)!;
          if (a.status !== m.status) diffs.push(`${m.number}: status ${m.status} -> ${a.status}`);
          if (Math.abs(Number(a.perOrdered) - Number(m.perOrdered)) > 1e-6) diffs.push(`${m.number}: % ordered ${m.perOrdered} -> ${a.perOrdered}`);
          const rows = new Map(a.items.map((i) => [i.erpnextName, i]));
          for (const i of m.items) {
            const r = rows.get(i.erpnextName)!;
            if (Math.abs(Number(r.orderedQty) - Number(i.orderedQty)) > 1e-6) diffs.push(`${m.number} row ${i.erpnextName}: completed qty ${i.orderedQty} -> ${r.orderedQty}`);
          }
        }
        throw new Rollback();
      },
      { timeout: 600_000, maxWait: 60_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(`${before.length} submitted Material Requests worked out again; ${diffs.length} differences`);
  for (const d of diffs.slice(0, 40)) console.log("  " + d);
  await db.$disconnect();
}

void main();
