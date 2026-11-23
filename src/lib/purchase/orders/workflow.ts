// What can be done to a PO in its present state — the old site's workflow
// ("Purchase Order", po_setup.json) and ERPNext 14's own document rules
// (purchase_order.js refresh, Frappe's form toolbar):
//
//   Created (draft) --Approve--> Approved (submitted)
//                   --Reject---> Rejected (submitted, as the old workflow had it)
//   submitted --Cancel--> cancelled --Amend--> a new draft "<number>-1"
//   submitted, not fully received and billed --Hold / Close--> On Hold / Closed
//   On Hold --Resume-->, Closed --Re-open--> its computed status again
//   submitted, nothing received or billed in full --Update Items
//   submitted --Update (the fields allowed after submit: Order Confirmation, print settings, dates)
//   draft --Delete;  any --Duplicate (a new draft from it)
//   submitted, not On Hold / Closed / Delivered, not fully received --Create › Purchase Receipt (Phase II)
//
// Who may do each is access.ts; here, which actions a state allows. Pure.
import { purchaseCan } from "../access";

export type DocStatus = "Draft" | "Submitted" | "Cancelled";

export const PO_ACTIONS = [
  "save", "approve", "reject", "delete", "duplicate", "cancel", "amend",
  "close", "hold", "resume", "reopen", "update", "updateItems", "makeReceipt",
] as const;
export type PoAction = (typeof PO_ACTIONS)[number];

export interface PoState {
  docStatus: DocStatus;
  workflowState: string;
  status: string;
  /** % received and % billed (from the receipts and invoices against the PO). */
  perReceived: number;
  perBilled: number;
  /** A cancelled PO that already has an amendment cannot be amended again (Frappe hides Amend). */
  amended?: boolean;
}

const ENDED = new Set(["Closed", "Delivered"]);

/** Is the action possible in this state, regardless of who asks? */
export function stateAllows(s: PoState, action: PoAction): boolean {
  const submitted = s.docStatus === "Submitted";
  const notFullyDone = s.perBilled < 100 || s.perReceived < 100;
  switch (action) {
    case "save":
    case "delete":
      return s.docStatus === "Draft";
    case "approve":
    case "reject":
      return s.docStatus === "Draft" && s.workflowState === "Created";
    case "duplicate":
      return true;
    case "cancel":
      // Frappe offers Cancel on any submitted document; linked receipts and invoices refuse it.
      return submitted;
    case "amend":
      return s.docStatus === "Cancelled" && !s.amended;
    case "hold":
      return submitted && !ENDED.has(s.status) && s.status !== "On Hold" && notFullyDone;
    case "resume":
      return submitted && s.status === "On Hold";
    case "close":
      return submitted && !ENDED.has(s.status) && notFullyDone;
    case "reopen":
      return submitted && ENDED.has(s.status);
    case "update":
      return submitted;
    case "updateItems":
      return submitted && !ENDED.has(s.status) && s.perReceived < 100 && s.perBilled < 100;
    case "makeReceipt":
      // purchase_order.js: Create › Purchase Receipt while not On Hold, Closed or Delivered and not all received.
      return submitted && !ENDED.has(s.status) && s.status !== "On Hold" && s.perReceived < 100;
  }
}

/**
 * The access.ts action each workflow action needs. Update Items needs a workflow transition into
 * the PO's state for the user's role (update_child_qty_rate): the approvers' Admin role.
 */
export const ACTION_NEEDS = {
  save: "save", delete: "save", duplicate: "save", amend: "save",
  approve: "approve", reject: "approve", updateItems: "approve",
  cancel: "manage", close: "manage", hold: "manage", resume: "manage", reopen: "manage", update: "manage",
  // Receiving is the stores' part (Thiru R): the Stock module's access (Phase II).
  makeReceipt: "stock",
} as const satisfies Record<PoAction, string>;

/** May this user do this to a PO in this state? */
export function canDo(user: unknown, s: PoState | null, action: PoAction): boolean {
  if (!purchaseCan(user, ACTION_NEEDS[action])) return false;
  if (s === null) return action === "save"; // a new PO
  return stateAllows(s, action);
}

/** Every action this user may take on this PO, for drawing its buttons. */
export function allowedActions(user: unknown, s: PoState | null): Set<PoAction> {
  return new Set(PO_ACTIONS.filter((a) => canDo(user, s, a)));
}
