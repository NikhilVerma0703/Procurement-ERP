// Takes the next number of a naming series inside a save's transaction (purchase_naming_series holds each
// prefix's count, carried on from the old site's tabSeries; the row lock orders two saves). A prefix met
// for the first time starts from the count of the year before when financial-year.ts says so (FY 2026-27,
// owner 26-11-2026), else from 1.
import "server-only";
import type { Prisma } from "@prisma/client";
import { carryOverPrefix } from "./financial-year";

export async function nextInSeries(tx: Prisma.TransactionClient, prefix: string, digits = 5): Promise<string> {
  const from = carryOverPrefix(prefix);
  const rows = await tx.$queryRaw<{ current: number }[]>`
    INSERT INTO purchase_naming_series (prefix, current)
    VALUES (${prefix}, COALESCE((SELECT s.current FROM purchase_naming_series s WHERE s.prefix = ${from ?? ""}), 0) + 1)
    ON CONFLICT (prefix) DO UPDATE SET current = purchase_naming_series.current + 1
    RETURNING current`;
  return `${prefix}${String(rows[0].current).padStart(digits, "0")}`;
}
