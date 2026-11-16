-- CreateEnum
CREATE TYPE "purchase_doc_status" AS ENUM ('Draft', 'Submitted', 'Cancelled');

-- CreateEnum
CREATE TYPE "purchase_workflow_state" AS ENUM ('Created', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "purchase_order_status" AS ENUM ('Draft', 'On Hold', 'To Receive and Bill', 'To Bill', 'To Receive', 'Completed', 'Cancelled', 'Closed', 'Delivered');

-- CreateEnum
CREATE TYPE "purchase_shipment_type" AS ENUM ('Domestic', 'Import');

-- CreateEnum
CREATE TYPE "purchase_mode_of_transport" AS ENUM ('Road', 'Air', 'Rail', 'Ship');

-- CreateEnum
CREATE TYPE "purchase_purpose" AS ENUM ('General', 'Domestic', 'Exports');

-- CreateEnum
CREATE TYPE "purchase_apply_discount_on" AS ENUM ('Grand Total', 'Net Total');

-- CreateEnum
CREATE TYPE "purchase_tax_charge_type" AS ENUM ('Actual', 'On Net Total', 'On Previous Row Amount', 'On Previous Row Total', 'On Item Quantity');

-- CreateEnum
CREATE TYPE "purchase_tax_consider_for" AS ENUM ('Total', 'Valuation', 'Valuation and Total');

-- CreateEnum
CREATE TYPE "purchase_tax_add_deduct" AS ENUM ('Add', 'Deduct');

-- CreateEnum
CREATE TYPE "purchase_margin_type" AS ENUM ('Percentage', 'Amount');

-- CreateEnum
CREATE TYPE "purchase_order_event_kind" AS ENUM ('Version', 'Workflow', 'Label', 'Comment', 'Attachment', 'Email', 'Deleted', 'Info');

-- CreateTable
CREATE TABLE "purchase_companies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "abbr" TEXT NOT NULL,
    "country" TEXT,
    "default_currency" TEXT,
    "tax_id" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_currencies" (
    "code" TEXT NOT NULL,
    "symbol" TEXT,
    "fraction" TEXT,
    "fraction_units" INTEGER,
    "smallest_currency_fraction_value" DECIMAL(21,9),
    "number_format" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "purchase_currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "purchase_currency_exchanges" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "from_currency" TEXT NOT NULL,
    "to_currency" TEXT NOT NULL,
    "exchange_rate" DECIMAL(21,9) NOT NULL,
    "for_buying" BOOLEAN NOT NULL DEFAULT true,
    "for_selling" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "purchase_currency_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_uoms" (
    "name" TEXT NOT NULL,
    "must_be_whole_number" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "purchase_uoms_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "purchase_price_lists" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "buying" BOOLEAN NOT NULL DEFAULT false,
    "selling" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "legacy" JSONB,

    CONSTRAINT "purchase_price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_tax_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_tax_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT,
    "parent_code" TEXT,
    "root_type" TEXT,
    "account_type" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "account_currency" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "company_id" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_cost_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cost_center_name" TEXT NOT NULL,
    "parent_code" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "company_id" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "parent_code" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "company_id" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_letter_heads" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT,
    "image" TEXT,
    "content" TEXT,
    "footer" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_letter_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_naming_series" (
    "prefix" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_naming_series_pkey" PRIMARY KEY ("prefix")
);

-- CreateTable
CREATE TABLE "purchase_tax_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "company_id" TEXT,
    "tax_category_id" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_tax_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_tax_template_rows" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "template_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "category" "purchase_tax_consider_for" NOT NULL DEFAULT 'Total',
    "add_deduct_tax" "purchase_tax_add_deduct" NOT NULL DEFAULT 'Add',
    "charge_type" "purchase_tax_charge_type" NOT NULL,
    "row_id" INTEGER,
    "account_head_id" TEXT NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "included_in_print_rate" BOOLEAN NOT NULL DEFAULT false,
    "gst_tax_type" TEXT,

    CONSTRAINT "purchase_tax_template_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_tax_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "gst_treatment" TEXT,
    "gst_rate" DECIMAL(21,9),
    "company_id" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_item_tax_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_tax_template_rates" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "template_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "account_id" TEXT NOT NULL,
    "tax_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_item_tax_template_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payment_terms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "invoice_portion" DECIMAL(21,9),
    "mode_of_payment" TEXT,
    "due_date_based_on" TEXT,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "credit_months" INTEGER NOT NULL DEFAULT 0,
    "discount_type" TEXT,
    "discount" DECIMAL(21,9),
    "discount_validity_based_on" TEXT,
    "discount_validity" INTEGER NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payment_terms_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "allocate_payment_based_on_payment_terms" BOOLEAN NOT NULL DEFAULT false,
    "legacy" JSONB,

    CONSTRAINT "purchase_payment_terms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payment_terms_template_rows" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "template_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "payment_term_id" TEXT,
    "description" TEXT,
    "invoice_portion" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "mode_of_payment" TEXT,
    "due_date_based_on" TEXT,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "credit_months" INTEGER NOT NULL DEFAULT 0,
    "discount_type" TEXT,
    "discount" DECIMAL(21,9),
    "discount_validity_based_on" TEXT,
    "discount_validity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_payment_terms_template_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_terms_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "terms" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "buying" BOOLEAN NOT NULL DEFAULT true,
    "selling" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "purchase_terms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_supplier_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_code" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_supplier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "naming_series" TEXT,
    "supplier_group_id" TEXT,
    "supplier_type" TEXT,
    "country" TEXT,
    "default_currency" TEXT,
    "default_price_list_id" TEXT,
    "payment_terms_template_id" TEXT,
    "language" TEXT,
    "tax_id" TEXT,
    "tax_category_id" TEXT,
    "tax_withholding_category" TEXT,
    "primary_contact_id" TEXT,
    "mobile_no" TEXT,
    "email_id" TEXT,
    "primary_address_id" TEXT,
    "primary_address" TEXT,
    "pan" TEXT,
    "gstin" TEXT,
    "gst_category" TEXT,
    "is_transporter" BOOLEAN NOT NULL DEFAULT false,
    "is_internal_supplier" BOOLEAN NOT NULL DEFAULT false,
    "is_frozen" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "on_hold" BOOLEAN NOT NULL DEFAULT false,
    "hold_type" TEXT,
    "release_date" DATE,
    "warn_pos" BOOLEAN NOT NULL DEFAULT false,
    "prevent_pos" BOOLEAN NOT NULL DEFAULT false,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_customers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_type" TEXT,
    "customer_group" TEXT,
    "territory" TEXT,
    "gstin" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "legacy" JSONB,

    CONSTRAINT "purchase_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_addresses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address_title" TEXT,
    "address_type" TEXT,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "pincode" TEXT,
    "email_id" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "is_primary_address" BOOLEAN NOT NULL DEFAULT false,
    "is_shipping_address" BOOLEAN NOT NULL DEFAULT false,
    "is_your_company_address" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "tax_category" TEXT,
    "gstin" TEXT,
    "gst_state" TEXT,
    "gst_state_number" TEXT,
    "gst_category" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_address_links" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "address_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "link_doctype" TEXT NOT NULL,
    "link_name" TEXT NOT NULL,
    "link_title" TEXT,
    "supplier_id" TEXT,
    "customer_id" TEXT,
    "company_id" TEXT,

    CONSTRAINT "purchase_address_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_contacts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "salutation" TEXT,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT,
    "designation" TEXT,
    "gender" TEXT,
    "email_id" TEXT,
    "phone" TEXT,
    "mobile_no" TEXT,
    "company_name" TEXT,
    "status" TEXT,
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "is_billing_contact" BOOLEAN NOT NULL DEFAULT false,
    "user_email" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_contact_emails" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "contact_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "email_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_contact_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_contact_phones" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "contact_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "phone" TEXT NOT NULL,
    "is_primary_phone" BOOLEAN NOT NULL DEFAULT false,
    "is_primary_mobile_no" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_contact_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_contact_links" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "contact_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "link_doctype" TEXT NOT NULL,
    "link_name" TEXT NOT NULL,
    "link_title" TEXT,
    "supplier_id" TEXT,
    "customer_id" TEXT,
    "company_id" TEXT,

    CONSTRAINT "purchase_contact_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_code" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_item_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_group_id" TEXT,
    "stock_uom" TEXT NOT NULL,
    "purchase_uom" TEXT,
    "description" TEXT,
    "image" TEXT,
    "brand" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "is_stock_item" BOOLEAN NOT NULL DEFAULT true,
    "is_purchase_item" BOOLEAN NOT NULL DEFAULT true,
    "is_fixed_asset" BOOLEAN NOT NULL DEFAULT false,
    "has_variants" BOOLEAN NOT NULL DEFAULT false,
    "variant_of_id" TEXT,
    "has_batch_no" BOOLEAN NOT NULL DEFAULT false,
    "has_serial_no" BOOLEAN NOT NULL DEFAULT false,
    "service_item" BOOLEAN NOT NULL DEFAULT false,
    "gst_hsn_code" TEXT,
    "is_ineligible_for_itc" BOOLEAN NOT NULL DEFAULT false,
    "last_purchase_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "standard_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "valuation_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "min_order_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "safety_stock" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "weight_per_unit" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "weight_uom" TEXT,
    "country_of_origin" TEXT,
    "end_of_life" DATE,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_uom_conversions" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "item_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "uom" TEXT NOT NULL,
    "conversion_factor" DECIMAL(21,9) NOT NULL,

    CONSTRAINT "purchase_item_uom_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_defaults" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "item_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "company_id" TEXT NOT NULL,
    "default_warehouse_id" TEXT,
    "expense_account_id" TEXT,
    "buying_cost_center_id" TEXT,
    "default_supplier" TEXT,
    "default_price_list" TEXT,

    CONSTRAINT "purchase_item_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_item_taxes" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "item_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 1,
    "item_tax_template_id" TEXT NOT NULL,
    "tax_category_id" TEXT,
    "valid_from" DATE,
    "minimum_net_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "maximum_net_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_item_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "naming_series" TEXT NOT NULL,
    "doc_status" "purchase_doc_status" NOT NULL DEFAULT 'Draft',
    "workflow_state" "purchase_workflow_state" NOT NULL DEFAULT 'Created',
    "status" "purchase_order_status" NOT NULL DEFAULT 'Draft',
    "amended_from_id" TEXT,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "order_confirmation_no" TEXT,
    "order_confirmation_date" DATE,
    "shipment_type" "purchase_shipment_type",
    "mode_of_transport" "purchase_mode_of_transport" DEFAULT 'Road',
    "transaction_date" DATE NOT NULL,
    "schedule_date" DATE,
    "purpose_of_purchase" "purchase_purpose",
    "company_id" TEXT NOT NULL,
    "apply_tds" BOOLEAN NOT NULL DEFAULT false,
    "tax_withholding_category" TEXT,
    "is_reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "is_subcontracted" BOOLEAN NOT NULL DEFAULT false,
    "supplier_warehouse" TEXT,
    "proforma_invoice_no" TEXT,
    "proforma_invoice_date" DATE,
    "cost_center_id" TEXT,
    "project" TEXT,
    "currency" TEXT NOT NULL,
    "conversion_rate" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "buying_price_list_id" TEXT,
    "price_list_currency" TEXT,
    "plc_conversion_rate" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "ignore_pricing_rule" BOOLEAN NOT NULL DEFAULT false,
    "set_from_warehouse" TEXT,
    "set_warehouse_id" TEXT,
    "set_reserve_warehouse" TEXT,
    "total_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total_net_weight" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_withholding_net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_tax_withholding_net_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_category_id" TEXT,
    "taxes_and_charges_id" TEXT,
    "shipping_rule" TEXT,
    "incoterm" TEXT,
    "named_place" TEXT,
    "base_taxes_and_charges_added" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_taxes_and_charges_deducted" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total_taxes_and_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "taxes_and_charges_added" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "taxes_and_charges_deducted" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total_taxes_and_charges" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_grand_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rounding_adjustment" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rounded_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_in_words" TEXT,
    "grand_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rounding_adjustment" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rounded_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "disable_rounded_total" BOOLEAN NOT NULL DEFAULT false,
    "in_words" TEXT,
    "advance_paid" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "apply_discount_on" "purchase_apply_discount_on" NOT NULL DEFAULT 'Grand Total',
    "base_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "additional_discount_percentage" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "other_charges_calculation" TEXT,
    "gst_breakup_table" TEXT,
    "supplier_address_id" TEXT,
    "address_display" TEXT,
    "supplier_gstin" TEXT,
    "gst_category" TEXT,
    "contact_person_id" TEXT,
    "contact_display" TEXT,
    "contact_mobile" TEXT,
    "contact_email" TEXT,
    "shipping_address_id" TEXT,
    "shipping_address_display" TEXT,
    "billing_address_id" TEXT,
    "billing_address_display" TEXT,
    "company_gstin" TEXT,
    "place_of_supply" TEXT,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "customer_contact_person_id" TEXT,
    "customer_contact_display" TEXT,
    "customer_contact_mobile" TEXT,
    "customer_contact_email" TEXT,
    "payment_terms_template_id" TEXT,
    "terms_template_id" TEXT,
    "terms" TEXT,
    "per_billed" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "per_received" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "letter_head_id" TEXT,
    "group_same_items" BOOLEAN NOT NULL DEFAULT false,
    "select_print_heading" TEXT,
    "language" TEXT,
    "from_date" DATE,
    "to_date" DATE,
    "auto_repeat" TEXT,
    "is_internal_supplier" BOOLEAN NOT NULL DEFAULT false,
    "represents_company" TEXT,
    "party_account_currency" TEXT,
    "legacy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "order_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_group" TEXT,
    "description" TEXT,
    "image" TEXT,
    "brand" TEXT,
    "supplier_part_no" TEXT,
    "gst_hsn_code" TEXT,
    "is_ineligible_for_itc" BOOLEAN NOT NULL DEFAULT false,
    "schedule_date" DATE,
    "expected_delivery_date" DATE,
    "qty" DECIMAL(21,9) NOT NULL,
    "uom" TEXT NOT NULL,
    "stock_uom" TEXT NOT NULL,
    "conversion_factor" DECIMAL(21,9) NOT NULL DEFAULT 1,
    "stock_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_price_list_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "last_purchase_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "margin_type" "purchase_margin_type",
    "margin_rate_or_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "rate_with_margin" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_rate_with_margin" DECIMAL(21,9) NOT NULL DEFAULT 0,
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
    "is_free_item" BOOLEAN NOT NULL DEFAULT false,
    "pricing_rules" TEXT,
    "item_tax_template_id" TEXT,
    "item_tax_rate" JSONB,
    "apply_tds" BOOLEAN NOT NULL DEFAULT true,
    "gst_treatment" TEXT,
    "taxable_value" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cgst_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cess_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cess_non_advol_rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cess_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cess_non_advol_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "sgst_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cgst_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "igst_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "warehouse_id" TEXT,
    "from_warehouse" TEXT,
    "actual_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "company_total_stock" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "expense_account_id" TEXT,
    "cost_center_id" TEXT,
    "project" TEXT,
    "material_request" TEXT,
    "material_request_item" TEXT,
    "sales_order" TEXT,
    "sales_order_item" TEXT,
    "supplier_quotation" TEXT,
    "supplier_quotation_item" TEXT,
    "delivered_by_supplier" BOOLEAN NOT NULL DEFAULT false,
    "blanket_order" TEXT,
    "received_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "returned_qty" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "billed_amt" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "manufacturer" TEXT,
    "manufacturer_part_no" TEXT,
    "bom" TEXT,
    "weight_per_unit" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total_weight" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "weight_uom" TEXT,
    "is_fixed_asset" BOOLEAN NOT NULL DEFAULT false,
    "page_break" BOOLEAN NOT NULL DEFAULT false,
    "legacy" JSONB,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_taxes" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "order_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "category" "purchase_tax_consider_for" NOT NULL DEFAULT 'Total',
    "add_deduct_tax" "purchase_tax_add_deduct" NOT NULL DEFAULT 'Add',
    "charge_type" "purchase_tax_charge_type" NOT NULL,
    "row_id" INTEGER,
    "included_in_print_rate" BOOLEAN NOT NULL DEFAULT false,
    "included_in_paid_amount" BOOLEAN NOT NULL DEFAULT false,
    "account_head_id" TEXT NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "cost_center_id" TEXT,
    "account_currency" TEXT,
    "tax_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "tax_amount_after_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_tax_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_total" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_tax_amount_after_discount_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "item_wise_tax_detail" JSONB,
    "service_price" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "gst_tax_type" TEXT,
    "legacy" JSONB,

    CONSTRAINT "purchase_order_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_cost_overheads" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "order_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "service_item_id" TEXT,
    "service_charges" DECIMAL(21,9),
    "account_head_id" TEXT,
    "charge_type" TEXT NOT NULL DEFAULT 'Actual',
    "legacy" JSONB,

    CONSTRAINT "purchase_order_cost_overheads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_payment_schedules" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "order_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "payment_term_id" TEXT,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "mode_of_payment" TEXT,
    "invoice_portion" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discount_type" TEXT,
    "discount_date" DATE,
    "discount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "payment_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "outstanding" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "discounted_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "base_payment_amount" DECIMAL(21,9) NOT NULL DEFAULT 0,
    "due_date_based_on" TEXT,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "credit_months" INTEGER NOT NULL DEFAULT 0,
    "discount_validity_based_on" TEXT,
    "discount_validity" INTEGER NOT NULL DEFAULT 0,
    "legacy" JSONB,

    CONSTRAINT "purchase_order_payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_links" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_name" TEXT NOT NULL,
    "doc_date" DATE,
    "doc_status" TEXT,
    "detail" JSONB,

    CONSTRAINT "purchase_order_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_events" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "source" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" TEXT NOT NULL,
    "kind" "purchase_order_event_kind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "by_email" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "data" JSONB,

    CONSTRAINT "purchase_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_attachments" (
    "id" TEXT NOT NULL,
    "erpnext_name" TEXT,
    "order_id" TEXT,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "file_size" INTEGER,
    "content_hash" TEXT,
    "storage_path" TEXT,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_users" (
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "full_name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "user_type" TEXT,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "legacy" JSONB,

    CONSTRAINT "purchase_users_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "purchase_import_runs" (
    "id" TEXT NOT NULL,
    "source_file" TEXT NOT NULL,
    "source_sha256" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "counts" JSONB,
    "report" JSONB,

    CONSTRAINT "purchase_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_companies_code_key" ON "purchase_companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_currency_exchanges_code_key" ON "purchase_currency_exchanges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_price_lists_code_key" ON "purchase_price_lists"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_tax_categories_code_key" ON "purchase_tax_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_accounts_code_key" ON "purchase_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_cost_centers_code_key" ON "purchase_cost_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_warehouses_code_key" ON "purchase_warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_letter_heads_code_key" ON "purchase_letter_heads"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_tax_templates_code_key" ON "purchase_tax_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_tax_template_rows_erpnext_name_key" ON "purchase_tax_template_rows"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_tax_template_rows_template_id_idx" ON "purchase_tax_template_rows"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_tax_templates_code_key" ON "purchase_item_tax_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_tax_template_rates_erpnext_name_key" ON "purchase_item_tax_template_rates"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_item_tax_template_rates_template_id_idx" ON "purchase_item_tax_template_rates"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_payment_terms_code_key" ON "purchase_payment_terms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_payment_terms_templates_code_key" ON "purchase_payment_terms_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_payment_terms_template_rows_erpnext_name_key" ON "purchase_payment_terms_template_rows"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_payment_terms_template_rows_template_id_idx" ON "purchase_payment_terms_template_rows"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_terms_templates_code_key" ON "purchase_terms_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_supplier_groups_code_key" ON "purchase_supplier_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_suppliers_code_key" ON "purchase_suppliers"("code");

-- CreateIndex
CREATE INDEX "purchase_suppliers_supplier_name_idx" ON "purchase_suppliers"("supplier_name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_customers_code_key" ON "purchase_customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_addresses_code_key" ON "purchase_addresses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_address_links_erpnext_name_key" ON "purchase_address_links"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_address_links_address_id_idx" ON "purchase_address_links"("address_id");

-- CreateIndex
CREATE INDEX "purchase_address_links_supplier_id_idx" ON "purchase_address_links"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_contacts_code_key" ON "purchase_contacts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_contact_emails_erpnext_name_key" ON "purchase_contact_emails"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_contact_emails_contact_id_idx" ON "purchase_contact_emails"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_contact_phones_erpnext_name_key" ON "purchase_contact_phones"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_contact_phones_contact_id_idx" ON "purchase_contact_phones"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_contact_links_erpnext_name_key" ON "purchase_contact_links"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_contact_links_contact_id_idx" ON "purchase_contact_links"("contact_id");

-- CreateIndex
CREATE INDEX "purchase_contact_links_supplier_id_idx" ON "purchase_contact_links"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_groups_code_key" ON "purchase_item_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_code_key" ON "purchase_items"("code");

-- CreateIndex
CREATE INDEX "purchase_items_item_name_idx" ON "purchase_items"("item_name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_uom_conversions_erpnext_name_key" ON "purchase_item_uom_conversions"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_item_uom_conversions_item_id_idx" ON "purchase_item_uom_conversions"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_defaults_erpnext_name_key" ON "purchase_item_defaults"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_item_defaults_item_id_idx" ON "purchase_item_defaults"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_item_taxes_erpnext_name_key" ON "purchase_item_taxes"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_item_taxes_item_id_idx" ON "purchase_item_taxes"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_transaction_date_idx" ON "purchase_orders"("transaction_date");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_workflow_state_idx" ON "purchase_orders"("workflow_state");

-- CreateIndex
CREATE INDEX "purchase_orders_created_at_idx" ON "purchase_orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_erpnext_name_key" ON "purchase_order_items"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_order_items_order_id_idx" ON "purchase_order_items"("order_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_item_id_idx" ON "purchase_order_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_taxes_erpnext_name_key" ON "purchase_order_taxes"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_order_taxes_order_id_idx" ON "purchase_order_taxes"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_cost_overheads_erpnext_name_key" ON "purchase_order_cost_overheads"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_order_cost_overheads_order_id_idx" ON "purchase_order_cost_overheads"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_payment_schedules_erpnext_name_key" ON "purchase_order_payment_schedules"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_order_payment_schedules_order_id_idx" ON "purchase_order_payment_schedules"("order_id");

-- CreateIndex
CREATE INDEX "purchase_order_links_doc_type_doc_name_idx" ON "purchase_order_links"("doc_type", "doc_name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_links_order_id_doc_type_doc_name_key" ON "purchase_order_links"("order_id", "doc_type", "doc_name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_events_erpnext_name_key" ON "purchase_order_events"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_order_events_order_id_at_idx" ON "purchase_order_events"("order_id", "at");

-- CreateIndex
CREATE INDEX "purchase_order_events_order_number_idx" ON "purchase_order_events"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_attachments_erpnext_name_key" ON "purchase_attachments"("erpnext_name");

-- CreateIndex
CREATE INDEX "purchase_attachments_order_id_idx" ON "purchase_attachments"("order_id");

-- AddForeignKey
ALTER TABLE "purchase_currency_exchanges" ADD CONSTRAINT "purchase_currency_exchanges_from_currency_fkey" FOREIGN KEY ("from_currency") REFERENCES "purchase_currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_currency_exchanges" ADD CONSTRAINT "purchase_currency_exchanges_to_currency_fkey" FOREIGN KEY ("to_currency") REFERENCES "purchase_currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_price_lists" ADD CONSTRAINT "purchase_price_lists_currency_fkey" FOREIGN KEY ("currency") REFERENCES "purchase_currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_accounts" ADD CONSTRAINT "purchase_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_cost_centers" ADD CONSTRAINT "purchase_cost_centers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_warehouses" ADD CONSTRAINT "purchase_warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_tax_templates" ADD CONSTRAINT "purchase_tax_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_tax_templates" ADD CONSTRAINT "purchase_tax_templates_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "purchase_tax_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_tax_template_rows" ADD CONSTRAINT "purchase_tax_template_rows_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "purchase_tax_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_tax_template_rows" ADD CONSTRAINT "purchase_tax_template_rows_account_head_id_fkey" FOREIGN KEY ("account_head_id") REFERENCES "purchase_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_tax_templates" ADD CONSTRAINT "purchase_item_tax_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_tax_template_rates" ADD CONSTRAINT "purchase_item_tax_template_rates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "purchase_item_tax_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_tax_template_rates" ADD CONSTRAINT "purchase_item_tax_template_rates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "purchase_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment_terms_template_rows" ADD CONSTRAINT "purchase_payment_terms_template_rows_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "purchase_payment_terms_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment_terms_template_rows" ADD CONSTRAINT "purchase_payment_terms_template_rows_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "purchase_payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suppliers" ADD CONSTRAINT "purchase_suppliers_supplier_group_id_fkey" FOREIGN KEY ("supplier_group_id") REFERENCES "purchase_supplier_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suppliers" ADD CONSTRAINT "purchase_suppliers_default_price_list_id_fkey" FOREIGN KEY ("default_price_list_id") REFERENCES "purchase_price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suppliers" ADD CONSTRAINT "purchase_suppliers_payment_terms_template_id_fkey" FOREIGN KEY ("payment_terms_template_id") REFERENCES "purchase_payment_terms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suppliers" ADD CONSTRAINT "purchase_suppliers_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "purchase_tax_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suppliers" ADD CONSTRAINT "purchase_suppliers_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "purchase_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suppliers" ADD CONSTRAINT "purchase_suppliers_primary_address_id_fkey" FOREIGN KEY ("primary_address_id") REFERENCES "purchase_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_address_links" ADD CONSTRAINT "purchase_address_links_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "purchase_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_address_links" ADD CONSTRAINT "purchase_address_links_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "purchase_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_address_links" ADD CONSTRAINT "purchase_address_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "purchase_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_address_links" ADD CONSTRAINT "purchase_address_links_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_contact_emails" ADD CONSTRAINT "purchase_contact_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "purchase_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_contact_phones" ADD CONSTRAINT "purchase_contact_phones_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "purchase_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_contact_links" ADD CONSTRAINT "purchase_contact_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "purchase_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_contact_links" ADD CONSTRAINT "purchase_contact_links_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "purchase_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_contact_links" ADD CONSTRAINT "purchase_contact_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "purchase_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_contact_links" ADD CONSTRAINT "purchase_contact_links_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_item_group_id_fkey" FOREIGN KEY ("item_group_id") REFERENCES "purchase_item_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_stock_uom_fkey" FOREIGN KEY ("stock_uom") REFERENCES "purchase_uoms"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_uom_fkey" FOREIGN KEY ("purchase_uom") REFERENCES "purchase_uoms"("name") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variant_of_id_fkey" FOREIGN KEY ("variant_of_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_uom_conversions" ADD CONSTRAINT "purchase_item_uom_conversions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_uom_conversions" ADD CONSTRAINT "purchase_item_uom_conversions_uom_fkey" FOREIGN KEY ("uom") REFERENCES "purchase_uoms"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_defaults" ADD CONSTRAINT "purchase_item_defaults_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_defaults" ADD CONSTRAINT "purchase_item_defaults_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_defaults" ADD CONSTRAINT "purchase_item_defaults_default_warehouse_id_fkey" FOREIGN KEY ("default_warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_defaults" ADD CONSTRAINT "purchase_item_defaults_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "purchase_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_defaults" ADD CONSTRAINT "purchase_item_defaults_buying_cost_center_id_fkey" FOREIGN KEY ("buying_cost_center_id") REFERENCES "purchase_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_taxes" ADD CONSTRAINT "purchase_item_taxes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_taxes" ADD CONSTRAINT "purchase_item_taxes_item_tax_template_id_fkey" FOREIGN KEY ("item_tax_template_id") REFERENCES "purchase_item_tax_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_item_taxes" ADD CONSTRAINT "purchase_item_taxes_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "purchase_tax_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "purchase_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "purchase_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "purchase_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_fkey" FOREIGN KEY ("currency") REFERENCES "purchase_currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_buying_price_list_id_fkey" FOREIGN KEY ("buying_price_list_id") REFERENCES "purchase_price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_set_warehouse_id_fkey" FOREIGN KEY ("set_warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "purchase_tax_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_taxes_and_charges_id_fkey" FOREIGN KEY ("taxes_and_charges_id") REFERENCES "purchase_tax_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_address_id_fkey" FOREIGN KEY ("supplier_address_id") REFERENCES "purchase_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "purchase_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "purchase_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_billing_address_id_fkey" FOREIGN KEY ("billing_address_id") REFERENCES "purchase_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "purchase_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_contact_person_id_fkey" FOREIGN KEY ("customer_contact_person_id") REFERENCES "purchase_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_payment_terms_template_id_fkey" FOREIGN KEY ("payment_terms_template_id") REFERENCES "purchase_payment_terms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_terms_template_id_fkey" FOREIGN KEY ("terms_template_id") REFERENCES "purchase_terms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_letter_head_id_fkey" FOREIGN KEY ("letter_head_id") REFERENCES "purchase_letter_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_uom_fkey" FOREIGN KEY ("uom") REFERENCES "purchase_uoms"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_stock_uom_fkey" FOREIGN KEY ("stock_uom") REFERENCES "purchase_uoms"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_tax_template_id_fkey" FOREIGN KEY ("item_tax_template_id") REFERENCES "purchase_item_tax_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "purchase_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "purchase_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "purchase_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_taxes" ADD CONSTRAINT "purchase_order_taxes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_taxes" ADD CONSTRAINT "purchase_order_taxes_account_head_id_fkey" FOREIGN KEY ("account_head_id") REFERENCES "purchase_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_taxes" ADD CONSTRAINT "purchase_order_taxes_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "purchase_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_cost_overheads" ADD CONSTRAINT "purchase_order_cost_overheads_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_cost_overheads" ADD CONSTRAINT "purchase_order_cost_overheads_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_cost_overheads" ADD CONSTRAINT "purchase_order_cost_overheads_account_head_id_fkey" FOREIGN KEY ("account_head_id") REFERENCES "purchase_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_payment_schedules" ADD CONSTRAINT "purchase_order_payment_schedules_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_payment_schedules" ADD CONSTRAINT "purchase_order_payment_schedules_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "purchase_payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_links" ADD CONSTRAINT "purchase_order_links_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
