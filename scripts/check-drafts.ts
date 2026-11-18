// Re-validates every stored draft PO with the save's own rules (Step 6), read-only:
// would the new form accept it, and do today's figures match the stored ones?
// A draft the old site saved should pass; a refusal is a rule port to check or a
// master changed since. Figures differ only where today's rules correct the old
// site (docs/04-calculation-engine.md, D1–D3) or a master changed.
//
//   npx tsx --conditions=react-server scripts/check-drafts.ts [--only <number>,<number>] [--all]
// --all re-checks submitted POs too (as Approve re-checks a draft).
import { orderRecord } from "../src/lib/purchase/orders/load";
import { orderFormValues } from "../src/lib/purchase/orders/record";
import { prepareOrder } from "../src/lib/purchase/orders/save";
import { db } from "../src/lib/purchase/server/db";

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
const only = onlyAt >= 0 ? args[onlyAt + 1].split(",").map((s) => s.trim()) : null;
const all = args.includes("--all");

async function main() {
  const orders = await db.purchaseOrder.findMany({
    where: only ? { number: { in: only } } : all ? {} : { docStatus: "DRAFT" },
    select: { id: true, number: true },
    orderBy: { number: "asc" },
  });
  const refusals = new Map<string, string[]>();
  let ok = 0;
  let sameTotals = 0;
  const totalDiffs: string[] = [];
  for (const { id, number } of orders) {
    const o = (await orderRecord(id))!;
    const p = await prepareOrder(orderFormValues(o));
    if (!p.ok) {
      const key = p.error.replace(/PUR-ORD\/\S+/g, "<PO>").replace(/Row #?\d+/g, "Row #n").slice(0, 160);
      refusals.set(key, [...(refusals.get(key) ?? []), number]);
      continue;
    }
    ok++;
    const c = p.value.calc;
    const stored = { grand: Number(o.grandTotal), rounded: Number(o.roundedTotal), taxes: Number(o.totalTaxesAndCharges), net: Number(o.netTotal) };
    const same = Math.abs(stored.grand - c.grandTotal) < 0.0005 && Math.abs(stored.rounded - c.roundedTotal) < 0.0005 && Math.abs(stored.taxes - c.totalTaxesAndCharges) < 0.0005 && Math.abs(stored.net - c.netTotal) < 0.0005;
    if (same) sameTotals++;
    else totalDiffs.push(`${number}: grand ${stored.grand} → ${c.grandTotal}, rounded ${stored.rounded} → ${c.roundedTotal}, taxes ${stored.taxes} → ${c.totalTaxesAndCharges}, net ${stored.net} → ${c.netTotal}`);
  }
  console.log(`checked ${orders.length}: accepted ${ok}, refused ${orders.length - ok}; same totals on ${sameTotals} of ${ok}`);
  for (const [why, list] of [...refusals].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${list.length} × ${why}\n   ${list.slice(0, 8).join(", ")}${list.length > 8 ? " …" : ""}`);
  }
  if (totalDiffs.length) console.log(`\ntotals differ on ${totalDiffs.length}:\n${totalDiffs.slice(0, 25).join("\n")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
