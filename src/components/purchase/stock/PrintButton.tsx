"use client";

// The print view's Print button: the browser's own print of the sheet (the page's chrome is print:hidden).
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" className="po-btn-primary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden /> Print
    </button>
  );
}
