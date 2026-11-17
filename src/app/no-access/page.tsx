import type { Metadata } from "next";
import { signOutAction } from "@/app/login/actions";

export const metadata: Metadata = { title: "No access" };

// STANDALONE ONLY — where a signed-in login without a Purchase role lands
// (lib/purchase/server/page.ts). At the merge the Main ERP's /no-access serves.
export default function NoAccessPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="po-card max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-pacific-dark">No access</h1>
        <p className="mt-2 text-sm text-gray-600">This login does not have access to the Purchase module. Ask an admin to give it a role.</p>
        <form action={signOutAction} className="mt-4">
          <button type="submit" className="po-btn-secondary">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
