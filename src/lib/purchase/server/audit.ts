// The history of what was done to a PO (the shape of the Main ERP's
// action_log writes).
//
// STANDALONE: one row in purchase_order_events per action, in the same
// transaction as the change, next to the history imported from the old site
// (its Versions, workflow and status comments). The PO's timeline (Step 8)
// shows both. AT THE MERGE: also writes the Main ERP's action_log.
import "server-only";
import type { Prisma, PurchaseOrderEventKind } from "@prisma/client";

export interface OrderEvent {
  orderId: string | null;
  orderNumber: string;
  kind: PurchaseOrderEventKind;
  byEmail: string;
  /** A short line: "Approved", "Closed", … */
  subject?: string;
  content?: string;
  /** For edits: ERPNext's Version data ({ changed: [[fieldname, before, after], …], … }, orders/version.ts). */
  data?: Prisma.InputJsonValue;
  /** When it happened (default now). One action's several lines get increasing times, to keep their order. */
  at?: Date;
}

export async function recordOrderEvent(tx: Prisma.TransactionClient, e: OrderEvent): Promise<void> {
  await tx.purchaseOrderEvent.create({
    data: {
      source: "app",
      orderId: e.orderId,
      orderNumber: e.orderNumber,
      kind: e.kind,
      at: e.at ?? new Date(),
      byEmail: e.byEmail,
      subject: e.subject ?? null,
      content: e.content ?? null,
      data: e.data,
    },
  });
}
