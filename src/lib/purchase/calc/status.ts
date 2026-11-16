// Purchase Order status, as ERPNext 14 sets it (erpnext/controllers/status_updater.py,
// status_map["Purchase Order"]). The rules are tried from the last to the first; the first
// that holds wins. Closed, On Hold and Delivered are kept once a user action set them.
// Pure.

export const PO_STATUSES = [
  "Draft", "On Hold", "To Receive and Bill", "To Bill", "To Receive", "Completed", "Cancelled", "Closed", "Delivered",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export interface StatusInput {
  /** 0 Draft, 1 Submitted, 2 Cancelled. */
  docStatus: 0 | 1 | 2;
  /** The status the PO has now (a user's Close / Hold, or the last computed one). */
  status: PoStatus;
  /** % received and % billed (from receipts and invoices against the PO). */
  perReceived: number;
  perBilled: number;
  /** A PO being created keeps its status (Draft) — ERPNext skips the rules for new documents. */
  isNew?: boolean;
}

export function purchaseOrderStatus(s: StatusInput): PoStatus {
  if (s.isNew) return s.status;
  const { docStatus: ds, perReceived: rec, perBilled: bill } = s;
  if (s.status === "Closed" && ds !== 2) return "Closed";
  if (s.status === "On Hold") return "On Hold";
  if (ds === 2) return "Cancelled";
  if (s.status === "Delivered") return "Delivered";
  if (rec >= 100 && bill === 100 && ds === 1) return "Completed";
  if (rec < 100 && bill === 100 && ds === 1) return "To Receive";
  if (rec >= 100 && bill < 100 && ds === 1) return "To Bill";
  if (rec < 100 && bill < 100 && ds === 1) return "To Receive and Bill";
  return "Draft";
}
