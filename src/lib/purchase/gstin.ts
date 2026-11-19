// India Compliance 14's GST rules for parties and addresses, with its messages
// (gst_india/utils/__init__.py: validate_gstin, validate_gstin_check_digit,
// guess_gst_category, validate_gst_category, validate_pincode;
// gst_india/overrides/party.py and address.py; gst_india/constants). The
// supplier and address screens run these on save, as the old site did. Each
// check returns the problem instead of throwing. Pure.

/** GSTIN formats by GST Category (gst_india/constants: GSTIN_FORMATS). */
const NORMAL = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z1-9ABD-J]{1}[0-9A-Z]{1}$";
const GOVT_DEPTID = "^[0-9]{2}[A-Z]{4}[0-9]{5}[A-Z]{1}[0-9]{1}[Z]{1}[0-9]{1}$";
const REGISTERED = new RegExp(`${NORMAL}|${GOVT_DEPTID}`);
const OVERSEAS = /^[0-9]{4}[A-Z]{3}[0-9]{5}[N][R][0-9A-Z]{1}$|^[9][9][0-9]{2}[A-Z]{3}[0-9]{5}[O][S][0-9A-Z]{1}$/;
export const GSTIN_FORMATS: Record<string, RegExp> = {
  "Registered Regular": REGISTERED,
  "Registered Composition": REGISTERED,
  SEZ: REGISTERED,
  Overseas: OVERSEAS,
  "Deemed Export": REGISTERED,
  "UIN Holders": /^[0-9]{4}[A-Z]{3}[0-9]{5}[UO]{1}[N][A-Z0-9]{1}$/,
  "Tax Deductor": /^[0-9]{2}[A-Z]{4}[A-Z0-9]{1}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[D][0-9A-Z]$/,
  "Tax Collector": /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[C]{1}[0-9A-Z]{1}$/,
};

/** The GST Category options, in India Compliance's order. */
export const GST_CATEGORIES = [
  "Registered Regular",
  "Registered Composition",
  "Unregistered",
  "SEZ",
  "Overseas",
  "Deemed Export",
  "UIN Holders",
  "Tax Deductor",
  "Tax Collector",
] as const;

export const PAN_NUMBER = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PINCODE_FORMAT = /^[1-9][0-9]{5}$/;

/** GST state numbers (gst_india/constants: STATE_NUMBERS). */
export const STATE_NUMBERS: Record<string, string> = {
  "Andaman and Nicobar Islands": "35",
  "Andhra Pradesh": "37",
  "Arunachal Pradesh": "12",
  Assam: "18",
  Bihar: "10",
  Chandigarh: "04",
  Chhattisgarh: "22",
  "Dadra and Nagar Haveli and Daman and Diu": "26",
  Delhi: "07",
  Goa: "30",
  Gujarat: "24",
  Haryana: "06",
  "Himachal Pradesh": "02",
  "Jammu and Kashmir": "01",
  Jharkhand: "20",
  Karnataka: "29",
  Kerala: "32",
  Ladakh: "38",
  "Lakshadweep Islands": "31",
  "Madhya Pradesh": "23",
  Maharashtra: "27",
  Manipur: "14",
  Meghalaya: "17",
  Mizoram: "15",
  Nagaland: "13",
  Odisha: "21",
  "Other Countries": "96",
  "Other Territory": "97",
  Puducherry: "34",
  Punjab: "03",
  Rajasthan: "08",
  Sikkim: "11",
  "Tamil Nadu": "33",
  Telangana: "36",
  Tripura: "16",
  "Uttar Pradesh": "09",
  Uttarakhand: "05",
  "West Bengal": "19",
};

/** The Indian states an address may name (the state list without "Other Countries"). */
export const INDIAN_STATES = Object.keys(STATE_NUMBERS).filter((s) => s !== "Other Countries");

/** The first three digits of each state's postal codes (STATE_PINCODE_MAPPING). */
const STATE_PINCODES: Record<string, [number, number][]> = {
  "Jammu and Kashmir": [[180, 194]],
  "Himachal Pradesh": [[171, 177]],
  Punjab: [[140, 160]],
  Chandigarh: [[140, 140], [160, 160]],
  Uttarakhand: [[244, 263]],
  Haryana: [[121, 136]],
  Delhi: [[110, 110]],
  Rajasthan: [[301, 345]],
  "Uttar Pradesh": [[201, 285]],
  Bihar: [[800, 855]],
  Sikkim: [[737, 737]],
  "Arunachal Pradesh": [[790, 792]],
  Nagaland: [[797, 798]],
  Manipur: [[795, 795]],
  Mizoram: [[796, 796]],
  Tripura: [[799, 799]],
  Meghalaya: [[793, 794]],
  Assam: [[781, 788]],
  "West Bengal": [[700, 743]],
  Jharkhand: [[813, 835]],
  Odisha: [[751, 770]],
  Chhattisgarh: [[490, 497]],
  "Madhya Pradesh": [[450, 488]],
  Gujarat: [[360, 396]],
  "Dadra and Nagar Haveli and Daman and Diu": [[362, 362], [396, 396]],
  Maharashtra: [[400, 445]],
  Karnataka: [[560, 591]],
  Goa: [[403, 403]],
  "Lakshadweep Islands": [[682, 682]],
  Kerala: [[670, 695]],
  "Tamil Nadu": [[600, 643]],
  Puducherry: [[533, 533], [605, 605], [607, 607], [609, 609], [673, 673]],
  "Andaman and Nicobar Islands": [[744, 744]],
  "Andhra Pradesh": [[500, 535]],
};

export interface GstProblem {
  field: string;
  message: string;
}

const CODE_POINTS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Is the GSTIN's last character the right check digit? */
export function gstinCheckDigitOk(gstin: string): boolean {
  let factor = 1;
  let total = 0;
  const mod = CODE_POINTS.length;
  for (const ch of gstin.slice(0, -1)) {
    const d = factor * CODE_POINTS.indexOf(ch);
    total += Math.floor(d / mod) + (d % mod);
    factor = factor === 1 ? 2 : 1;
  }
  return gstin.slice(-1) === CODE_POINTS[(mod - (total % mod)) % mod];
}

/** validate_gstin: upper case, 15 characters, the check digit. Returns the cleaned GSTIN or the problem. */
export function checkGstin(raw: string | null | undefined, label = "GSTIN"): { gstin: string } | { problem: string } {
  const gstin = String(raw ?? "").toUpperCase().trim();
  if (!gstin) return { gstin: "" };
  if (gstin.length !== 15) return { problem: `${label} ${gstin} must have 15 characters` };
  if (!gstinCheckDigitOk(gstin)) return { problem: `Invalid ${label}! The check digit validation has failed. Please ensure you've typed the ${label} correctly.` };
  return { gstin };
}

/** guess_gst_category: from the GSTIN's format, or the country when there is none. */
export function guessGstCategory(gstin: string, country: string | null, current: string | null): string {
  if (!gstin) {
    if (country && country !== "India") return "Overseas";
    if (!country && current === "Overseas") return "Overseas";
    return "Unregistered";
  }
  if (GSTIN_FORMATS["Tax Deductor"].test(gstin)) return "Tax Deductor";
  if (GSTIN_FORMATS["Tax Collector"].test(gstin)) return "Tax Collector";
  if (GSTIN_FORMATS["Registered Regular"].test(gstin)) {
    return current && ["Registered Regular", "Registered Composition", "SEZ", "Deemed Export"].includes(current) ? current : "Registered Regular";
  }
  if (GSTIN_FORMATS["UIN Holders"].test(gstin)) return "UIN Holders";
  if (GSTIN_FORMATS.Overseas.test(gstin)) return "Overseas";
  return "Registered Regular";
}

/** set_gst_category: what the party's GST Category becomes on save (Overseas and Deemed Export kept). */
export function gstCategoryOnSave(gstin: string, country: string | null, current: string | null): string {
  if (current === "Overseas") return "Overseas";
  if (gstin && current === "Deemed Export") return "Deemed Export";
  return guessGstCategory(gstin, country, current);
}

/** validate_gst_category. */
export function gstCategoryProblem(category: string, gstin: string): string | null {
  if (!gstin) return ["Unregistered", "Overseas"].includes(category) ? null : "GST Category should be one of Unregistered or Overseas";
  if (category === "Unregistered") return "GST Category cannot be Unregistered for party with GSTIN";
  const format = GSTIN_FORMATS[category];
  if (format && !format.test(gstin)) {
    return `The GSTIN you've entered doesn't match the format for GST Category ${category}. Please ensure you've entered the correct GSTIN and GST Category.`;
  }
  return null;
}

/**
 * A party's (supplier's) GST fields as India Compliance saved them (validate_party): the GSTIN
 * checked and upper-cased, the GST Category set from it, the PAN taken from the GSTIN (or
 * checked when typed alone).
 */
export function partyGst(v: { gstin: string | null; gstCategory: string | null; pan: string | null; country: string | null }): {
  gstin: string;
  gstCategory: string;
  pan: string | null;
  problems: GstProblem[];
} {
  const problems: GstProblem[] = [];
  const g = checkGstin(v.gstin, "GSTIN");
  const gstin = "gstin" in g ? g.gstin : String(v.gstin ?? "").toUpperCase().trim();
  if ("problem" in g) problems.push({ field: "gstin", message: g.problem });
  const gstCategory = gstCategoryOnSave(gstin, v.country, v.gstCategory);
  const catProblem = "problem" in g ? null : gstCategoryProblem(gstCategory, gstin);
  if (catProblem) problems.push({ field: "gst_category", message: catProblem });
  let pan: string | null = null;
  if (gstin) {
    const fromGstin = gstin.slice(2, 12);
    pan = PAN_NUMBER.test(fromGstin) ? fromGstin : null;
  } else if (v.pan && v.pan.trim()) {
    pan = v.pan.toUpperCase().trim();
    if (!PAN_NUMBER.test(pan)) problems.push({ field: "pan", message: "Invalid PAN format" });
  }
  return { gstin, gstCategory, pan, problems };
}

/**
 * An address's GST fields as India Compliance saved them (address.validate): the GSTIN checked,
 * the GST Category set from it, Overseas outside India, a valid Indian state (giving GST State and
 * its number, which must open the GSTIN), and the postal code's form and state.
 */
export function addressGst(v: { gstin: string | null; gstCategory: string | null; country: string; state: string | null; pincode: string | null }): {
  gstin: string;
  gstCategory: string;
  gstState: string | null;
  gstStateNumber: string | null;
  problems: GstProblem[];
} {
  const problems: GstProblem[] = [];
  const g = checkGstin(v.gstin, "GSTIN");
  const gstin = "gstin" in g ? g.gstin : String(v.gstin ?? "").toUpperCase().trim();
  if ("problem" in g) problems.push({ field: "gstin", message: g.problem });
  const gstCategory = gstCategoryOnSave(gstin, v.country, v.gstCategory);
  const catProblem = "problem" in g ? null : gstCategoryProblem(gstCategory, gstin);
  if (catProblem) problems.push({ field: "gst_category", message: catProblem });
  if (v.country !== "India" && gstCategory !== "Overseas") problems.push({ field: "gst_category", message: "GST Category should be set to Overseas for Address outside India" });

  let gstState: string | null = null;
  let gstStateNumber: string | null = null;
  if (v.country === "India") {
    const state = (v.state ?? "").trim();
    if (!state) problems.push({ field: "state", message: "State is a required field for Indian Address" });
    else if (!STATE_NUMBERS[state]) problems.push({ field: "state", message: "Please select a valid State from available options" });
    else {
      gstState = state;
      gstStateNumber = STATE_NUMBERS[state];
      if (gstin && gstStateNumber !== gstin.slice(0, 2)) {
        problems.push({ field: "gstin", message: `First 2 digits of GSTIN should match with State Number for ${state} (${gstStateNumber})` });
      }
    }
    const pin = (v.pincode ?? "").trim();
    if (pin) {
      if (!PINCODE_FORMAT.test(pin)) problems.push({ field: "pincode", message: "Postal Code must be a 6-digit number and cannot start with 0" });
      else if (gstState && STATE_PINCODES[gstState]) {
        const first = Number(pin.slice(0, 3));
        if (!STATE_PINCODES[gstState].some(([lo, hi]) => lo <= first && first <= hi)) {
          problems.push({ field: "pincode", message: `Postal Code ${pin} is not associated with ${gstState}. Ensure the initial three digits of your postal code align correctly with the state as per the e-Invoice Master Codes.` });
        }
      }
    }
  }
  return { gstin, gstCategory, gstState, gstStateNumber, problems };
}
