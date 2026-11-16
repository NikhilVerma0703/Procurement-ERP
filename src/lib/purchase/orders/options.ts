// Today's options of the PO form's custom Select fields, as on the old site
// on 16-11-2026 (docs/reference/erpnext-setup/po_setup.json, custom_fields).
// The columns are text: older POs keep values that are no longer offered
// (16 POs say "Air / Ship" or "Air/Ship"), exactly as ERPNext kept them.
// Pure and import-free.

export const SHIPMENT_TYPES = ["Domestic", "Import"] as const;

/** Default "Road"; the original list also allowed leaving it blank. */
export const MODES_OF_TRANSPORT = ["Road", "Air", "Rail", "Ship"] as const;
export const DEFAULT_MODE_OF_TRANSPORT = "Road";

export const PURPOSES = ["General", "Domestic", "Exports"] as const;
