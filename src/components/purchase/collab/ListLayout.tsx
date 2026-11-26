"use client";

// The list page's two columns, as the old site laid them out: the sidebar (Filter By, Tags, Save Filter) on
// the left from a wide window, hidden by the ≡ beside the title or ⋯ › Toggle Sidebar; over a narrow window
// the ≡ opens it over the list instead (owner, 26-11-2026).
import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/purchase/cn";
import { useSidebarOverlay, useSidebarShown } from "./sidebar-state";

const WIDE = "(min-width: 992px)";

/** ≡ */
export function SidebarToggleButton() {
  const [, toggle] = useSidebarShown();
  const [open, setOpen] = useSidebarOverlay();
  return (
    <button
      type="button"
      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      title="Toggle Sidebar"
      aria-label="Toggle Sidebar"
      onClick={() => (window.matchMedia(WIDE).matches ? toggle() : setOpen(!open))}
    >
      <Menu className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** ⋯ › Toggle Sidebar */
export function useToggleSidebar() {
  const [, toggle] = useSidebarShown();
  const [open, setOpen] = useSidebarOverlay();
  return () => (window.matchMedia(WIDE).matches ? toggle() : setOpen(!open));
}

export function ListWithSidebar({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [shown] = useSidebarShown();
  const [open, setOpen] = useSidebarOverlay();
  return (
    <div className="flex items-start gap-5">
      <div className={cn("hidden w-[200px] shrink-0", shown && "min-[992px]:block")}>{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 min-[992px]:hidden" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="h-full w-64 overflow-y-auto bg-white p-4 shadow-xl">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
