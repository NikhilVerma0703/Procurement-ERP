import type { Metadata, Viewport } from "next";
import { StandaloneSidebar } from "@/components/standalone/Sidebar";
import "./globals.css";

// STANDALONE ONLY. This root layout and components/standalone/ are the app's
// own frame while it runs on its own. At the merge they are left behind: the
// Main ERP's root layout and <Shell> (sidebar, user card, sign-out) take their
// place, and the Purchase module mounts under it at /purchase unchanged.

export const metadata: Metadata = {
  title: { default: "PO Management ERP", template: "%s · PO Management ERP" },
  description: "Purchase Orders — Pacific Engineered Surfaces",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#112732",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <StandaloneSidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
