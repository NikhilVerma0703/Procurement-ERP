import { redirect } from "next/navigation";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";

// STANDALONE ONLY: the app has one module, so its home is the module's home.
export default function Home() {
  redirect(PURCHASE_PATHS.orders);
}
