/*
  Warnings:

  - The `shipment_type` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `mode_of_transport` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `purpose_of_purchase` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "purchase_order_payment_schedules" ADD COLUMN     "payment_term_name" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" DROP COLUMN "shipment_type",
ADD COLUMN     "shipment_type" TEXT,
DROP COLUMN "mode_of_transport",
ADD COLUMN     "mode_of_transport" TEXT DEFAULT 'Road',
DROP COLUMN "purpose_of_purchase",
ADD COLUMN     "purpose_of_purchase" TEXT;

-- AlterTable
ALTER TABLE "purchase_payment_terms_template_rows" ADD COLUMN     "payment_term_name" TEXT;

-- DropEnum
DROP TYPE "purchase_mode_of_transport";

-- DropEnum
DROP TYPE "purchase_purpose";

-- DropEnum
DROP TYPE "purchase_shipment_type";
