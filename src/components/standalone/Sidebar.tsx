"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, ClipboardList, DoorOpen, FileText, LogOut, Menu, Package, PackageCheck, ShoppingCart, Warehouse, X } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { navModulesFor } from "@/lib/purchase/nav";
import { PURCHASE_PATHS, type PurchaseNavRow } from "@/lib/purchase/routes";
import { cn } from "@/lib/purchase/cn";

export interface SidebarUser {
  name: string;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = { PURCHASE: "Purchase", STORE: "Store", APPROVER: "Approver", ADMIN: "Admin" };

// STANDALONE ONLY — the app's own sidebar while it runs on its own (the
// standalone Pigment ERP's Sidebar, same look). At the merge the Main ERP's
// sidebar shows the module's rows from PURCHASE_NAV instead, and this file
// stays behind.

// The modules the login may open (lib/purchase/nav.ts), as a tree that opens on demand (owner,
// 25-11-2026: "clean, hierarchical, compact"): Buying opens to its nine sections; Stock shows the old
// site's three cards, each opening to its sections. At first Buying is closed and Stock shows its
// cards, closed; what was opened stays open while moving between pages. A closed module or card holding the page on screen is tinted, so the way back shows.
// The four sections used most (routes.ts `primary`) keep their own icon, a tint, an accent bar and
// bold type wherever they are drawn.

/** The four sections used most: an icon each, so they read at a glance. */
const PRIMARY_ICONS: Record<string, typeof FileText> = {
  [PURCHASE_PATHS.orders]: ClipboardList,
  [PURCHASE_PATHS.items]: Package,
  [PURCHASE_PATHS.gateEntries]: DoorOpen,
  [PURCHASE_PATHS.receipts]: PackageCheck,
};
const MODULE_ICONS: Record<string, typeof FileText> = { buying: ShoppingCart, stock: Warehouse };

function NavRow({ row, active, onNavigate }: { row: PurchaseNavRow; active: boolean; onNavigate?: () => void }) {
  const Icon = (row.primary && PRIMARY_ICONS[row.href]) || FileText;
  return (
    <Link
      href={row.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition",
        active
          ? "bg-brand font-medium text-white shadow-sm"
          : row.primary
            ? "bg-brand-50 font-semibold text-brand-800 ring-1 ring-inset ring-brand-100 hover:bg-brand-100"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      )}
    >
      {row.primary && !active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-500" aria-hidden />}
      <Icon className={cn("shrink-0", row.primary ? "h-4 w-4" : "h-3.5 w-3.5", active ? "text-white" : row.primary ? "text-brand-600" : "text-gray-400")} aria-hidden />
      <span className="min-w-0 leading-snug">{row.label}</span>
    </Link>
  );
}

function NavLinks({ user, onNavigate }: { user: SidebarUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  // At first: Buying, and Stock's three cards (owner, 25-11-2026: "(1) Buying (2) Stock → Items and
  // Pricing (3) Stock → Stock Transactions (4) Stock → Stock Reports"); each opens to its sections.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(["stock"]));
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const holdsPage = (rows: readonly PurchaseNavRow[]) => rows.some((r) => isActive(r.href));
  return (
    <nav className="flex flex-col gap-1 overflow-y-auto" aria-label="Procurement ERP">
      {navModulesFor(user).map((m) => {
        const mOpen = open.has(m.key);
        const ModuleIcon = MODULE_ICONS[m.key] ?? FileText;
        const here = holdsPage(m.groups.flatMap((g) => g.rows));
        return (
          <div key={m.key}>
            <button
              type="button"
              onClick={() => toggle(m.key)}
              aria-expanded={mOpen}
              aria-controls={`nav-${m.key}`}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-gray-100",
                !mOpen && here ? "bg-brand-50 text-brand-700" : "text-gray-800",
              )}
            >
              <ModuleIcon className={cn("h-4 w-4 shrink-0", !mOpen && here ? "text-brand-600" : "text-gray-500")} aria-hidden />
              <span className="flex-1 text-left">{m.label}</span>
              <ChevronRight className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", mOpen && "rotate-90")} aria-hidden />
            </button>
            {mOpen && (
              <div id={`nav-${m.key}`} className="ml-[1.15rem] mt-1 flex flex-col gap-0.5 border-l border-gray-200 pb-1 pl-2.5">
                {m.groups.map((g) => {
                  if (!g.label) return g.rows.map((r) => <NavRow key={r.href} row={r} active={isActive(r.href)} onNavigate={onNavigate} />);
                  const key = `${m.key}:${g.label}`;
                  const gOpen = open.has(key);
                  const gHere = holdsPage(g.rows);
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={gOpen}
                        aria-controls={`nav-${key}`}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition hover:bg-gray-100",
                          !gOpen && gHere ? "bg-brand-50 text-brand-700" : "text-gray-700",
                        )}
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform", gOpen && "rotate-90")} aria-hidden />
                        <span className="flex-1 text-left">{g.label}</span>
                        {!gOpen && g.rows.some((r) => r.primary) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" title="Holds a section used most" aria-hidden />}
                      </button>
                      {gOpen && (
                        <div id={`nav-${key}`} className="ml-[0.95rem] mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pb-1 pl-2">
                          {g.rows.map((r) => <NavRow key={r.href} row={r} active={isActive(r.href)} onNavigate={onNavigate} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
        <NavLinks user={user} />
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
            <NavLinks user={user} onNavigate={() => setOpen(false)} />
            <UserCard user={user} />
          </div>
        </div>
      )}
    </>
  );
}
