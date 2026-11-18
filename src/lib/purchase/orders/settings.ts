// The old site's Buying and Accounts Settings the PO screen depends on, read
// from the ERPNext backup of 16-11-2026 (tabSingles). They were set once and
// never changed for POs; the replica keeps them as constants (no settings
// screen: the original's was outside the PO module). Pure.

export const BUYING_SETTINGS = {
  /** A new PO's price list when its supplier has none. */
  buyingPriceList: "Standard Buying",
  /** The same item may be on several rows (184 historical POs have it so). */
  allowMultipleItems: true,
  /** Approving or cancelling a PO updates its items' Last Purchase Rate. */
  disableLastPurchaseRate: false,
  /** "Supplier Name": suppliers are named by their name (the Supplier link shows it). */
  supplierNaming: "Supplier Name",
} as const;

export const ACCOUNTS_SETTINGS = {
  /** Update Items does not add tax rows from a new row's Item Tax Template. */
  addTaxesFromItemTaxTemplate: false,
} as const;
