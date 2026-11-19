-- CreateTable
CREATE TABLE "purchase_likes" (
    "id" TEXT NOT NULL,
    "doctype" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "liked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_likes_email_idx" ON "purchase_likes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_likes_doctype_record_id_email_key" ON "purchase_likes"("doctype", "record_id", "email");
