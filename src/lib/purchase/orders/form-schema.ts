// What a user types into the Purchase Order form — one zod schema shared by
// the form (browser) and the save action (server), as the Main ERP's modules
// do. Everything computed (amounts, taxes, totals, in words, GST columns,
// address texts, status) is NOT here: the server recomputes it from these
// inputs and the masters, and never stores the browser's numbers (CLAUDE.md).
//
// Links to masters are by their ERPNext name (supplier "A & A Silicates",
// account "Input Tax IGST - PESPL"), as the old form held them. Dates are
// calendar dates, "YYYY-MM-DD". Messages are ERPNext's where it had one.
import { z } from "zod";
import { MODES_OF_TRANSPORT, PURPOSES, SHIPMENT_TYPES } from "./options";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const optDay = z.union([day, z.literal(""), z.null(), z.undefined()]).transform((v) => v || null);
const optText = z.union([z.string(), z.null(), z.undefined()]).transform((v) => (v ?? "").trim() || null);
const num = (msg = "Enter a number") => z.number({ invalid_type_error: msg });

/**
 * A Select field: empty, or one of today's options. An option the field no longer offers is
 * refused with Frappe's message (_validate_selects), as the old site refused it on save.
 */
function select<T extends string>(label: string, options: readonly T[], blankOption = false) {
  const listed = [...(blankOption ? [""] : []), ...options].join('", "');
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").trim())
    .superRefine((v, ctx) => {
      if (v && !(options as readonly string[]).includes(v)) {
        ctx.addIssue({ code: "custom", message: `${label} cannot be "${v}". It should be one of "${listed}"` });
      }
    })
    .transform((v) => (v ? (v as T) : null));
}

export const CHARGE_TYPES = ["Actual", "On Net Total", "On Previous Row Amount", "On Previous Row Total", "On Item Quantity"] as const;
export const TAX_CATEGORIES = ["Total", "Valuation", "Valuation and Total"] as const;

export const itemRowSchema = z.object({
  /** The saved row's id; absent on a new row. */
  id: z.string().optional(),
  itemCode: z.string().trim().min(1, "Item Code is required"),
  itemName: z.string().trim().min(1, "Item Name is required"),
  description: z.string().default(""),
  scheduleDate: day,
  expectedDeliveryDate: optDay,
  qty: num().positive("Quantity must be greater than 0"),
  uom: z.string().trim().min(1, "UOM is required"),
  conversionFactor: num().positive("UOM Conversion Factor is required"),
  priceListRate: num().min(0).default(0),
  discountPercentage: num().min(0).max(100).default(0),
  discountAmount: num().default(0),
  marginType: z.enum(["Percentage", "Amount"]).nullable().default(null),
  marginRateOrAmount: num().default(0),
  rate: num().min(0, "Rate cannot be negative"),
  itemTaxTemplate: optText,
  warehouse: optText,
  expenseAccount: optText,
  costCenter: optText,
  applyTds: z.boolean().default(true),
  /** From the item master when the item is chosen; makes Total Net Weight. */
  weightPerUnit: num().default(0),
  /** The Material Request row this row was made from (Create › Purchase Order on the request; 26-11-2026). */
  materialRequest: optText.optional(),
  materialRequestItem: optText.optional(),
});

export const taxRowSchema = z.object({
  id: z.string().optional(),
  category: z.enum(TAX_CATEGORIES).default("Total"),
  addDeductTax: z.enum(["Add", "Deduct"]).default("Add"),
  chargeType: z.enum(CHARGE_TYPES),
  /** The row (1-based) a "previous row" charge is computed on. */
  rowId: z.number().int().positive().nullable().default(null),
  accountHead: z.string().trim().min(1, "Account Head is required"),
  description: z.string().default(""),
  rate: num().default(0),
  /** Typed only on Actual rows. */
  taxAmount: num().default(0),
  includedInPrintRate: z.boolean().default(false),
  costCenter: optText,
  /** The add-on's service price (an overhead's charge this GST row is on). */
  servicePrice: num().default(0),
});

export const overheadRowSchema = z.object({
  id: z.string().optional(),
  serviceItem: optText,
  serviceCharges: z.number().nullable().default(null),
  accountHead: optText,
  chargeType: z.string().default("Actual"),
});

export const scheduleRowSchema = z.object({
  id: z.string().optional(),
  paymentTerm: optText,
  description: optText,
  dueDate: day,
  /** 0 for a row whose amount is typed (it keeps that amount). */
  invoicePortion: num().min(0).max(100).default(0),
  paymentAmount: num().default(0),
  modeOfPayment: optText,
  dueDateBasedOn: optText,
  creditDays: z.number().int().default(0),
  creditMonths: z.number().int().default(0),
  discountType: optText,
  discount: num().default(0),
  discountValidityBasedOn: optText,
  discountValidity: z.number().int().default(0),
  discountDate: optDay,
});

export const orderFormSchema = z
  .object({
    supplier: z.string().trim().min(1, "Supplier is required"),
    transactionDate: day,
    scheduleDate: optDay,
    company: z.string().trim().min(1, "Company is required"),
    shipmentType: select("Shipment Type", SHIPMENT_TYPES),
    modeOfTransport: select("Mode Of Transport", MODES_OF_TRANSPORT, true),
    purposeOfPurchase: select("Purpose", PURPOSES),
    applyTds: z.boolean().default(false),
    taxWithholdingCategory: optText,
    isReverseCharge: z.boolean().default(false),
    isSubcontracted: z.boolean().default(false),
    costCenter: optText,
    currency: z.string().trim().min(1, "Currency is required"),
    conversionRate: num().positive("Exchange Rate is required"),
    buyingPriceList: optText,
    plcConversionRate: num().positive().default(1),
    ignorePricingRule: z.boolean().default(false),
    setWarehouse: optText,
    items: z.array(itemRowSchema).min(1, "Items are required"),
    costOverheads: z.array(overheadRowSchema).default([]),
    taxCategory: optText,
    taxesAndCharges: optText,
    taxes: z.array(taxRowSchema).default([]),
    disableRoundedTotal: z.boolean().default(false),
    applyDiscountOn: z.enum(["Grand Total", "Net Total"]).default("Grand Total"),
    additionalDiscountPercentage: num().min(0).max(100).default(0),
    discountAmount: num().min(0).default(0),
    supplierAddress: optText,
    contactPerson: optText,
    shippingAddress: optText,
    billingAddress: optText,
    placeOfSupply: optText,
    // Drop Ship tab
    customer: optText,
    customerContactPerson: optText,
    paymentTermsTemplate: optText,
    paymentSchedule: z.array(scheduleRowSchema).default([]),
    termsTemplate: optText,
    terms: z.string().default(""),
    letterHead: optText,
    groupSameItems: z.boolean().default(false),
    selectPrintHeading: optText,
    language: optText,
  })
  .superRefine((v, ctx) => {
    // ERPNext: "Row #{0}: Reqd by Date cannot be before Transaction Date".
    if (v.scheduleDate && v.scheduleDate < v.transactionDate) {
      ctx.addIssue({ code: "custom", path: ["scheduleDate"], message: "Required By cannot be before the Date" });
    }
    v.items.forEach((it, i) => {
      if (it.scheduleDate < v.transactionDate) {
        ctx.addIssue({ code: "custom", path: ["items", i, "scheduleDate"], message: `Row #${i + 1}: Required By cannot be before the Date` });
      }
    });
    v.taxes.forEach((t, i) => {
      const previous = t.chargeType === "On Previous Row Amount" || t.chargeType === "On Previous Row Total";
      if (previous && (!t.rowId || t.rowId >= i + 1)) {
        ctx.addIssue({ code: "custom", path: ["taxes", i, "rowId"], message: `Row #${i + 1}: Reference Row # must be an earlier row` });
      }
      if (!previous && t.rowId) {
        ctx.addIssue({ code: "custom", path: ["taxes", i, "rowId"], message: `Row #${i + 1}: Reference Row # is only for "On Previous Row" charges` });
      }
    });
    v.costOverheads.forEach((o, i) => {
      if (o.serviceCharges && !o.serviceItem) {
        ctx.addIssue({ code: "custom", path: ["costOverheads", i, "serviceItem"], message: `Row #${i + 1}: Service Item is required for a charge` });
      }
    });
  });

export type OrderFormValues = z.input<typeof orderFormSchema>;
export type OrderFormData = z.output<typeof orderFormSchema>;
export type ItemRowValues = z.input<typeof itemRowSchema>;
export type TaxRowValues = z.input<typeof taxRowSchema>;
export type OverheadRowValues = z.input<typeof overheadRowSchema>;
export type ScheduleRowValues = z.input<typeof scheduleRowSchema>;

/** What a save or a workflow action answers (the Main ERP's shape). */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { value: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** zod's issues as "items.0.qty" → message, for the form to show beside each field. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
