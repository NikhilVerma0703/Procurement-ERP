-- CreateTable
CREATE TABLE "purchase_doc_events" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "source" TEXT NOT NULL,
    "doctype" TEXT NOT NULL,
    "doc_name" TEXT NOT NULL,
    "kind" "purchase_order_event_kind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "by_email" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "data" JSONB,

    CONSTRAINT "purchase_doc_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_doc_events_erpnext_name_key" ON "purchase_doc_events"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_doc_events_doctype_doc_name_at_idx" ON "purchase_doc_events"("doctype", "doc_name", "at");
