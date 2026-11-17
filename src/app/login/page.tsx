import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { currentUser } from "@/lib/purchase/server/current-user";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

// STANDALONE ONLY — the sign-in page of the app while it runs on its own.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  if (await currentUser()) redirect(PURCHASE_PATHS.orders);
  const { callbackUrl = "" } = await searchParams;
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="po-card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pacific-dark shadow-sm">
            <ShoppingCart className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-pacific-dark">Procurement ERP</div>
            <div className="text-xs text-gray-500">Pacific Engineered Surfaces</div>
          </div>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
