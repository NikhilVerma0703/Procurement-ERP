import { Toaster } from "sonner";

// Every page of the module, and the server actions it runs (Save, Approve, the list's bulk actions,
// Email with the sheet attached), gets the Main ERP's longest function time on Vercel. The bulk
// actions also send a large selection in turns (orders/selection.ts, BULK_BATCH), so each request
// stays far inside it.
export const maxDuration = 60;

/**
 * Purchase module shell.
 *
 * `purchase-root` scopes the module's few base rules (globals.css, "Purchase
 * module"). The Toaster draws the screens' save and error notices; it is
 * mounted here, not in the app's root layout, because at the merge this
 * layout is what moves into the Main ERP (as app/pigment/layout.tsx did for
 * Pigment) — there it gains the ERP's <Shell> and the module gate around it.
 */
export default function PurchaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="purchase-root">
      {children}
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
