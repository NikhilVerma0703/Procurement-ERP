import { redirect } from "next/navigation";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";

// The module's root opens the Purchase Order list, as Buying → Purchase Order
// did in the original ERPNext site.
export default function PurchaseHome() {
  redirect(PURCHASE_PATHS.orders);
}
