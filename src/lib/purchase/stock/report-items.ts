// The items' pages for a report's Item Code links (Phase II, owner 24-11-2026): their record IDs by
// code. Server only.
import "server-only";
import type { PrismaClient } from "@prisma/client";
import { masterPath } from "../routes";

export async function itemHrefs(db: PrismaClient, codes: Iterable<string>): Promise<Map<string, string>> {
  const list = [...new Set(codes)];
  const out = new Map<string, string>();
  for (let i = 0; i < list.length; i += 5000) {
    const rows = await db.purchaseItem.findMany({ where: { code: { in: list.slice(i, i + 5000) } }, select: { id: true, code: true } });
    for (const r of rows) out.set(r.code, masterPath("items", r.id));
  }
  return out;
}
