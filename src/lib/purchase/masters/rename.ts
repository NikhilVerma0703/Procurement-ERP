// Rename, as Frappe's rename_doc did it for the masters that allowed it (the
// old site renamed 370 items, 85 addresses, 57 suppliers, 13 payment terms,
// 13 payment terms templates and 2 terms): the record takes the new name, a
// doctype named by a field takes it in that field too (Item Code, Payment
// Term Name, Title), a supplier its Supplier Name (Supplier.after_rename,
// suppliers being named by Supplier Name), and every place that keeps the
// old name as text gets the new one. Records point at each other by id here,
// so those text copies are all there is to change. "Merge with existing"
// (used once, on an address) is not offered.
import "server-only";
import type { ActionResult } from "../orders/form-schema";
import type { MasterKey } from "../routes";
import type { PurchaseUser } from "../server/current-user";
import { db } from "../server/db";
import { MasterError, masterResult } from "./kit";
import { checkNewName } from "./values";

/** The doctype of each master, as Frappe named it in its messages. */
export const MASTER_DOCTYPES: Record<MasterKey, string> = {
  suppliers: "Supplier",
  items: "Item",
  addresses: "Address",
  contacts: "Contact",
  taxTemplates: "Purchase Taxes and Charges Template",
  paymentTermsTemplates: "Payment Terms Template",
  paymentTerms: "Payment Term",
  terms: "Terms and Conditions",
};

export interface RenameRequest {
  newName: string;
  /** The title field's new value, where the doctype has one apart from its name (Item Name, Title). */
  newTitle?: string | null;
}

export function renameMaster(_user: PurchaseUser, master: MasterKey, id: string, req: RenameRequest): Promise<ActionResult<{ id: string; notices: string[] }>> {
  return masterResult(async () => {
    const doctype = MASTER_DOCTYPES[master];
    const n = checkNewName(doctype, req.newName);
    if ("problem" in n) throw new MasterError(n.problem, { name: n.problem });
    const name = n.name;
    const title = req.newTitle?.trim() || null;
    return db.$transaction(async (tx) => {
      const taken = (exists: unknown) => {
        if (exists) throw new MasterError(`Another ${doctype} with name ${name} exists, select another name`, { name: "Name taken" });
      };
      switch (master) {
        case "suppliers": {
          const s = await tx.purchaseSupplier.findUnique({ where: { id }, select: { code: true } });
          if (!s) throw new MasterError("This Supplier no longer exists.");
          if (s.code !== name) taken(await tx.purchaseSupplier.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchaseSupplier.update({ where: { id }, data: { code: name, supplierName: name } });
          await tx.purchaseAddressLink.updateMany({ where: { supplierId: id }, data: { linkName: name, linkTitle: name } });
          await tx.purchaseContactLink.updateMany({ where: { supplierId: id }, data: { linkName: name, linkTitle: name } });
          await tx.purchaseItemDefault.updateMany({ where: { defaultSupplier: s.code }, data: { defaultSupplier: name } });
          break;
        }
        case "items": {
          const i = await tx.purchaseItem.findUnique({ where: { id }, select: { code: true, itemName: true } });
          if (!i) throw new MasterError("This Item no longer exists.");
          if (i.code !== name) taken(await tx.purchaseItem.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchaseItem.update({ where: { id }, data: { code: name, itemName: title ?? i.itemName } });
          // The PO lines' Item Code and the variants' "Variant Of" keep the code as text.
          await tx.purchaseOrderItem.updateMany({ where: { itemId: id }, data: { itemCode: name } });
          await tx.purchaseItemVariantAttribute.updateMany({ where: { variantOf: i.code, item: { variantOfId: id } }, data: { variantOf: name } });
          break;
        }
        case "addresses": {
          const a = await tx.purchaseAddress.findUnique({ where: { id }, select: { code: true } });
          if (!a) throw new MasterError("This Address no longer exists.");
          if (a.code !== name) taken(await tx.purchaseAddress.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchaseAddress.update({ where: { id }, data: { code: name } });
          break;
        }
        case "contacts": {
          const c = await tx.purchaseContact.findUnique({ where: { id }, select: { code: true } });
          if (!c) throw new MasterError("This Contact no longer exists.");
          if (c.code !== name) taken(await tx.purchaseContact.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchaseContact.update({ where: { id }, data: { code: name } });
          break;
        }
        case "taxTemplates": {
          const t = await tx.purchaseTaxTemplate.findUnique({ where: { id }, select: { code: true, title: true } });
          if (!t) throw new MasterError("This Purchase Taxes and Charges Template no longer exists.");
          if (t.code !== name) taken(await tx.purchaseTaxTemplate.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchaseTaxTemplate.update({ where: { id }, data: { code: name, title: title ?? t.title } });
          break;
        }
        case "paymentTermsTemplates": {
          const t = await tx.purchasePaymentTermsTemplate.findUnique({ where: { id }, select: { code: true } });
          if (!t) throw new MasterError("This Payment Terms Template no longer exists.");
          if (t.code !== name) taken(await tx.purchasePaymentTermsTemplate.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchasePaymentTermsTemplate.update({ where: { id }, data: { code: name } });
          break;
        }
        case "paymentTerms": {
          const t = await tx.purchasePaymentTerm.findUnique({ where: { id }, select: { code: true } });
          if (!t) throw new MasterError("This Payment Term no longer exists.");
          if (t.code !== name) taken(await tx.purchasePaymentTerm.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchasePaymentTerm.update({ where: { id }, data: { code: name } });
          await tx.purchasePaymentTermsTemplateRow.updateMany({ where: { paymentTermId: id }, data: { paymentTermName: name } });
          await tx.purchaseOrderPaymentSchedule.updateMany({ where: { paymentTermId: id }, data: { paymentTermName: name } });
          break;
        }
        case "terms": {
          const t = await tx.purchaseTermsTemplate.findUnique({ where: { id }, select: { code: true } });
          if (!t) throw new MasterError("This Terms and Conditions no longer exists.");
          if (t.code !== name) taken(await tx.purchaseTermsTemplate.findUnique({ where: { code: name }, select: { id: true } }));
          await tx.purchaseTermsTemplate.update({ where: { id }, data: { code: name, title: name } });
          break;
        }
      }
      return { id, notices: [] };
    });
  });
}
