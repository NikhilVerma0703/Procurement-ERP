"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PURCHASE_PATHS } from "@/lib/purchase/routes";

// The old site brought each user back to the list as they left it: same
// filters, same sort (ERPNext's list settings per user). Here the last list
// view is kept in this browser for this login; opening the list with a plain
// address (the sidebar link) restores it. Clearing every filter is remembered
// too, so the plain list then stays plain.
const keyFor = (userId: string) => `purchase.po-list.${userId}`;

export function RememberListView({ userId, search }: { userId: string; search: string }) {
  const router = useRouter();
  const first = useRef(true);
  useEffect(() => {
    const key = keyFor(userId);
    try {
      if (first.current) {
        first.current = false;
        const saved = window.localStorage.getItem(key);
        if (!search && saved) {
          router.replace(`${PURCHASE_PATHS.orders}?${saved}`, { scroll: false });
          return;
        }
      }
      // Rows loaded with Load More are not part of the view.
      const view = new URLSearchParams(search);
      view.delete("limit");
      window.localStorage.setItem(key, view.toString());
    } catch {
      /* storage blocked: the list simply starts plain */
    }
  }, [userId, search, router]);
  return null;
}
