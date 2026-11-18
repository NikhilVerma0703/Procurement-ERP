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

/** India Compliance's Place of Supply options (the field is an Autocomplete over these). */
export const PLACES_OF_SUPPLY = [
  "01-Jammu and Kashmir", "02-Himachal Pradesh", "03-Punjab", "04-Chandigarh", "05-Uttarakhand", "06-Haryana",
  "07-Delhi", "08-Rajasthan", "09-Uttar Pradesh", "10-Bihar", "11-Sikkim", "12-Arunachal Pradesh", "13-Nagaland",
  "14-Manipur", "15-Mizoram", "16-Tripura", "17-Meghalaya", "18-Assam", "19-West Bengal", "20-Jharkhand",
  "21-Odisha", "22-Chhattisgarh", "23-Madhya Pradesh", "24-Gujarat", "26-Dadra and Nagar Haveli and Daman and Diu",
  "27-Maharashtra", "29-Karnataka", "30-Goa", "31-Lakshadweep Islands", "32-Kerala", "33-Tamil Nadu",
  "34-Puducherry", "35-Andaman and Nicobar Islands", "36-Telangana", "37-Andhra Pradesh", "38-Ladakh",
  "96-Other Countries", "97-Other Territory",
] as const;
