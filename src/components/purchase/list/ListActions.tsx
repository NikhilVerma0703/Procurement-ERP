"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/purchase/cn";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";
import { usePopover } from "../ui/usePopover";

// The list's header buttons, as on the old site: Refresh, the ⋯ menu (Export
// of the filtered list), and "+ Add Purchase Order".
export function ListActions({ exportHref }: { exportHref: string }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const menu = usePopover<HTMLDivElement>();
  return (
    <>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        className="po-btn-secondary px-2"
        title="Refresh"
        aria-label="Refresh"
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
      </button>
      <div ref={menu.ref} className="relative">
        <button type="button" onClick={() => menu.setOpen(!menu.open)} className="po-btn-secondary px-2" aria-label="Menu" aria-expanded={menu.open}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menu.open && (
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg" role="menu">
            <a href={exportHref} role="menuitem" onClick={() => menu.setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4" aria-hidden />
              Export (Excel)
            </a>
          </div>
        )}
      </div>
      <Link href={PURCHASE_PATHS.orderNew} className="po-btn-primary">
        <Plus className="h-4 w-4" aria-hidden />
        Add Purchase Order
      </Link>
    </>
  );
}
