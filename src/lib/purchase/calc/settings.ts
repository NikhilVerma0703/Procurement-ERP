// The old site's calculation settings, read from its backup (System Settings, Global Defaults,
// GST Settings) on 16-11-2026. They are company setup, not options of the PO screen, so they
// are constants here; the engine takes everything else (currencies, accounts) as input.

/** Decimal places: `currency` for Currency fields, `float` for Float and Percent fields. */
export interface Precision {
  currency: number;
  float: number;
}

/** System Settings today (since 23-12-2024): currency_precision = float_precision = 3. */
export const SITE_PRECISION: Precision = { currency: 3, float: 3 };

/**
 * The settings changed several times in 2024 (System Settings versions in the backup; times in
 * UTC). Each stored PO was computed with the settings of its last save, so the golden check
 * needs them. Before 23-03-2024 the currency precision came from the number format #,###.##.
 */
export const PRECISION_HISTORY: { from: string; precision: Precision }[] = [
  { from: "2000-01-01T00:00:00Z", precision: { currency: 2, float: 3 } },
  { from: "2024-07-24T11:40:08Z", precision: { currency: 5, float: 3 } },
  { from: "2024-07-24T11:42:10Z", precision: { currency: 5, float: 5 } },
  { from: "2024-07-24T11:43:45Z", precision: { currency: 3, float: 3 } },
  { from: "2024-07-24T11:45:43Z", precision: { currency: 3, float: 2 } },
  { from: "2024-07-24T11:46:29Z", precision: { currency: 2, float: 2 } },
  { from: "2024-07-27T05:54:55Z", precision: { currency: 2, float: 4 } },
  { from: "2024-11-13T10:34:33Z", precision: { currency: 3, float: 4 } },
  { from: "2024-12-23T13:02:17Z", precision: { currency: 3, float: 3 } },
];

/** The settings in force at a moment (for recomputing a historical PO). */
export function precisionAt(at: Date): Precision {
  let p = PRECISION_HISTORY[0].precision;
  for (const h of PRECISION_HISTORY) if (at.getTime() >= Date.parse(h.from)) p = h.precision;
  return p;
}

/** System Settings → Number Format. Used by "in words" when a currency has none of its own. */
export const SYSTEM_NUMBER_FORMAT = "#,###.###";

/** India Compliance GST tax types (GST Settings account columns). RCM accounts carry "_rcm". */
export const GST_TAX_TYPES = ["cgst", "sgst", "igst", "cess", "cess_non_advol"] as const;
export type GstTaxType = (typeof GST_TAX_TYPES)[number];
export const GST_TAX_TYPES_WITH_RCM: readonly string[] = [...GST_TAX_TYPES, ...GST_TAX_TYPES.map((t) => `${t}_rcm`)];

/** GST Settings → "Round off GST values" was off: GST amounts keep their decimals. */
export const ROUND_OFF_GST_VALUES = false;
