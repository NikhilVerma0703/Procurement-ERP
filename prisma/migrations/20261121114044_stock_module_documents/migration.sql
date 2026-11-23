-- CreateTable
CREATE TABLE "purchase_stock_entry_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "legacy" JSONB,

    CONSTRAINT "purchase_stock_entry_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_gate_entries" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "amended_from_id" TEXT,
    "location" TEXT,
    "order_number" TEXT NOT NULL,
    "order_id" TEXT,
    "order_date" DATE,
    "supplier_code" TEXT NOT NULL,
    "supplier_id" TEXT,
    "invoice_no" TEXT,
    "invoice_date" DATE,
    "gate_entry_date" DATE,
    "receipt_number" TEXT,
    "inward_date" DATE,
    "financial_year" TEXT,
    "vehicle_no" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_gate_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_gate_entry_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "gate_entry_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "order_number" TEXT,
    "order_id" TEXT,
    "order_date" DATE,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_description" TEXT,
    "uom" TEXT,
    "po_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "bal_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "order_item_name" TEXT,
    "order_item_id" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_gate_entry_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "status" TEXT NOT NULL,
    "amended_from_id" TEXT,
    "supplier_code" TEXT NOT NULL,
    "supplier_id" TEXT,
    "supplier_name" TEXT,
    "supplier_delivery_note" TEXT,
    "bill_no" TEXT,
    "bill_date" DATE,
    "posting_date" DATE NOT NULL,
    "posting_time" TEXT NOT NULL,
    "set_posting_time" BOOLEAN NOT NULL DEFAULT false,
    "company_code" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "conversion_rate" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "buying_price_list" TEXT,
    "price_list_currency" TEXT,
    "plc_conversion_rate" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "set_warehouse" TEXT,
    "total_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_category" TEXT,
    "taxes_and_charges" TEXT,
    "base_taxes_and_charges_added" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total_taxes_and_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "taxes_and_charges_added" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total_taxes_and_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "apply_discount_on" TEXT,
    "additional_discount_percentage" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_grand_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rounding_adjustment" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rounded_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_in_words" TEXT,
    "grand_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rounding_adjustment" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rounded_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "in_words" TEXT,
    "other_charges_calculation" TEXT,
    "supplier_address" TEXT,
    "address_display" TEXT,
    "contact_person" TEXT,
    "contact_display" TEXT,
    "contact_mobile" TEXT,
    "contact_email" TEXT,
    "shipping_address" TEXT,
    "shipping_address_display" TEXT,
    "billing_address" TEXT,
    "billing_address_display" TEXT,
    "tc_name" TEXT,
    "terms" TEXT,
    "letter_head" TEXT,
    "language" TEXT,
    "lr_date" DATE,
    "vehicle_no" TEXT,
    "mode_of_transport" TEXT,
    "gst_vehicle_type" TEXT,
    "supplier_gstin" TEXT,
    "gst_category" TEXT,
    "company_gstin" TEXT,
    "place_of_supply" TEXT,
    "gate_entry_code" TEXT,
    "gate_entry_id" TEXT,
    "custom_mode_of_transport" TEXT,
    "inspection_required_before_purchase" BOOLEAN NOT NULL DEFAULT false,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_name" TEXT,
    "description" TEXT,
    "item_group" TEXT,
    "received_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "uom" TEXT NOT NULL,
    "stock_uom" TEXT NOT NULL,
    "conversion_factor" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "received_stock_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "margin_type" TEXT,
    "margin_rate_or_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discount_percentage" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_uom_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_net_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_net_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_tax_template" TEXT,
    "item_tax_rate" TEXT,
    "valuation_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "landed_cost_voucher_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "warehouse_code" TEXT,
    "warehouse_id" TEXT,
    "rejected_warehouse" TEXT,
    "material_request" TEXT,
    "material_request_item" TEXT,
    "order_number" TEXT,
    "order_id" TEXT,
    "order_item_name" TEXT,
    "order_item_id" TEXT,
    "schedule_date" DATE,
    "quality_inspection" TEXT,
    "batch_no" TEXT,
    "serial_no" TEXT,
    "expense_account" TEXT,
    "cost_center" TEXT,
    "gst_hsn_code" TEXT,
    "gst_treatment" TEXT,
    "is_ineligible_for_itc" BOOLEAN NOT NULL DEFAULT false,
    "taxable_value" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cgst_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "bags_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "accepted_bags_no" TEXT,
    "addon_igst" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "addon_igst_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "addon_cgst" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "addon_cgst_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "addon_sgst" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "addon_sgst_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_taxes" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "category" TEXT,
    "add_deduct_tax" TEXT,
    "charge_type" TEXT,
    "row_id" TEXT,
    "included_in_print_rate" BOOLEAN NOT NULL DEFAULT false,
    "account_head" TEXT NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cost_center" TEXT,
    "account_currency" TEXT,
    "tax_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_amount_after_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_tax_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_tax_amount_after_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_wise_tax_detail" TEXT,
    "service_price" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "gst_tax_type" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_receipt_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_landed_cost_vouchers" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "company_code" TEXT NOT NULL,
    "posting_date" DATE NOT NULL,
    "total_taxes_and_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "distribute_charges_based_on" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_landed_cost_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_landed_cost_receipts" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "receipt_document_type" TEXT NOT NULL,
    "receipt_document" TEXT NOT NULL,
    "receipt_id" TEXT,
    "supplier_code" TEXT,
    "grand_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_landed_cost_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_landed_cost_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "description" TEXT,
    "receipt_document_type" TEXT NOT NULL,
    "receipt_document" TEXT NOT NULL,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "applicable_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "receipt_item_name" TEXT,
    "cost_center" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_landed_cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_landed_cost_taxes" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "expense_account" TEXT,
    "account_currency" TEXT,
    "exchange_rate" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "description" TEXT,
    "amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_landed_cost_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_material_requests" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "status" TEXT NOT NULL,
    "material_request_type" TEXT NOT NULL,
    "company_code" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "schedule_date" DATE,
    "amended_from_id" TEXT,
    "set_warehouse" TEXT,
    "tc_name" TEXT,
    "terms" TEXT,
    "per_ordered" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "per_received" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "letter_head" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_material_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_material_request_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_name" TEXT,
    "description" TEXT,
    "item_group" TEXT,
    "schedule_date" DATE,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "uom" TEXT NOT NULL,
    "stock_uom" TEXT NOT NULL,
    "conversion_factor" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "stock_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "from_warehouse" TEXT,
    "warehouse_code" TEXT,
    "warehouse_id" TEXT,
    "projected_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "actual_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "ordered_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "received_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "expense_account" TEXT,
    "cost_center" TEXT,
    "gst_hsn_code" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_material_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_stock_entries" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "stock_entry_type_code" TEXT NOT NULL,
    "stock_entry_type_id" TEXT,
    "purpose" TEXT NOT NULL,
    "work_order" TEXT,
    "company_code" TEXT NOT NULL,
    "posting_date" DATE NOT NULL,
    "posting_time" TEXT NOT NULL,
    "set_posting_time" BOOLEAN NOT NULL DEFAULT false,
    "from_bom" BOOLEAN NOT NULL DEFAULT false,
    "use_multi_level_bom" BOOLEAN NOT NULL DEFAULT false,
    "bom_no" TEXT,
    "fg_completed_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "from_warehouse" TEXT,
    "to_warehouse" TEXT,
    "total_outgoing_value" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total_incoming_value" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "value_difference" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "letter_head" TEXT,
    "is_opening" TEXT,
    "amended_from_id" TEXT,
    "material_transfer" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_stock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_stock_entry_details" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "barcode" TEXT,
    "source_warehouse_code" TEXT,
    "source_warehouse_id" TEXT,
    "target_warehouse_code" TEXT,
    "target_warehouse_id" TEXT,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_name" TEXT,
    "description" TEXT,
    "item_group" TEXT,
    "is_finished_item" BOOLEAN NOT NULL DEFAULT false,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "transfer_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "uom" TEXT NOT NULL,
    "stock_uom" TEXT NOT NULL,
    "conversion_factor" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "basic_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "valuation_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "basic_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "serial_no" TEXT,
    "batch_no" TEXT,
    "expense_account" TEXT,
    "cost_center" TEXT,
    "actual_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "bom_no" TEXT,
    "material_request" TEXT,
    "material_request_item" TEXT,
    "supplier_code" TEXT,
    "supplier_id" TEXT,
    "wo_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_stock_entry_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_stock_reconciliations" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "company_code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "posting_date" DATE NOT NULL,
    "posting_time" TEXT NOT NULL,
    "set_posting_time" BOOLEAN NOT NULL DEFAULT false,
    "set_warehouse" TEXT,
    "expense_account" TEXT,
    "difference_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cost_center" TEXT,
    "amended_from_id" TEXT,
    "supplier_code" TEXT,
    "description" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_stock_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_stock_reconciliation_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "barcode" TEXT,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_name" TEXT,
    "item_group" TEXT,
    "warehouse_code" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "valuation_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "batch_no" TEXT,
    "serial_no" TEXT,
    "current_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "current_valuation_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "current_serial_no" TEXT,
    "quantity_difference" TEXT,
    "amount_difference" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_stock_reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_delivery_notes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "status" TEXT NOT NULL,
    "amended_from_id" TEXT,
    "customer_code" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "posting_date" DATE NOT NULL,
    "posting_time" TEXT NOT NULL,
    "set_posting_time" BOOLEAN NOT NULL DEFAULT false,
    "company_code" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "conversion_rate" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "selling_price_list" TEXT,
    "price_list_currency" TEXT,
    "plc_conversion_rate" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "total_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_category" TEXT,
    "taxes_and_charges" TEXT,
    "base_total_taxes_and_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total_taxes_and_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "apply_discount_on" TEXT,
    "base_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_grand_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rounding_adjustment" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rounded_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_in_words" TEXT,
    "grand_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rounding_adjustment" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rounded_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "in_words" TEXT,
    "other_charges_calculation" TEXT,
    "customer_address" TEXT,
    "address_display" TEXT,
    "contact_person" TEXT,
    "contact_display" TEXT,
    "contact_mobile" TEXT,
    "contact_email" TEXT,
    "shipping_address_name" TEXT,
    "shipping_address" TEXT,
    "dispatch_address_name" TEXT,
    "dispatch_address" TEXT,
    "company_address" TEXT,
    "company_address_display" TEXT,
    "tc_name" TEXT,
    "terms" TEXT,
    "per_billed" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "installation_status" TEXT,
    "lr_no" TEXT,
    "lr_date" DATE,
    "vehicle_no" TEXT,
    "po_no" TEXT,
    "po_date" DATE,
    "letter_head" TEXT,
    "language" TEXT,
    "customer_group" TEXT,
    "territory" TEXT,
    "is_export_with_gst" BOOLEAN NOT NULL DEFAULT false,
    "billing_address_gstin" TEXT,
    "gst_category" TEXT,
    "place_of_supply" TEXT,
    "company_gstin" TEXT,
    "mode_of_transport" TEXT,
    "gst_vehicle_type" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_delivery_note_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_name" TEXT,
    "description" TEXT,
    "item_group" TEXT,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_uom" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "conversion_factor" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "stock_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "margin_type" TEXT,
    "margin_rate_or_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_uom_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_tax_template" TEXT,
    "base_net_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_net_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "billed_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "incoming_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "warehouse_code" TEXT,
    "warehouse_id" TEXT,
    "against_sales_order" TEXT,
    "so_detail" TEXT,
    "batch_no" TEXT,
    "serial_no" TEXT,
    "actual_batch_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "actual_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_tax_rate" TEXT,
    "packed_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "expense_account" TEXT,
    "cost_center" TEXT,
    "gst_hsn_code" TEXT,
    "gst_treatment" TEXT,
    "taxable_value" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "uom_factor" TEXT,
    "quantity" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "area_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rate_in_usd" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_delivery_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_delivery_note_taxes" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "charge_type" TEXT,
    "row_id" TEXT,
    "included_in_print_rate" BOOLEAN NOT NULL DEFAULT false,
    "account_head" TEXT NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cost_center" TEXT,
    "account_currency" TEXT,
    "tax_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_amount_after_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_tax_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_tax_amount_after_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_wise_tax_detail" TEXT,
    "gst_tax_type" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_delivery_note_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_packing_slips" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "delivery_note_code" TEXT NOT NULL,
    "delivery_note_id" TEXT,
    "from_case_no" INTEGER NOT NULL DEFAULT 0,
    "to_case_no" INTEGER NOT NULL DEFAULT 0,
    "net_weight_pkg" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "gross_weight_pkg" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "letter_head" TEXT,
    "amended_from_id" TEXT,
    "no_of_slabs" INTEGER NOT NULL DEFAULT 0,
    "net_area_sqmt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_packing_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_packing_slip_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "packing_slip_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_name" TEXT,
    "batch_no" TEXT,
    "description" TEXT,
    "qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_weight" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_uom" TEXT,
    "dn_detail" TEXT,
    "serial_no" TEXT,
    "grade" TEXT,
    "quantity" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "crate" TEXT,
    "crate_dimension" TEXT,
    "length" TEXT,
    "width" TEXT,
    "thickness" TEXT,
    "crate_weight" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_description" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_packing_slip_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_stock_ledger_entries" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "warehouse_code" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "posting_date" DATE NOT NULL,
    "posting_time" TEXT NOT NULL,
    "posting_date_time" TIMESTAMP(3) NOT NULL,
    "voucher_type" TEXT NOT NULL,
    "voucher_no" TEXT NOT NULL,
    "voucher_detail_no" TEXT,
    "dependant_sle_voucher_detail_no" TEXT,
    "recalculate_rate" BOOLEAN NOT NULL DEFAULT false,
    "actual_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "qty_after_transaction" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "incoming_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "outgoing_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "valuation_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_value" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_value_difference" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_queue" TEXT,
    "company_code" TEXT NOT NULL,
    "stock_uom" TEXT,
    "batch_no" TEXT,
    "serial_no" TEXT,
    "fiscal_year" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "purchase_stock_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bins" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "warehouse_code" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "actual_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "planned_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "indented_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "ordered_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "reserved_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "reserved_qty_for_production" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "reserved_qty_for_production_plan" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "reserved_qty_for_sub_contract" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "projected_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_uom" TEXT,
    "valuation_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_value" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_prices" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "uom" TEXT,
    "item_name" TEXT,
    "item_description" TEXT,
    "price_list_code" TEXT NOT NULL,
    "price_list_id" TEXT,
    "customer_code" TEXT,
    "supplier_code" TEXT,
    "supplier_id" TEXT,
    "buying" BOOLEAN NOT NULL DEFAULT false,
    "selling" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT,
    "price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "valid_from" DATE,
    "valid_upto" DATE,
    "reference" TEXT,
    "uom_factor" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_serial_nos" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "warehouse_code" TEXT,
    "warehouse_id" TEXT,
    "batch_no" TEXT,
    "item_name" TEXT,
    "description" TEXT,
    "item_group" TEXT,
    "purchase_document_type" TEXT,
    "purchase_document_no" TEXT,
    "purchase_date" DATE,
    "purchase_time" TEXT,
    "purchase_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "delivery_document_type" TEXT,
    "delivery_document_no" TEXT,
    "delivery_date" DATE,
    "delivery_time" TEXT,
    "customer_code" TEXT,
    "customer_name" TEXT,
    "sales_invoice" TEXT,
    "company_code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "is_scrap" BOOLEAN NOT NULL DEFAULT false,
    "length" TEXT,
    "width" TEXT,
    "weight" TEXT,
    "defects" TEXT,
    "color_code" TEXT,
    "thickness" TEXT,
    "grade" TEXT,
    "remarks" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_serial_nos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_batches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_name" TEXT,
    "manufacturing_date" DATE,
    "batch_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "stock_uom" TEXT,
    "use_batchwise_valuation" BOOLEAN NOT NULL DEFAULT false,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_quality_inspections" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "report_date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "manual_inspection" BOOLEAN NOT NULL DEFAULT false,
    "inspection_type" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_name" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_id" TEXT,
    "item_serial_no" TEXT,
    "batch_no" TEXT,
    "sample_size" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_name" TEXT,
    "description" TEXT,
    "inspected_by" TEXT,
    "verified_by" TEXT,
    "amended_from_id" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_quality_inspection_readings" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "specification" TEXT NOT NULL,
    "status" TEXT,
    "numeric" BOOLEAN NOT NULL DEFAULT false,
    "bag_weight" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_status" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_quality_inspection_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_stock_entry_types_code_key" ON "purchase_stock_entry_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_gate_entries_number_key" ON "purchase_gate_entries"("number");

-- CreateIndex
CREATE INDEX "purchase_gate_entries_order_id_idx" ON "purchase_gate_entries"("order_id");

-- CreateIndex
CREATE INDEX "purchase_gate_entries_supplier_id_idx" ON "purchase_gate_entries"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_gate_entries_gate_entry_date_idx" ON "purchase_gate_entries"("gate_entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_gate_entry_items_erpnext_name_key" ON "purchase_gate_entry_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_gate_entry_items_gate_entry_id_idx" ON "purchase_gate_entry_items"("gate_entry_id");

-- CreateIndex
CREATE INDEX "purchase_gate_entry_items_order_item_id_idx" ON "purchase_gate_entry_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_number_key" ON "purchase_receipts"("number");

-- CreateIndex
CREATE INDEX "purchase_receipts_supplier_id_idx" ON "purchase_receipts"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_posting_date_idx" ON "purchase_receipts"("posting_date");

-- CreateIndex
CREATE INDEX "purchase_receipts_status_idx" ON "purchase_receipts"("status");

-- CreateIndex
CREATE INDEX "purchase_receipts_gate_entry_id_idx" ON "purchase_receipts"("gate_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_items_erpnext_name_key" ON "purchase_receipt_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_receipt_id_idx" ON "purchase_receipt_items"("receipt_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_item_id_idx" ON "purchase_receipt_items"("item_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_order_id_idx" ON "purchase_receipt_items"("order_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_order_item_id_idx" ON "purchase_receipt_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_taxes_erpnext_name_key" ON "purchase_receipt_taxes"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_receipt_taxes_receipt_id_idx" ON "purchase_receipt_taxes"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_landed_cost_vouchers_number_key" ON "purchase_landed_cost_vouchers"("number");

-- CreateIndex
CREATE INDEX "purchase_landed_cost_vouchers_posting_date_idx" ON "purchase_landed_cost_vouchers"("posting_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_landed_cost_receipts_erpnext_name_key" ON "purchase_landed_cost_receipts"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_landed_cost_receipts_voucher_id_idx" ON "purchase_landed_cost_receipts"("voucher_id");

-- CreateIndex
CREATE INDEX "purchase_landed_cost_receipts_receipt_id_idx" ON "purchase_landed_cost_receipts"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_landed_cost_items_erpnext_name_key" ON "purchase_landed_cost_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_landed_cost_items_voucher_id_idx" ON "purchase_landed_cost_items"("voucher_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_landed_cost_taxes_erpnext_name_key" ON "purchase_landed_cost_taxes"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_landed_cost_taxes_voucher_id_idx" ON "purchase_landed_cost_taxes"("voucher_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_material_requests_number_key" ON "purchase_material_requests"("number");

-- CreateIndex
CREATE INDEX "purchase_material_requests_transaction_date_idx" ON "purchase_material_requests"("transaction_date");

-- CreateIndex
CREATE INDEX "purchase_material_requests_status_idx" ON "purchase_material_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_material_request_items_erpnext_name_key" ON "purchase_material_request_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_material_request_items_request_id_idx" ON "purchase_material_request_items"("request_id");

-- CreateIndex
CREATE INDEX "purchase_material_request_items_item_id_idx" ON "purchase_material_request_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_stock_entries_number_key" ON "purchase_stock_entries"("number");

-- CreateIndex
CREATE INDEX "purchase_stock_entries_posting_date_idx" ON "purchase_stock_entries"("posting_date");

-- CreateIndex
CREATE INDEX "purchase_stock_entries_purpose_idx" ON "purchase_stock_entries"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_stock_entry_details_erpnext_name_key" ON "purchase_stock_entry_details"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_stock_entry_details_entry_id_idx" ON "purchase_stock_entry_details"("entry_id");

-- CreateIndex
CREATE INDEX "purchase_stock_entry_details_item_id_idx" ON "purchase_stock_entry_details"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_stock_reconciliations_number_key" ON "purchase_stock_reconciliations"("number");

-- CreateIndex
CREATE INDEX "purchase_stock_reconciliations_posting_date_idx" ON "purchase_stock_reconciliations"("posting_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_stock_reconciliation_items_erpnext_name_key" ON "purchase_stock_reconciliation_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_stock_reconciliation_items_reconciliation_id_idx" ON "purchase_stock_reconciliation_items"("reconciliation_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_delivery_notes_number_key" ON "purchase_delivery_notes"("number");

-- CreateIndex
CREATE INDEX "purchase_delivery_notes_posting_date_idx" ON "purchase_delivery_notes"("posting_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_delivery_note_items_erpnext_name_key" ON "purchase_delivery_note_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_delivery_note_items_delivery_note_id_idx" ON "purchase_delivery_note_items"("delivery_note_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_delivery_note_taxes_erpnext_name_key" ON "purchase_delivery_note_taxes"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_delivery_note_taxes_delivery_note_id_idx" ON "purchase_delivery_note_taxes"("delivery_note_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_packing_slips_number_key" ON "purchase_packing_slips"("number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_packing_slip_items_erpnext_name_key" ON "purchase_packing_slip_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_packing_slip_items_packing_slip_id_idx" ON "purchase_packing_slip_items"("packing_slip_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_stock_ledger_entries_erpnext_name_key" ON "purchase_stock_ledger_entries"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_stock_ledger_entries_item_code_warehouse_code_post_idx" ON "purchase_stock_ledger_entries"("item_code", "warehouse_code", "posting_date_time");

-- CreateIndex
CREATE INDEX "purchase_stock_ledger_entries_posting_date_idx" ON "purchase_stock_ledger_entries"("posting_date");

-- CreateIndex
CREATE INDEX "purchase_stock_ledger_entries_voucher_type_voucher_no_idx" ON "purchase_stock_ledger_entries"("voucher_type", "voucher_no");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_bins_erpnext_name_key" ON "purchase_bins"("erpnext_name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_bins_item_code_warehouse_code_key" ON "purchase_bins"("item_code", "warehouse_code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_prices_erpnext_name_key" ON "purchase_item_prices"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_item_prices_item_id_idx" ON "purchase_item_prices"("item_id");

-- CreateIndex
CREATE INDEX "purchase_item_prices_price_list_id_idx" ON "purchase_item_prices"("price_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_serial_nos_code_key" ON "purchase_serial_nos"("code");

-- CreateIndex
CREATE INDEX "purchase_serial_nos_item_id_idx" ON "purchase_serial_nos"("item_id");

-- CreateIndex
CREATE INDEX "purchase_serial_nos_batch_no_idx" ON "purchase_serial_nos"("batch_no");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_batches_code_key" ON "purchase_batches"("code");

-- CreateIndex
CREATE INDEX "purchase_batches_item_id_idx" ON "purchase_batches"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quality_inspections_number_key" ON "purchase_quality_inspections"("number");

-- CreateIndex
CREATE INDEX "purchase_quality_inspections_reference_type_reference_name_idx" ON "purchase_quality_inspections"("reference_type", "reference_name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_quality_inspection_readings_erpnext_name_key" ON "purchase_quality_inspection_readings"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_quality_inspection_readings_inspection_id_idx" ON "purchase_quality_inspection_readings"("inspection_id");

-- AddForeignKey
ALTER TABLE "purchase_gate_entries" ADD CONSTRAINT "purchase_gate_entries_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_gate_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_gate_entries" ADD CONSTRAINT "purchase_gate_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_gate_entries" ADD CONSTRAINT "purchase_gate_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "purchase_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_gate_entry_items" ADD CONSTRAINT "purchase_gate_entry_items_gate_entry_id_fkey" FOREIGN KEY ("gate_entry_id") REFERENCES "purchase_gate_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_gate_entry_items" ADD CONSTRAINT "purchase_gate_entry_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_gate_entry_items" ADD CONSTRAINT "purchase_gate_entry_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_gate_entry_items" ADD CONSTRAINT "purchase_gate_entry_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "purchase_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_gate_entry_id_fkey" FOREIGN KEY ("gate_entry_id") REFERENCES "purchase_gate_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_taxes" ADD CONSTRAINT "purchase_receipt_taxes_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_landed_cost_receipts" ADD CONSTRAINT "purchase_landed_cost_receipts_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "purchase_landed_cost_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_landed_cost_receipts" ADD CONSTRAINT "purchase_landed_cost_receipts_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_landed_cost_items" ADD CONSTRAINT "purchase_landed_cost_items_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "purchase_landed_cost_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_landed_cost_items" ADD CONSTRAINT "purchase_landed_cost_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_landed_cost_taxes" ADD CONSTRAINT "purchase_landed_cost_taxes_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "purchase_landed_cost_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_material_requests" ADD CONSTRAINT "purchase_material_requests_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_material_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_material_request_items" ADD CONSTRAINT "purchase_material_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_material_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_material_request_items" ADD CONSTRAINT "purchase_material_request_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_material_request_items" ADD CONSTRAINT "purchase_material_request_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_entries" ADD CONSTRAINT "purchase_stock_entries_stock_entry_type_id_fkey" FOREIGN KEY ("stock_entry_type_id") REFERENCES "purchase_stock_entry_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_entries" ADD CONSTRAINT "purchase_stock_entries_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_stock_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_entry_details" ADD CONSTRAINT "purchase_stock_entry_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "purchase_stock_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_entry_details" ADD CONSTRAINT "purchase_stock_entry_details_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_entry_details" ADD CONSTRAINT "purchase_stock_entry_details_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_entry_details" ADD CONSTRAINT "purchase_stock_entry_details_target_warehouse_id_fkey" FOREIGN KEY ("target_warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_entry_details" ADD CONSTRAINT "purchase_stock_entry_details_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "purchase_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_reconciliations" ADD CONSTRAINT "purchase_stock_reconciliations_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_stock_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_reconciliation_items" ADD CONSTRAINT "purchase_stock_reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "purchase_stock_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_reconciliation_items" ADD CONSTRAINT "purchase_stock_reconciliation_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_reconciliation_items" ADD CONSTRAINT "purchase_stock_reconciliation_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_delivery_notes" ADD CONSTRAINT "purchase_delivery_notes_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_delivery_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_delivery_notes" ADD CONSTRAINT "purchase_delivery_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "purchase_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_delivery_note_items" ADD CONSTRAINT "purchase_delivery_note_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "purchase_delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_delivery_note_items" ADD CONSTRAINT "purchase_delivery_note_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_delivery_note_items" ADD CONSTRAINT "purchase_delivery_note_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_delivery_note_taxes" ADD CONSTRAINT "purchase_delivery_note_taxes_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "purchase_delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_packing_slips" ADD CONSTRAINT "purchase_packing_slips_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "purchase_delivery_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_packing_slips" ADD CONSTRAINT "purchase_packing_slips_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_packing_slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_packing_slip_items" ADD CONSTRAINT "purchase_packing_slip_items_packing_slip_id_fkey" FOREIGN KEY ("packing_slip_id") REFERENCES "purchase_packing_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_packing_slip_items" ADD CONSTRAINT "purchase_packing_slip_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_ledger_entries" ADD CONSTRAINT "purchase_stock_ledger_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stock_ledger_entries" ADD CONSTRAINT "purchase_stock_ledger_entries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bins" ADD CONSTRAINT "purchase_bins_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bins" ADD CONSTRAINT "purchase_bins_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_prices" ADD CONSTRAINT "purchase_item_prices_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_prices" ADD CONSTRAINT "purchase_item_prices_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "purchase_price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_prices" ADD CONSTRAINT "purchase_item_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "purchase_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_serial_nos" ADD CONSTRAINT "purchase_serial_nos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_serial_nos" ADD CONSTRAINT "purchase_serial_nos_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_batches" ADD CONSTRAINT "purchase_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quality_inspections" ADD CONSTRAINT "purchase_quality_inspections_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quality_inspections" ADD CONSTRAINT "purchase_quality_inspections_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quality_inspection_readings" ADD CONSTRAINT "purchase_quality_inspection_readings_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "purchase_quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
