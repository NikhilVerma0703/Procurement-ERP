-- CreateTable
CREATE TABLE "purchase_receipt_service_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "service_item" TEXT,
    "service_charges" TEXT,
    "account_head" TEXT,
    "charge_type" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_receipt_service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_packing_slip_sample_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "packing_slip_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "item_code" TEXT,
    "item_name" TEXT,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "colour" TEXT,
    "thick" TEXT,
    "sqft" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "sqmt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "crate" TEXT,
    "net_weight" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "length" TEXT,
    "width" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_packing_slip_sample_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_delivery_note_sales_team" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "sales_person" TEXT,
    "contact_no" TEXT,
    "allocated_percentage" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "allocated_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "commission_rate" TEXT,
    "incentives" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_delivery_note_sales_team_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_service_items_erpnext_name_key" ON "purchase_receipt_service_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_receipt_service_items_receipt_id_idx" ON "purchase_receipt_service_items"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_packing_slip_sample_items_erpnext_name_key" ON "purchase_packing_slip_sample_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_packing_slip_sample_items_packing_slip_id_idx" ON "purchase_packing_slip_sample_items"("packing_slip_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_delivery_note_sales_team_erpnext_name_key" ON "purchase_delivery_note_sales_team"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_delivery_note_sales_team_delivery_note_id_idx" ON "purchase_delivery_note_sales_team"("delivery_note_id");

-- AddForeignKey
ALTER TABLE "purchase_receipt_service_items" ADD CONSTRAINT "purchase_receipt_service_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_packing_slip_sample_items" ADD CONSTRAINT "purchase_packing_slip_sample_items_packing_slip_id_fkey" FOREIGN KEY ("packing_slip_id") REFERENCES "purchase_packing_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_delivery_note_sales_team" ADD CONSTRAINT "purchase_delivery_note_sales_team_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "purchase_delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
