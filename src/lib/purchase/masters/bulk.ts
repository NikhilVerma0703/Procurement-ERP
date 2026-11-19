// A master list's Actions → Delete over the ticked records: each through that master's own Delete (the
// form's ⋯ Delete, with its link checks: "Cannot delete or cancel because …"), in rounds as Frappe's
// delete_bulk ran them (lib/purchase/bulk-delete.ts). Server only.
import "server-only";
import { deleteInRounds, type BulkOutcome } from "../bulk-delete";
import type { ActionResult } from "../orders/form-schema";
import type { MasterKey } from "../routes";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import { deleteAddress } from "./address/server";
import { deleteContact } from "./contact/server";
import { deleteItem } from "./item/server";
import { MASTER_DOCTYPES as DOCTYPE } from "./rename";
import { deleteSupplier } from "./supplier/server";
import { deletePaymentTerm, deletePaymentTermsTemplate, deleteTaxTemplate, deleteTerms } from "./templates/server";

const DELETE: Record<MasterKey, (user: PurchaseUser, id: string) => Promise<ActionResult>> = {
  suppliers: deleteSupplier,
  items: deleteItem,
  addresses: deleteAddress,
  contacts: deleteContact,
  taxTemplates: deleteTaxTemplate,
  paymentTermsTemplates: deletePaymentTermsTemplate,
  paymentTerms: deletePaymentTerm,
  terms: deleteTerms,
};

export const isMasterKey = (k: string): k is MasterKey => Object.prototype.hasOwnProperty.call(DELETE, k);

/** The ticked records' names (their ID, `code`), by id. */
async function names(kind: MasterKey, ids: string[]): Promise<Map<string, string>> {
  const args = { where: { id: { in: ids } }, select: { id: true, code: true } } as const;
  const rows: { id: string; code: string }[] = await (() => {
    switch (kind) {
      case "suppliers":
        return db.purchaseSupplier.findMany(args);
      case "items":
        return db.purchaseItem.findMany(args);
      case "addresses":
        return db.purchaseAddress.findMany(args);
      case "contacts":
        return db.purchaseContact.findMany(args);
      case "taxTemplates":
        return db.purchaseTaxTemplate.findMany(args);
      case "paymentTermsTemplates":
        return db.purchasePaymentTermsTemplate.findMany(args);
      case "paymentTerms":
        return db.purchasePaymentTerm.findMany(args);
      case "terms":
        return db.purchaseTermsTemplate.findMany(args);
    }
  })();
  return new Map(rows.map((r) => [r.id, r.code]));
}

export async function bulkDeleteMasters(user: PurchaseUser, kind: MasterKey, ids: string[]): Promise<ActionResult<BulkOutcome>> {
  const nameOf = await names(kind, ids);
  const found = ids.filter((id) => nameOf.has(id)).map((id) => ({ id, name: nameOf.get(id)! }));
  const outcome = await deleteInRounds(found, async (row) => {
    try {
      const r = await DELETE[kind](user, row.id);
      return r.ok ? null : r.error;
    } catch (e) {
      console.error(`bulk delete of ${DOCTYPE[kind]} failed`, row.name, e);
      return `${DOCTYPE[kind]} ${row.name} could not be deleted.`;
    }
  });
  for (const id of ids.filter((x) => !nameOf.has(x))) outcome.failed.push({ id, name: "", error: `${DOCTYPE[kind]} not found` });
  return { ok: true, value: outcome };
}
