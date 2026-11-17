"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, LogOut, Menu, ShoppingCart, X } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { PURCHASE_NAV } from "@/lib/purchase/routes";
import { cn } from "@/lib/purchase/cn";

export interface SidebarUser {
  name: string;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = { PURCHASE: "Purchase", APPROVER: "Approver", ADMIN: "Admin" };

// STANDALONE ONLY — the app's own sidebar while it runs on its own (the
// standalone Pigment ERP's Sidebar, same look). At the merge the Main ERP's
// sidebar shows the module's rows from PURCHASE_NAV instead, and this file
// stays behind.

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Buying</div>
      {PURCHASE_NAV.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand text-white shadow-sm" : "text-gray-700 hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Who is signed in, and the way out. */
function UserCard({ user }: { user: SidebarUser }) {
  return (
    <div className="mt-auto border-t border-gray-200/70 pt-4">
      <div className="px-2 text-sm font-medium text-gray-800">{user.name}</div>
      <div className="truncate px-2 text-xs text-gray-500" title={user.email}>
        {user.email} · {ROLE_LABEL[user.role] ?? user.role}
      </div>
      <form action={signOutAction} className="mt-2">
        <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-100">
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pacific-dark shadow-sm">
        <ShoppingCart className="h-5 w-5 text-white" aria-hidden />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-pacific-dark">Procurement ERP</div>
        <div className="text-xs text-gray-500">Pacific Engineered Surfaces</div>
      </div>
    </div>
  );
}

export function StandaloneSidebar({ user }: { user: SidebarUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-gray-200/70 bg-white/70 px-4 py-5 backdrop-blur md:flex print:hidden">
        <Brand />
        <NavLinks />
        <UserCard user={user} />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200/70 bg-white/90 px-4 py-3 backdrop-blur md:hidden print:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-white px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <UserCard user={user} />
          </div>
        </div>
      )}
    </>
  );
}
