// ERPNext's labels for the PO select fields, and the Prisma enum keys that store them.
// The database keeps the label (enum @map); Prisma hands the key to TypeScript.
// Shared by the importer and the calculation engine.

export const PO_STATUS_KEYS = {
  Draft: "DRAFT", "On Hold": "ON_HOLD", "To Receive and Bill": "TO_RECEIVE_AND_BILL", "To Bill": "TO_BILL",
  "To Receive": "TO_RECEIVE", Completed: "COMPLETED", Cancelled: "CANCELLED", Closed: "CLOSED", Delivered: "DELIVERED",
} as const;
export const DISCOUNT_ON_KEYS = { "Grand Total": "GRAND_TOTAL", "Net Total": "NET_TOTAL" } as const;
export const CHARGE_TYPE_KEYS = {
  Actual: "ACTUAL", "On Net Total": "ON_NET_TOTAL", "On Previous Row Amount": "ON_PREVIOUS_ROW_AMOUNT",
  "On Previous Row Total": "ON_PREVIOUS_ROW_TOTAL", "On Item Quantity": "ON_ITEM_QUANTITY",
} as const;
export const TAX_CATEGORY_KEYS = { Total: "TOTAL", Valuation: "VALUATION", "Valuation and Total": "VALUATION_AND_TOTAL" } as const;
export const ADD_DEDUCT_KEYS = { Add: "ADD", Deduct: "DEDUCT" } as const;
export const MARGIN_TYPE_KEYS = { Percentage: "PERCENTAGE", Amount: "AMOUNT" } as const;

/** The label stored for an enum key: labelOf(CHARGE_TYPE_KEYS, "ON_NET_TOTAL") → "On Net Total". */
export function labelOf<M extends Record<string, string>>(map: M, key: M[keyof M]): keyof M & string {
  for (const [label, k] of Object.entries(map)) if (k === key) return label as keyof M & string;
  throw new Error(`Unknown key ${String(key)}`);
}
