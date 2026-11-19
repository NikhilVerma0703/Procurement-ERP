// The templates on the server: Purchase Taxes and Charges Template, Payment
// Terms Template, Payment Term and Terms and Conditions — their lists, a
// record's form values, and their save and delete, with ERPNext 14's rules
// (valdiate_taxes_and_charges_template, PaymentTermsTemplate.validate,
// TermsandConditions.validate) and names (title - company abbreviation; the
// name typed).
import "server-only";
import type { Prisma } from "@prisma/client";
import { gstAccountTypes } from "../../orders/masters";
import { ADD_DEDUCT_KEYS, CHARGE_TYPE_KEYS, labelOf, TAX_CATEGORY_KEYS } from "../../orders/labels";
import type { ActionResult } from "../../orders/form-schema";
import { sanitizeHtml } from "../../html";
import { masterPath, type MasterKey } from "../../routes";
import type { PurchaseUser } from "../../server/current-user";
import { db } from "../../server/db";
import type { SaveMasterRequest } from "../address/server";
import { assertFresh, MasterError, masterResult, refuseIf, stampsOf, syncRows, type Stamp } from "../kit";
import type { ListPage, ListShape, MasterListQuery } from "../list-query";
import type { MasterSpec, Row, Values } from "../spec";
import { checkNewName, cleanValues, flag, mandatoryErrors, num, rflag, rnum, rowsOf, rstr, str } from "../values";
import { enabledIndicator, paymentTermSpec, paymentTermsTemplateSpec, taxTemplateSpec, termsSpec } from "./spec";

type Tx = Prisma.TransactionClient;
const fieldError = (field: string, message: string) => new MasterError(message, { [field]: message });
const has = (s: string) => ({ contains: s, mode: "insensitive" as const });
const ORDER_KEYS = ["modified", "creation", "name"] as const;
const orderOf = (sort: string, o: "asc" | "desc") => (sort === "creation" ? { createdAt: o } : sort === "name" ? { code: o } : { updatedAt: o });

export interface TemplateDoc {
  id: string;
  code: string;
  title: string;
  updatedAt: string;
  indicator: ReturnType<typeof enabledIndicator> | null;
  values: Values;
  created: Stamp;
  edited: Stamp;
}

/** Cleans a save's values against a layout, refusing what Frappe's own checks refused. */
function cleaned(spec: MasterSpec, raw: unknown, isNew: boolean): Values {
  const c = cleanValues(spec, raw);
  if ("invalid" in c) throw new MasterError(c.invalid);
  refuseIf(c.errors);
  const m = mandatoryErrors(spec, c.values, isNew);
  refuseIf(m.errors, m.message);
  return c.values;
}

const row = (master: MasterKey, r: { id: string; code: string; title?: string; updatedAt: Date; disabled?: boolean }, cells: Record<string, string | null> = {}) => ({
  id: r.id,
  href: masterPath(master, r.id),
  title: r.title ?? r.code,
  name: r.code,
  pill: r.disabled === undefined ? null : enabledIndicator({ disabled: r.disabled }),
  cells,
  updatedAt: r.updatedAt.toISOString(),
});

// Purchase Taxes and Charges Template ------------------------------------------------------------

export const TAX_TEMPLATE_LIST: ListShape = { filters: ["company"], sorts: [...ORDER_KEYS], defaultSort: "modified", defaultOrder: "desc" };

export async function listTaxTemplates(q: MasterListQuery): Promise<ListPage> {
  const where: Prisma.PurchaseTaxTemplateWhereInput = {
    ...(q.q ? { OR: [{ code: has(q.q) }, { title: has(q.q) }] } : {}),
    ...(q.filters.company ? { company: { code: q.filters.company } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.purchaseTaxTemplate.findMany({ where, orderBy: [orderOf(q.sort, q.order), { code: "asc" }], take: q.limit, include: { company: { select: { code: true } } } }),
    db.purchaseTaxTemplate.count({ where }),
  ]);
  return { total, rows: rows.map((t) => row("taxTemplates", t, { is_default: t.isDefault ? "Yes" : "No", company: t.company?.code ?? null })) };
}

export async function companyNames(): Promise<string[]> {
  return (await db.purchaseCompany.findMany({ select: { code: true }, orderBy: { code: "asc" } })).map((c) => c.code);
}

export async function loadTaxTemplate(id: string): Promise<TemplateDoc | null> {
  const t = await db.purchaseTaxTemplate.findUnique({
    where: { id },
    include: { company: { select: { code: true } }, taxCategory: { select: { code: true } }, rows: { orderBy: { idx: "asc" }, include: { accountHead: { select: { code: true } } } } },
  });
  if (!t) return null;
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    updatedAt: t.updatedAt.toISOString(),
    indicator: enabledIndicator(t),
    values: {
      _name: t.code,
      title: t.title,
      is_default: t.isDefault,
      disabled: t.disabled,
      company: t.company?.code ?? null,
      tax_category: t.taxCategory?.code ?? null,
      taxes: t.rows.map((r) => ({
        _key: r.id,
        category: labelOf(TAX_CATEGORY_KEYS, r.category),
        add_deduct_tax: labelOf(ADD_DEDUCT_KEYS, r.addDeductTax),
        charge_type: labelOf(CHARGE_TYPE_KEYS, r.chargeType),
        row_id: r.rowId,
        account_head: r.accountHead.code,
        description: r.description,
        rate: Number(r.rate),
        tax_amount: Number(r.taxAmount),
        included_in_print_rate: r.includedInPrintRate,
      })),
    },
    ...(await stampsOf(t)),
  };
}

/** validate_taxes_and_charges and validate_inclusive_tax, for each row. */
function checkTaxRows(rows: Row[]) {
  rows.forEach((t, i) => {
    const idx = i + 1;
    const type = rstr(t, "charge_type")!;
    const ref = rnum(t, "row_id");
    const previous = type === "On Previous Row Amount" || type === "On Previous Row Total";
    if ((type === "Actual" || type === "On Net Total") && ref) throw new MasterError("Can refer row only if the charge type is 'On Previous Row Amount' or 'Previous Row Total'");
    if (previous) {
      if (idx === 1) throw new MasterError("Cannot select charge type as 'On Previous Row Amount' or 'On Previous Row Total' for first row");
      if (!ref) throw new MasterError(`Please specify a valid Row ID for row ${idx} in table Purchase Taxes and Charges`);
      if (ref >= idx) throw new MasterError("Cannot refer row number greater than or equal to current row number for this Charge type");
    }
    if (rflag(t, "included_in_print_rate")) {
      if (type === "Actual") throw new MasterError(`Charge of type 'Actual' in row ${idx} cannot be included in Item Rate or Paid Amount`);
      if (type === "On Previous Row Amount" && !rflag(rows[(ref ?? 1) - 1], "included_in_print_rate")) throw new MasterError(`To include tax in row ${idx} in Item rate, taxes in rows ${ref} must also be included`);
      if (type === "On Previous Row Total" && !rows.slice(0, (ref ?? 1) - 1).every((r) => rflag(r, "included_in_print_rate"))) throw new MasterError(`To include tax in row ${idx} in Item rate, taxes in rows 1 - ${ref} must also be included`);
      if (rstr(t, "category") === "Valuation") throw new MasterError("Valuation type charges can not be marked as Inclusive");
    }
  });
}

export function saveTaxTemplate(user: PurchaseUser, req: SaveMasterRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const v = cleaned(taxTemplateSpec, req.values, isNew);
    const isDefault = flag(v, "is_default");
    const disabled = flag(v, "disabled");
    if (isDefault && disabled) throw new MasterError("Disabled template must not be default template");
    const rows = rowsOf(v, "taxes");
    checkTaxRows(rows);
    const gstTypes = await gstAccountTypes();
    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchaseTaxTemplate.findUnique({ where: { id: req.id }, include: { rows: true } }) : null;
      if (req.id && !before) throw new MasterError("This Purchase Taxes and Charges Template no longer exists. It may have been deleted.");
      if (before) assertFresh("Purchase Taxes and Charges Template", before.updatedAt, req.expectedUpdatedAt);
      const company = await tx.purchaseCompany.findUnique({ where: { code: str(v, "company")! }, select: { id: true, code: true, abbr: true } });
      if (!company) throw fieldError("company", `Could not find Company: ${str(v, "company")}`);
      const categoryCode = str(v, "tax_category");
      const category = categoryCode ? await tx.purchaseTaxCategory.findUnique({ where: { code: categoryCode }, select: { id: true } }) : null;
      if (categoryCode && !category) throw fieldError("tax_category", `Could not find Tax Category: ${categoryCode}`);
      // validate_for_tax_category: one enabled template per tax category in a company.
      if (category && !disabled) {
        const other = await tx.purchaseTaxTemplate.findFirst({ where: { companyId: company.id, taxCategoryId: category.id, disabled: false, ...(before ? { id: { not: before.id } } : {}) }, select: { id: true } });
        if (other) throw fieldError("tax_category", `A template with tax category ${categoryCode} already exists. Only one template is allowed with each tax category`);
      }
      const accounts: string[] = [];
      for (const [i, r] of rows.entries()) {
        const code = rstr(r, "account_head")!;
        const a = await tx.purchaseAccount.findUnique({ where: { code }, select: { id: true, companyId: true } });
        if (!a) throw new MasterError(`Row ${i + 1}: Could not find Account Head: ${code}`);
        if (a.companyId !== company.id) throw new MasterError(`Row ${i + 1}: Account ${code} does not belong to Company ${company.code}`);
        accounts.push(a.id);
      }
      const title = str(v, "title")!.trim();
      const data = { title, isDefault, disabled, companyId: company.id, taxCategoryId: category?.id ?? null, updatedBy: user.email };
      let id: string;
      if (before) {
        await tx.purchaseTaxTemplate.update({ where: { id: before.id }, data });
        id = before.id;
      } else {
        // autoname: "{title} - {company abbreviation}".
        const name = checkNewName("Purchase Taxes and Charges Template", `${title} - ${company.abbr}`);
        if ("problem" in name) throw fieldError("title", name.problem);
        if (await tx.purchaseTaxTemplate.findUnique({ where: { code: name.name }, select: { id: true } })) throw fieldError("title", `Purchase Taxes and Charges Template ${name.name} already exists`);
        id = (await tx.purchaseTaxTemplate.create({ data: { ...data, code: name.name, createdBy: user.email } })).id;
      }
      // A default template is the company's only one.
      if (isDefault) await tx.purchaseTaxTemplate.updateMany({ where: { companyId: company.id, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      const rowData = (r: Row, idx: number) => {
        const type = rstr(r, "charge_type") as keyof typeof CHARGE_TYPE_KEYS;
        return {
          idx,
          category: TAX_CATEGORY_KEYS[rstr(r, "category") as keyof typeof TAX_CATEGORY_KEYS],
          addDeductTax: ADD_DEDUCT_KEYS[rstr(r, "add_deduct_tax") as keyof typeof ADD_DEDUCT_KEYS],
          chargeType: CHARGE_TYPE_KEYS[type],
          rowId: type === "On Previous Row Amount" || type === "On Previous Row Total" ? rnum(r, "row_id") : null,
          accountHeadId: accounts[idx - 1],
          description: rstr(r, "description"),
          // validate_taxes_and_charges: an Actual charge has no rate.
          rate: type === "Actual" ? 0 : (rnum(r, "rate") ?? 0),
          taxAmount: type === "Actual" ? (rnum(r, "tax_amount") ?? 0) : 0,
          includedInPrintRate: rflag(r, "included_in_print_rate"),
          gstTaxType: gstTypes[rstr(r, "account_head")!] ?? null,
        };
      };
      await syncRows(before?.rows.map((r) => r.id) ?? [], rows, {
        remove: (ids) => tx.purchaseTaxTemplateRow.deleteMany({ where: { id: { in: ids }, templateId: id } }),
        update: (rid, r, idx) => tx.purchaseTaxTemplateRow.update({ where: { id: rid }, data: rowData(r, idx) }),
        create: (r, idx) => tx.purchaseTaxTemplateRow.create({ data: { templateId: id, ...rowData(r, idx) } }),
      });
      return { id, notices: [] };
    });
  });
}

export function deleteTaxTemplate(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.purchaseTaxTemplate.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!t) throw new MasterError("This Purchase Taxes and Charges Template no longer exists. It may have been deleted.");
      const po = await tx.purchaseOrder.findFirst({ where: { taxesAndChargesId: t.id }, select: { number: true }, orderBy: { number: "asc" } });
      if (po) throw new MasterError(`Cannot delete or cancel because Purchase Taxes and Charges Template ${t.code} is linked with Purchase Order ${po.number}`);
      await tx.purchaseTaxTemplate.delete({ where: { id: t.id } });
    });
    return undefined;
  });
}

// Payment Terms Template --------------------------------------------------------------------------

export const PAYMENT_TERMS_TEMPLATE_LIST: ListShape = { filters: [], sorts: [...ORDER_KEYS], defaultSort: "modified", defaultOrder: "desc" };

export async function listPaymentTermsTemplates(q: MasterListQuery): Promise<ListPage> {
  const where: Prisma.PurchasePaymentTermsTemplateWhereInput = q.q ? { code: has(q.q) } : {};
  const [rows, total] = await Promise.all([
    db.purchasePaymentTermsTemplate.findMany({ where, orderBy: [orderOf(q.sort, q.order), { code: "asc" }], take: q.limit }),
    db.purchasePaymentTermsTemplate.count({ where }),
  ]);
  return { total, rows: rows.map((t) => row("paymentTermsTemplates", t)) };
}

export async function loadPaymentTermsTemplate(id: string): Promise<TemplateDoc | null> {
  const t = await db.purchasePaymentTermsTemplate.findUnique({ where: { id }, include: { rows: { orderBy: { idx: "asc" }, include: { paymentTerm: { select: { code: true } } } } } });
  if (!t) return null;
  return {
    id: t.id,
    code: t.code,
    title: t.code,
    updatedAt: t.updatedAt.toISOString(),
    indicator: null,
    values: {
      _name: t.code,
      template_name: t.code,
      allocate_payment_based_on_payment_terms: t.allocatePaymentBasedOnPaymentTerms,
      terms: t.rows.map((r) => ({
        _key: r.id,
        // A row naming a term renamed since keeps the name it was written with.
        payment_term: r.paymentTerm?.code ?? r.paymentTermName,
        description: r.description,
        invoice_portion: Number(r.invoicePortion),
        due_date_based_on: r.dueDateBasedOn,
        credit_days: r.creditDays,
        credit_months: r.creditMonths,
      })),
    },
    ...(await stampsOf(t)),
  };
}

/** A Payment Term's fields its template rows fetch (fetch_from payment_term.*). */
export async function paymentTermDetails(code: string) {
  const t = await db.purchasePaymentTerm.findUnique({ where: { code } });
  return t
    ? { description: t.description, invoice_portion: t.invoicePortion === null ? null : Number(t.invoicePortion), due_date_based_on: t.dueDateBasedOn, credit_days: t.creditDays, credit_months: t.creditMonths }
    : null;
}

export function savePaymentTermsTemplate(user: PurchaseUser, req: SaveMasterRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const v = cleaned(paymentTermsTemplateSpec, req.values, isNew);
    const allocate = flag(v, "allocate_payment_based_on_payment_terms");
    const rows = rowsOf(v, "terms");
    if (!rows.length) throw fieldError("terms", "Mandatory fields required in Payment Terms Template: Payment Terms");
    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchasePaymentTermsTemplate.findUnique({ where: { id: req.id }, include: { rows: true } }) : null;
      if (req.id && !before) throw new MasterError("This Payment Terms Template no longer exists. It may have been deleted.");
      if (before) assertFresh("Payment Terms Template", before.updatedAt, req.expectedUpdatedAt);
      // Each row takes its term's fields (Description always, the others when left empty).
      const filled: { r: Row; termId: string | null; termName: string | null; description: string | null; invoicePortion: number; dueDateBasedOn: string | null; creditDays: number; creditMonths: number }[] = [];
      for (const [i, r] of rows.entries()) {
        const termCode = rstr(r, "payment_term");
        const term = termCode ? await tx.purchasePaymentTerm.findUnique({ where: { code: termCode } }) : null;
        const kept = termCode && !term ? before?.rows.find((x) => x.paymentTermName === termCode && !x.paymentTermId) : null;
        if (termCode && !term && !kept) throw new MasterError(`Row ${i + 1}: Could not find Payment Term: ${termCode}`);
        if (allocate && !termCode) throw new MasterError(`Row ${i + 1}: Payment Term is mandatory`);
        filled.push({
          r,
          termId: term?.id ?? null,
          termName: termCode,
          description: term ? term.description : rstr(r, "description"),
          invoicePortion: rnum(r, "invoice_portion") || (term?.invoicePortion !== null && term?.invoicePortion !== undefined ? Number(term.invoicePortion) : 0),
          dueDateBasedOn: rstr(r, "due_date_based_on") ?? term?.dueDateBasedOn ?? null,
          creditDays: rnum(r, "credit_days") || term?.creditDays || 0,
          creditMonths: rnum(r, "credit_months") || term?.creditMonths || 0,
        });
      }
      // validate_invoice_portion and validate_terms.
      const total = filled.reduce((s, f) => s + f.invoicePortion, 0);
      if (Math.round(total * 100) / 100 !== 100) throw new MasterError("Combined invoice portion must equal 100%");
      const seen = new Set<string>();
      for (const [i, f] of filled.entries()) {
        const key = JSON.stringify([f.termName, f.creditDays, f.creditMonths, f.dueDateBasedOn]);
        if (seen.has(key)) throw new MasterError(`The Payment Term at row ${i + 1} is possibly a duplicate.`);
        seen.add(key);
      }
      let id: string;
      if (before) {
        await tx.purchasePaymentTermsTemplate.update({ where: { id: before.id }, data: { allocatePaymentBasedOnPaymentTerms: allocate, updatedBy: user.email } });
        id = before.id;
      } else {
        const name = checkNewName("Payment Terms Template", str(v, "template_name"));
        if ("problem" in name) throw fieldError("template_name", name.problem);
        if (await tx.purchasePaymentTermsTemplate.findUnique({ where: { code: name.name }, select: { id: true } })) throw fieldError("template_name", `Payment Terms Template ${name.name} already exists`);
        id = (await tx.purchasePaymentTermsTemplate.create({ data: { code: name.name, allocatePaymentBasedOnPaymentTerms: allocate, createdBy: user.email, updatedBy: user.email } })).id;
      }
      const data = (idx: number) => {
        const f = filled[idx - 1];
        return { idx, paymentTermId: f.termId, paymentTermName: f.termName, description: f.description, invoicePortion: f.invoicePortion, dueDateBasedOn: f.dueDateBasedOn, creditDays: f.creditDays, creditMonths: f.creditMonths };
      };
      await syncRows(before?.rows.map((r) => r.id) ?? [], rows, {
        remove: (ids) => tx.purchasePaymentTermsTemplateRow.deleteMany({ where: { id: { in: ids }, templateId: id } }),
        update: (rid, _r, idx) => tx.purchasePaymentTermsTemplateRow.update({ where: { id: rid }, data: data(idx) }),
        create: (_r, idx) => tx.purchasePaymentTermsTemplateRow.create({ data: { templateId: id, ...data(idx) } }),
      });
      return { id, notices: [] };
    });
  });
}

export function deletePaymentTermsTemplate(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.purchasePaymentTermsTemplate.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!t) throw new MasterError("This Payment Terms Template no longer exists. It may have been deleted.");
      const po = await tx.purchaseOrder.findFirst({ where: { paymentTermsTemplateId: t.id }, select: { number: true }, orderBy: { number: "asc" } });
      if (po) throw new MasterError(`Cannot delete or cancel because Payment Terms Template ${t.code} is linked with Purchase Order ${po.number}`);
      const s = await tx.purchaseSupplier.findFirst({ where: { paymentTermsTemplateId: t.id }, select: { code: true } });
      if (s) throw new MasterError(`Cannot delete or cancel because Payment Terms Template ${t.code} is linked with Supplier ${s.code}`);
      await tx.purchasePaymentTermsTemplate.delete({ where: { id: t.id } });
    });
    return undefined;
  });
}

// Payment Term ------------------------------------------------------------------------------------

export const PAYMENT_TERM_LIST: ListShape = { filters: [], sorts: [...ORDER_KEYS], defaultSort: "modified", defaultOrder: "desc" };

export async function listPaymentTerms(q: MasterListQuery): Promise<ListPage> {
  const where: Prisma.PurchasePaymentTermWhereInput = q.q ? { OR: [{ code: has(q.q) }, { description: has(q.q) }] } : {};
  const [rows, total] = await Promise.all([
    db.purchasePaymentTerm.findMany({ where, orderBy: [orderOf(q.sort, q.order), { code: "asc" }], take: q.limit }),
    db.purchasePaymentTerm.count({ where }),
  ]);
  return { total, rows: rows.map((t) => row("paymentTerms", t)) };
}

export async function loadPaymentTerm(id: string): Promise<TemplateDoc | null> {
  const t = await db.purchasePaymentTerm.findUnique({ where: { id } });
  if (!t) return null;
  return {
    id: t.id,
    code: t.code,
    title: t.code,
    updatedAt: t.updatedAt.toISOString(),
    indicator: null,
    values: {
      _name: t.code,
      payment_term_name: t.code,
      invoice_portion: t.invoicePortion === null ? null : Number(t.invoicePortion),
      due_date_based_on: t.dueDateBasedOn,
      credit_days: t.creditDays,
      credit_months: t.creditMonths,
      description: t.description,
    },
    ...(await stampsOf(t)),
  };
}

export function savePaymentTerm(user: PurchaseUser, req: SaveMasterRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const v = cleaned(paymentTermSpec, req.values, isNew);
    const data = {
      invoicePortion: num(v, "invoice_portion"),
      dueDateBasedOn: str(v, "due_date_based_on"),
      creditDays: num(v, "credit_days") ?? 0,
      creditMonths: num(v, "credit_months") ?? 0,
      description: str(v, "description"),
      updatedBy: user.email,
    };
    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchasePaymentTerm.findUnique({ where: { id: req.id } }) : null;
      if (req.id && !before) throw new MasterError("This Payment Term no longer exists. It may have been deleted.");
      if (before) {
        assertFresh("Payment Term", before.updatedAt, req.expectedUpdatedAt);
        await tx.purchasePaymentTerm.update({ where: { id: before.id }, data });
        return { id: before.id, notices: [] };
      }
      const name = checkNewName("Payment Term", str(v, "payment_term_name"));
      if ("problem" in name) throw fieldError("payment_term_name", name.problem);
      if (await tx.purchasePaymentTerm.findUnique({ where: { code: name.name }, select: { id: true } })) throw fieldError("payment_term_name", `Payment Term ${name.name} already exists`);
      const id = (await tx.purchasePaymentTerm.create({ data: { ...data, code: name.name, createdBy: user.email } })).id;
      return { id, notices: [] };
    });
  });
}

export function deletePaymentTerm(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.purchasePaymentTerm.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!t) throw new MasterError("This Payment Term no longer exists. It may have been deleted.");
      const tpl = await tx.purchasePaymentTermsTemplateRow.findFirst({ where: { paymentTermId: t.id }, select: { idx: true, template: { select: { code: true } } } });
      if (tpl) throw new MasterError(`Cannot delete or cancel because Payment Term ${t.code} is linked with Payment Terms Template ${tpl.template.code} at Row: ${tpl.idx}`);
      const po = await tx.purchaseOrderPaymentSchedule.findFirst({ where: { paymentTermId: t.id }, select: { idx: true, order: { select: { number: true } } } });
      if (po) throw new MasterError(`Cannot delete or cancel because Payment Term ${t.code} is linked with Purchase Order ${po.order.number} at Row: ${po.idx}`);
      await tx.purchasePaymentTerm.delete({ where: { id: t.id } });
    });
    return undefined;
  });
}

// Terms and Conditions ----------------------------------------------------------------------------

/** Terms and Conditions list: sorted as the doctype said (modified, ascending). */
export const TERMS_LIST: ListShape = { filters: [], sorts: [...ORDER_KEYS], defaultSort: "modified", defaultOrder: "asc" };

export async function listTerms(q: MasterListQuery): Promise<ListPage> {
  const where: Prisma.PurchaseTermsTemplateWhereInput = q.q ? { OR: [{ code: has(q.q) }, { title: has(q.q) }] } : {};
  const [rows, total] = await Promise.all([
    db.purchaseTermsTemplate.findMany({ where, orderBy: [orderOf(q.sort, q.order), { code: "asc" }], take: q.limit }),
    db.purchaseTermsTemplate.count({ where }),
  ]);
  return { total, rows: rows.map((t) => row("terms", t, { selling: t.selling ? "Yes" : "No", buying: t.buying ? "Yes" : "No" })) };
}

export async function loadTerms(id: string): Promise<TemplateDoc | null> {
  const t = await db.purchaseTermsTemplate.findUnique({ where: { id } });
  if (!t) return null;
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    updatedAt: t.updatedAt.toISOString(),
    indicator: enabledIndicator(t),
    values: { _name: t.code, title: t.title, disabled: t.disabled, selling: t.selling, buying: t.buying, terms: t.terms },
    ...(await stampsOf(t)),
  };
}

export function saveTerms(user: PurchaseUser, req: SaveMasterRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const isNew = !req.id;
    const v = cleaned(termsSpec, req.values, isNew);
    const data = { disabled: flag(v, "disabled"), selling: flag(v, "selling"), buying: flag(v, "buying"), terms: str(v, "terms") ? sanitizeHtml(str(v, "terms")) : null, updatedBy: user.email };
    if (!data.buying && !data.selling && !data.disabled) throw new MasterError("At least one of the Applicable Modules should be selected");
    return db.$transaction(async (tx) => {
      const before = req.id ? await tx.purchaseTermsTemplate.findUnique({ where: { id: req.id } }) : null;
      if (req.id && !before) throw new MasterError("This Terms and Conditions no longer exists. It may have been deleted.");
      if (before) {
        assertFresh("Terms and Conditions", before.updatedAt, req.expectedUpdatedAt);
        await tx.purchaseTermsTemplate.update({ where: { id: before.id }, data });
        return { id: before.id, notices: [] };
      }
      const name = checkNewName("Terms and Conditions", str(v, "title"));
      if ("problem" in name) throw fieldError("title", name.problem);
      if (await tx.purchaseTermsTemplate.findUnique({ where: { code: name.name }, select: { id: true } })) throw fieldError("title", `Terms and Conditions ${name.name} already exists`);
      const id = (await tx.purchaseTermsTemplate.create({ data: { ...data, code: name.name, title: name.name, createdBy: user.email } })).id;
      return { id, notices: [] };
    });
  });
}

export function deleteTerms(_user: PurchaseUser, id: string): Promise<ActionResult> {
  return masterResult<undefined>(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.purchaseTermsTemplate.findUnique({ where: { id }, select: { id: true, code: true } });
      if (!t) throw new MasterError("This Terms and Conditions no longer exists. It may have been deleted.");
      const po = await tx.purchaseOrder.findFirst({ where: { termsTemplateId: t.id }, select: { number: true }, orderBy: { number: "asc" } });
      if (po) throw new MasterError(`Cannot delete or cancel because Terms and Conditions ${t.code} is linked with Purchase Order ${po.number}`);
      await tx.purchaseTermsTemplate.delete({ where: { id: t.id } });
    });
    return undefined;
  });
}

