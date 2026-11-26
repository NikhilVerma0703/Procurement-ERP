-- Assign To, Add Tags and the list sidebar's saved filters (owner, 26-11-2026: "Build all of them").
CREATE TABLE "purchase_assignments" (
    "id" TEXT NOT NULL,
    "doctype" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "record_name" TEXT NOT NULL,
    "allocated_to" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_assignments_doctype_record_id_idx" ON "purchase_assignments"("doctype", "record_id");
CREATE INDEX "purchase_assignments_allocated_to_status_idx" ON "purchase_assignments"("allocated_to", "status");

CREATE TABLE "purchase_tags" (
    "id" TEXT NOT NULL,
    "doctype" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_tags_doctype_record_id_tag_key" ON "purchase_tags"("doctype", "record_id", "tag");
CREATE INDEX "purchase_tags_doctype_tag_idx" ON "purchase_tags"("doctype", "tag");

CREATE TABLE "purchase_saved_filters" (
    "id" TEXT NOT NULL,
    "doctype" TEXT NOT NULL,
    "filter_name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "for_user" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_saved_filters_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_saved_filters_doctype_idx" ON "purchase_saved_filters"("doctype");
