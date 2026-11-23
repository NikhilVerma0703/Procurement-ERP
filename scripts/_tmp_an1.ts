import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  // 1. PO row received_qty = sum of submitted receipt rows' received_qty, or their (accepted) qty?
  const rows = await db.$queryRaw<{ n: number; by_received: number; by_qty: number; both: number }[]>`
    with s as (
      select i.order_item_id, sum(i.received_qty) rq, sum(i.qty) q
      from purchase_receipt_items i join purchase_receipts r on r.id = i.receipt_id
      where r.doc_status = 'SUBMITTED' and i.order_item_id is not null and coalesce(r.legacy->>'is_return','0') = '0'
      group by i.order_item_id)
    select count(*)::int n,
      sum(case when abs(o.received_qty - s.rq) < 0.0005 then 1 else 0 end)::int by_received,
      sum(case when abs(o.received_qty - s.q) < 0.0005 then 1 else 0 end)::int by_qty,
      sum(case when abs(o.received_qty - s.rq) < 0.0005 and abs(o.received_qty - s.q) < 0.0005 then 1 else 0 end)::int both
    from s join purchase_order_items o on o.id = s.order_item_id`;
  console.log("PO rows vs receipts:", rows[0]);
  const rej = await db.$queryRaw<{ n: number }[]>`select count(*)::int n from purchase_receipt_items i join purchase_receipts r on r.id = i.receipt_id where r.doc_status='SUBMITTED' and i.rejected_qty > 0`;
  console.log("submitted rows with rejected qty:", rej[0].n);
  // 2. Services rows vs Landed Cost Vouchers
  const svc = await db.$queryRaw<{ number: string; ds: string; svc: string; lcv: string | null; lcv_total: number | null; lcv_date: Date | null; posting: Date; lcv_created: Date | null; pr_created: Date; lcv_owner: string | null; pr_owner: string | null }[]>`
    select r.number, r.doc_status::text ds, string_agg(distinct s.service_charges, ' + ') svc,
      string_agg(distinct v.number, ',') lcv, max(v.total_taxes_and_charges)::float8 lcv_total, max(v.posting_date) lcv_date, r.posting_date posting,
      min(v.created_at) lcv_created, r.created_at pr_created, max(v.created_by) lcv_owner, r.created_by pr_owner
    from purchase_receipts r join purchase_receipt_service_items s on s.receipt_id = r.id
    left join purchase_landed_cost_receipts lr on lr.receipt_document = r.number
    left join purchase_landed_cost_vouchers v on v.id = lr.voucher_id and v.doc_status <> 'CANCELLED'
    group by r.id order by r.posting_date`;
  for (const x of svc) console.log(x.number, x.ds, "svc", x.svc, "| lcv", x.lcv, x.lcv_total, x.lcv_date?.toISOString().slice(0, 10), "pr", x.posting.toISOString().slice(0, 10), "lcv@", x.lcv_created?.toISOString().slice(0, 19), "pr@", x.pr_created.toISOString().slice(0, 19), x.lcv_owner);
  await db.$disconnect();
})();
