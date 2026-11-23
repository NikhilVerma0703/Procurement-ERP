import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  console.log(await db.purchaseNamingSeries.findUnique({ where: { prefix: "PR/25-26/MM-" } }));
  const r = await db.purchaseReceipt.findUnique({ where: { number: "PR/25-26/MM-03447" }, include: { items: { orderBy: { idx: "asc" } }, taxes: true } });
  if (!r) return console.log("none");
  console.log(r.number, r.docStatus, r.status, r.title, String(r.netTotal), String(r.totalTaxesAndCharges), String(r.grandTotal), String(r.roundedTotal), r.inWords, r.postingDate.toISOString().slice(0, 10), r.postingTime, r.createdBy, r.createdAt.toISOString());
  for (const i of r.items) console.log(" ", i.idx, i.itemCode, String(i.qty), String(i.receivedQty), String(i.rate), String(i.amount), String(i.igstAmount), i.warehouseCode, i.orderNumber, i.orderItemName, !!i.orderItemId, !!i.itemId, !!i.warehouseId);
  for (const t of r.taxes) console.log("  tax", t.idx, t.chargeType, t.accountHead, String(t.taxAmount), String(t.total));
  const l = r.legacy as Record<string, unknown>;
  console.log(Object.keys(l).length, l.name, l.modified, l.owner, l.naming_series, l.docstatus, l.supplier_name);
  await db.$disconnect();
})();
