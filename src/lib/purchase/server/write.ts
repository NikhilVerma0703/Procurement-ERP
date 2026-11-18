// Every Purchase write goes through here (the shape of the Main ERP's
// lib/pigment/server/write.ts).
//
// STANDALONE: there is no "View as", so the write simply runs. AT THE MERGE:
// returns the Main ERP's unlessViewing() refusal while an admin views the ERP
// as another login, so the Purchase screens never start a save they may not
// finish. Each server action asks purchaseWrite() after its gate and its
// validation, before its first query that writes.
import "server-only";

export type PurchaseWriteResult<T> = { done: true; value: T } | { done: false; refusal: string };

export async function purchaseWrite<T>(_who: { name?: string | null; email?: string | null }, fn: () => Promise<T>): Promise<PurchaseWriteResult<T>> {
  return { done: true, value: await fn() };
}
