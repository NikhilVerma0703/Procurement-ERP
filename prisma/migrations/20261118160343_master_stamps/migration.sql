-- Who made and last changed each master the PO links to, and when (Step 8: the master screens
-- show it, and refuse a save over a change made after the form was opened). Suppliers and
-- items had these from the start; addresses and contacts lacked the "by", the templates all four.
--
-- Rows imported from ERPNext take their creation / modified / owner / modified_by from the
-- importer's legacy copy where it kept one (ERPNext stored site time, Asia/Kolkata; these
-- columns hold UTC, as everywhere else). Rows without one keep the time of this migration
-- until the next import.

ALTER TABLE "purchase_addresses" ADD COLUMN "created_by" TEXT, ADD COLUMN "updated_by" TEXT;
ALTER TABLE "purchase_contacts" ADD COLUMN "created_by" TEXT, ADD COLUMN "updated_by" TEXT;

ALTER TABLE "purchase_payment_terms"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_by" TEXT;
ALTER TABLE "purchase_payment_terms_templates"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_by" TEXT;
ALTER TABLE "purchase_tax_templates"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_by" TEXT;
ALTER TABLE "purchase_terms_templates"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_by" TEXT;

-- Prisma sets updated_at itself (@updatedAt); the default only filled the existing rows.
ALTER TABLE "purchase_payment_terms" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "purchase_payment_terms_templates" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "purchase_tax_templates" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "purchase_terms_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- Backfill from the legacy copy.
UPDATE "purchase_addresses" SET "created_by" = legacy->>'owner', "updated_by" = legacy->>'modified_by' WHERE legacy IS NOT NULL;
UPDATE "purchase_contacts" SET "created_by" = legacy->>'owner', "updated_by" = legacy->>'modified_by' WHERE legacy IS NOT NULL;

UPDATE "purchase_payment_terms" SET
  "created_at" = ((legacy->>'creation')::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  "updated_at" = ((legacy->>'modified')::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  "created_by" = legacy->>'owner', "updated_by" = legacy->>'modified_by'
WHERE legacy->>'creation' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} ' AND legacy->>'modified' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} ';

UPDATE "purchase_payment_terms_templates" SET
  "created_at" = ((legacy->>'creation')::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  "updated_at" = ((legacy->>'modified')::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  "created_by" = legacy->>'owner', "updated_by" = legacy->>'modified_by'
WHERE legacy->>'creation' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} ' AND legacy->>'modified' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} ';

UPDATE "purchase_tax_templates" SET
  "created_at" = ((legacy->>'creation')::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  "updated_at" = ((legacy->>'modified')::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  "created_by" = legacy->>'owner', "updated_by" = legacy->>'modified_by'
WHERE legacy->>'creation' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} ' AND legacy->>'modified' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} ';
