// The GST checks India Compliance 14 ran when a PO was saved, with its
// messages (gst_india/overrides/transaction.py: validate_transaction,
// GSTAccounts.validate, validate_reverse_charge_transaction,
// validate_item_wise_tax_detail; gst_india/utils: validate_gst_category,
// get_place_of_supply). In the order the original ran them; the first
// failing one is reported.
//
// Not replicated: the live GSTIN status check (GST Settings "validate GSTIN
// status" asked India Compliance's paid GST API) and the warning-only message
// about accounts missing from an Item Tax Template. GST Settings had overseas
// transactions enabled, so that refusal never applied. Pure.
import type { PurchaseOrderCalcResult } from "../calc/index";
import { GSTIN_FORMATS } from "../gstin";
import type { OrderFormData } from "./form-schema";
import { PLACES_OF_SUPPLY } from "./options";

/** Rounding allowance on an Actual GST row's per-item amounts (ALLOWED_TAX_DIFFERENCE). */
const ALLOWED_TAX_DIFFERENCE = 1;

export interface GstContext {
  companyGstin: string | null;
  /** The company is in India and GST-registered (else GST rules do not apply without a Company GSTIN). */
  companyIsIndianRegistered: boolean;
  billingAddress: string | null;
  billingAddressGstCategory: string | null;
  supplierAddress: string | null;
  supplierGstin: string | null;
  /** The supplier address's GST state number (the source state of an unregistered supplier). */
  supplierStateNumber: string | null;
  gstCategory: string | null;
  placeOfSupply: string | null;
  isReverseCharge: boolean;
}

export interface GstIssue {
  /** The form field to show it beside. */
  key: string;
  message: string;
}

/** get_place_of_supply for a purchase: the company GSTIN's state, else the supplier GSTIN's. */
export function derivePlaceOfSupply(companyGstin: string | null, supplierGstin: string | null): string | null {
  const gstin = companyGstin || supplierGstin;
  if (!gstin) return null;
  return PLACES_OF_SUPPLY.find((p) => p.startsWith(`${gstin.slice(0, 2)}-`)) ?? null;
}

/** ignore_gst_validations: GST rules apply to a GST-registered company with GST items. */
export function gstApplies(ctx: Pick<GstContext, "companyGstin" | "companyIsIndianRegistered">, c: PurchaseOrderCalcResult): boolean {
  if (!ctx.companyGstin && !ctx.companyIsIndianRegistered) return false;
  return c.items.some((row) => row.gstTreatment !== "Non-GST");
}

export function gstIssue(d: OrderFormData, c: PurchaseOrderCalcResult, ctx: GstContext): GstIssue | null {
  if (!ctx.companyGstin && !ctx.companyIsIndianRegistered) return null;

  // validate_items: Non-GST rows only (then no GST may be charged), not mixed, one template per item.
  const nonGst: number[] = [];
  const templateOf = new Map<string, string | null>();
  const mixedTemplates: string[] = [];
  c.items.forEach((row, i) => {
    if (row.gstTreatment === "Non-GST") {
      nonGst.push(i + 1);
      return;
    }
    const key = row.itemCode || row.itemName || "";
    if (!templateOf.has(key)) templateOf.set(key, row.itemTaxTemplate);
    else if (templateOf.get(key) !== row.itemTaxTemplate && !mixedTemplates.includes(key)) mixedTemplates.push(key);
  });
  if (nonGst.length === c.items.length) {
    const t = c.taxes.find((tax) => tax.gstTaxType && tax.taxAmount);
    return t ? { key: `taxes.${t.idx - 1}.accountHead`, message: `Row #${t.idx}: Cannot charge GST for Non GST Items` } : null;
  }
  if (nonGst.length) {
    return {
      key: "items",
      message: `Items not covered under GST cannot be clubbed with items for which GST is applicable. Please create another document for items in the following row numbers: ${nonGst.join(", ")}`,
    };
  }
  if (mixedTemplates.length) {
    return { key: "items", message: `Cannot use different Item Tax Templates in different rows for following items: ${mixedTemplates.join(", ")}` };
  }

  const placeOfSupply = ctx.placeOfSupply || derivePlaceOfSupply(ctx.companyGstin, ctx.supplierGstin);
  if (ctx.placeOfSupply && !(PLACES_OF_SUPPLY as readonly string[]).includes(ctx.placeOfSupply)) {
    return { key: "placeOfSupply", message: `"${ctx.placeOfSupply}" is not a valid Place of Supply. Please choose from available options.` };
  }
  if (!ctx.billingAddress) {
    return { key: "billingAddress", message: "Please set Company Billing Address to ensure Company GSTIN is fetched in the transaction." };
  }
  if (!ctx.companyGstin) return { key: "billingAddress", message: "Company GSTIN is a mandatory field for GST Transactions" };
  if (!placeOfSupply) return { key: "placeOfSupply", message: "Place of Supply is a mandatory field for GST Transactions" };
  if (!ctx.gstCategory) {
    return { key: "supplierAddress", message: "GST Category is a mandatory field for GST Transactions. Please ensure that it is set in the Party and / or Address." };
  }

  // validate_gst_category
  if (!ctx.supplierGstin) {
    if (ctx.gstCategory !== "Unregistered" && ctx.gstCategory !== "Overseas") {
      return { key: "supplierAddress", message: "GST Category should be one of Unregistered or Overseas" };
    }
  } else if (ctx.gstCategory === "Unregistered") {
    return { key: "supplierAddress", message: "GST Category cannot be Unregistered for party with GSTIN" };
  } else if (!GSTIN_FORMATS[ctx.gstCategory]?.test(ctx.supplierGstin)) {
    return {
      key: "supplierAddress",
      message: `The GSTIN you've entered doesn't match the format for GST Category ${ctx.gstCategory}. Please ensure you've entered the correct GSTIN and GST Category.`,
    };
  }

  const accounts = gstAccountsIssue(c, ctx, placeOfSupply);
  if (accounts) return accounts;
  const reverse = reverseChargeIssue(c, ctx);
  if (reverse) return reverse;
  return actualRowIssue(c);
}

/** GSTAccounts.validate, for a purchase. */
function gstAccountsIssue(c: PurchaseOrderCalcResult, ctx: GstContext, placeOfSupply: string): GstIssue | null {
  const rows = c.taxes.filter((t) => t.taxAmount && t.gstTaxType);
  if (!rows.length) return null;
  const at = (idx: number) => `taxes.${idx - 1}.accountHead`;
  const first = rows[0].idx;
  const isRcm = (type: string | null) => Boolean(type?.endsWith("_rcm"));

  if (ctx.supplierGstin && ctx.companyGstin === ctx.supplierGstin) {
    return { key: at(first), message: `Cannot charge GST in Row #${first} since Company GSTIN and Party GSTIN are same` };
  }
  if (!ctx.isReverseCharge) {
    const rcm = rows.find((t) => isRcm(t.gstTaxType));
    if (rcm) return { key: at(rcm.idx), message: `Cannot use Reverse Charge Account in Row #${rcm.idx} since transaction is without Reverse Charge` };
  }
  if (ctx.gstCategory === "Registered Composition") {
    return { key: at(first), message: `Cannot claim Input GST in Row #${first} since purchase is being made from a dealer registered under Composition Scheme` };
  }
  if (!ctx.isReverseCharge && !ctx.supplierGstin) {
    return { key: at(first), message: `Cannot charge GST in Row #${first} since purchase is from a Supplier without GSTIN` };
  }

  if (ctx.billingAddressGstCategory !== "SEZ") {
    // get_source_state_code for a purchase
    const source =
      ctx.gstCategory === "Overseas"
        ? "96"
        : ctx.gstCategory === "Unregistered" && ctx.supplierAddress
          ? (ctx.supplierStateNumber ?? "")
          : (ctx.supplierGstin || ctx.companyGstin || "").slice(0, 2);
    const interState = ctx.gstCategory === "SEZ" || placeOfSupply.slice(0, 2) !== source;
    const base = (t: { gstTaxType: string | null }) => (t.gstTaxType ?? "").replace(/_rcm$/, "");
    for (const t of rows) {
      if (interState && (base(t) === "cgst" || base(t) === "sgst")) {
        return { key: at(t.idx), message: `Row #${t.idx}: Cannot charge CGST/SGST for inter-state supplies` };
      }
      if (!interState && base(t) === "igst") return { key: at(t.idx), message: `Row #${t.idx}: Cannot charge IGST for intra-state supplies` };
    }
    // The input CGST and SGST accounts (not the RCM ones) must both be charged.
    if (!interState && !(rows.some((t) => t.gstTaxType === "cgst") && rows.some((t) => t.gstTaxType === "sgst"))) {
      return { key: "taxes", message: "Cannot use only one of CGST or SGST account for intra-state supplies" };
    }
  }

  const references = new Set<number>();
  for (const t of rows) {
    if (t.chargeType === "On Previous Row Amount") {
      return { key: `taxes.${t.idx - 1}.chargeType`, message: `Row #${t.idx}: Charge Type cannot be On Previous Row Amount for a GST Account` };
    }
    if (t.chargeType === "On Previous Row Total") references.add(t.rowId ?? 0);
    const nonAdvol = (t.gstTaxType ?? "").includes("cess_non_advol");
    if (t.chargeType === "On Item Quantity" && !nonAdvol) {
      return { key: `taxes.${t.idx - 1}.chargeType`, message: `Row #${t.idx}: Charge Type cannot be On Item Quantity as it is not a Cess Non Advol Account` };
    }
    if (nonAdvol && t.chargeType !== "On Item Quantity" && t.chargeType !== "Actual") {
      return { key: `taxes.${t.idx - 1}.chargeType`, message: `Row #${t.idx}: Charge Type must be On Item Quantity / Actual as it is a Cess Non Advol Account` };
    }
  }
  if (references.size > 1) {
    return { key: "taxes", message: "Only one row can be selected as a Reference Row for GST Accounts with Charge Type On Previous Row Total" };
  }
  return null;
}

/** validate_reverse_charge_transaction: input GST added, the same reverse charge booked against it. */
function reverseChargeIssue(c: PurchaseOrderCalcResult, ctx: GstContext): GstIssue | null {
  if (!ctx.isReverseCharge) return null;
  let gst = 0;
  let booked = 0;
  for (const t of c.taxes) {
    if (!t.gstTaxType || !t.taxAmount) continue;
    const amount = t.baseTaxAmountAfterDiscountAmount;
    const positive = amount > 0;
    const key = `taxes.${t.idx - 1}.accountHead`;
    if (!t.gstTaxType.includes("rcm")) {
      if (t.addDeductTax !== "Add" || !positive) return { key, message: `Row #${t.idx}: Tax amount should be positive for GST Account ${t.accountHead}` };
      gst += amount;
    } else if (t.addDeductTax === "Deduct") {
      if (!positive) return { key, message: `Row #${t.idx}: Tax amount should be positive for GST Account ${t.accountHead} as you are Deducting Tax` };
      booked -= amount;
    } else {
      if (positive) return { key, message: `Row #${t.idx}: Tax amount should be negative for GST Account ${t.accountHead}` };
      booked += amount;
    }
  }
  if (Math.round((gst + booked) * 100) / 100 !== 0) return { key: "taxes", message: "Booked reverse charge is not equal to applied tax amount" };
  return null;
}

/** validate_item_wise_tax_detail: an Actual GST row's per-item amounts must match its rates. */
function actualRowIssue(c: PurchaseOrderCalcResult): GstIssue | null {
  const taxable = new Map<string, number>();
  const qty = new Map<string, number>();
  c.items.forEach((row) => {
    const key = row.itemCode || row.itemName || "";
    taxable.set(key, (taxable.get(key) ?? 0) + row.taxableValue);
    qty.set(key, (qty.get(key) ?? 0) + row.qty);
  });
  for (const t of c.taxes) {
    if (!t.gstTaxType || t.chargeType !== "Actual") continue;
    const nonAdvol = t.gstTaxType.includes("cess_non_advol");
    for (const [item, [rate, amount]] of Object.entries(t.itemWiseTaxDetail)) {
      const key = `taxes.${t.idx - 1}.chargeType`;
      if (amount && !rate) {
        return { key, message: `Tax Row #${t.idx}: Charge Type is set to Actual. However, this would not compute item taxes, and your further reporting will be affected.` };
      }
      const multiplier = nonAdvol ? (qty.get(item) ?? 0) : (taxable.get(item) ?? 0) / 100;
      if (Math.abs(multiplier * rate - amount) > ALLOWED_TAX_DIFFERENCE) {
        return {
          key,
          message: `Tax Row #${t.idx}: Charge Type is set to Actual. However, Tax Amount ${amount} as computed for Item ${item} is incorrect. Try setting the Charge Type to ${nonAdvol ? "On Item Quantity" : "On Net Total"}`,
        };
      }
    }
  }
  return null;
}
