"use client";

// Whether the lists show their sidebar, and which extra "Filter By" fields each list has (owner, 26-11-2026).
// Frappe kept the first in the browser (localStorage.show_sidebar, one setting for every list; shown unless
// hidden) and the second in the user's settings for the DocType (Edit Filters → group_by_fields). Both are
// kept in this browser here, under the same rule: the ≡ beside the title and ⋯ › Toggle Sidebar flip it.
import { useCallback, useSyncExternalStore } from "react";

const SIDEBAR_KEY = "show_sidebar";
const GROUP_BY_KEY = (doctype: string) => `purchase.group_by_fields.${doctype}`;
const EVENT = "purchase-list-settings";

const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};
const read = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the setting lasts for this page only */
  }
  window.dispatchEvent(new Event(EVENT));
};

/** The sidebar's state: shown unless the user hid it. */
export function useSidebarShown(): [boolean, () => void] {
  const shown = useSyncExternalStore(subscribe, () => read(SIDEBAR_KEY) !== "false", () => true);
  const toggle = useCallback(() => write(SIDEBAR_KEY, read(SIDEBAR_KEY) === "false" ? "true" : "false"), []);
  return [shown, toggle];
}

/** The fields Edit Filters added to this list's "Filter By" (after Assigned To and Created By). */
export function useGroupByFields(doctype: string): [string[], (fields: string[]) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(GROUP_BY_KEY(doctype)) ?? "[]", () => "[]");
  let fields: string[] = [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) fields = v.map(String);
  } catch {
    fields = [];
  }
  const save = useCallback((next: string[]) => write(GROUP_BY_KEY(doctype), next.length ? JSON.stringify(next) : null), [doctype]);
  return [fields, save];
}

// Show Tags (list_view.js tags_shown): for the page as it is open, as Frappe kept it; and the sidebar opened
// over a narrow window (Frappe's ≡ there).
let tagsShown = false;
let overlayOpen = false;
const local = new Set<() => void>();
const subscribeLocal = (fn: () => void) => {
  local.add(fn);
  return () => void local.delete(fn);
};
const notify = () => local.forEach((fn) => fn());

export function useTagsShown(): [boolean, () => void] {
  const shown = useSyncExternalStore(subscribeLocal, () => tagsShown, () => false);
  return [shown, useCallback(() => ((tagsShown = !tagsShown), notify()), [])];
}

export function useSidebarOverlay(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribeLocal, () => overlayOpen, () => false);
  return [open, useCallback((v: boolean) => ((overlayOpen = v), notify()), [])];
}
