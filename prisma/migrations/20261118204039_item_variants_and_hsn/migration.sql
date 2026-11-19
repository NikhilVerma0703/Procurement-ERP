-- CreateTable
CREATE TABLE "purchase_hsn_codes" (
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "purchase_hsn_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "purchase_item_attributes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "numeric_values" BOOLEAN NOT NULL DEFAULT false,
    "from_range" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "to_range" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "increment" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_item_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_attribute_values" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "attribute_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "attribute_value" TEXT NOT NULL,
    "abbr" TEXT NOT NULL,

    CONSTRAINT "purchase_item_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_variant_attributes" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "item_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "attribute" TEXT NOT NULL,
    "attribute_value" TEXT,
    "variant_of" TEXT,
    "numeric_values" BOOLEAN NOT NULL DEFAULT false,
    "from_range" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "to_range" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "increment" DECIMAL(21,9) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_item_variant_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_attributes_code_key" ON "purchase_item_attributes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_attribute_values_erpnext_name_key" ON "purchase_item_attribute_values"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_item_attribute_values_attribute_id_idx" ON "purchase_item_attribute_values"("attribute_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_variant_attributes_erpnext_name_key" ON "purchase_item_variant_attributes"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_item_variant_attributes_item_id_idx" ON "purchase_item_variant_attributes"("item_id");

-- AddForeignKey
ALTER TABLE "purchase_item_attribute_values" ADD CONSTRAINT "purchase_item_attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "purchase_item_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_variant_attributes" ADD CONSTRAINT "purchase_item_variant_attributes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
