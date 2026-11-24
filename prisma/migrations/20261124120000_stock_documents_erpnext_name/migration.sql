-- The generic Stock table keeps each record's ERPNext name as every other table does (erpnext_name).
ALTER TABLE "purchase_documents" RENAME COLUMN "name" TO "erpnext_name";

-- RenameIndex
ALTER INDEX "purchase_documents_doctype_name_key" RENAME TO "purchase_documents_doctype_erpnext_name_key";
