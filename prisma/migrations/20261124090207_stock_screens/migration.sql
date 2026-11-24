-- AlterTable
ALTER TABLE "purchase_item_groups" ADD COLUMN     "legacy" JSONB;

-- CreateTable
CREATE TABLE "purchase_documents" (
    "id" TEXT NOT NULL,
    "doctype" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "doc_status" INTEGER NOT NULL DEFAULT 0,
    "legacy" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_documents_doctype_name_key" ON "purchase_documents"("doctype", "name");
