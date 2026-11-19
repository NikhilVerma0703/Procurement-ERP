"use client";

// The rows ticked on a list (Frappe's list-row-checkbox), shared by the table and the page's header
// buttons: while any row is ticked the header shows "N items selected" and the primary button gives way
// to the Actions menu (list_view.js on_row_checked → toggle_actions_menu_button). Shift-click ticks the
// rows between the last one clicked and this one. New rows (a refresh, another filter or page) start
// unticked, as Frappe redrew them.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/** What the Actions menu needs to know of a row. */
export interface SelectableRow {
  id: string;
  /** The record's name (a PO's number). */
  name: string;
  /** For a PO: "Draft" | "Submitted" | "Cancelled", and its workflow state. */
  docStatus?: string;
  workflowState?: string;
}

interface Selection {
  rows: readonly SelectableRow[];
  /** The ticked rows, in the list's order. */
  chosen: SelectableRow[];
  isSelected: (id: string) => boolean;
  allSelected: boolean;
  /** Ticks or unticks a row; `range` (shift held) also ticks the rows since the last one clicked. */
  toggle: (id: string, on: boolean, range?: boolean) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
}

const SelectionContext = createContext<Selection | null>(null);
const NONE: ReadonlySet<string> = new Set();

export function ListSelection({ rows, children }: { rows: readonly SelectableRow[]; children: ReactNode }) {
  const key = rows.map((r) => r.id).join(",");
  const [state, setState] = useState<{ key: string; ids: ReadonlySet<string> }>({ key, ids: NONE });
  const ids = state.key === key ? state.ids : NONE;
  const cursor = useRef<string | null>(null);

  const toggle = useCallback(
    (id: string, on: boolean, range = false) => {
      const next = new Set(ids);
      const from = cursor.current;
      if (range && from && from !== id) {
        const a = rows.findIndex((r) => r.id === from);
        const b = rows.findIndex((r) => r.id === id);
        if (a !== -1 && b !== -1) for (let i = Math.min(a, b) + 1; i < Math.max(a, b); i++) next.add(rows[i].id);
      }
      if (on) next.add(id);
      else next.delete(id);
      cursor.current = id;
      setState({ key, ids: next });
    },
    [ids, rows, key],
  );
  const setAll = useCallback((on: boolean) => setState({ key, ids: on ? new Set(rows.map((r) => r.id)) : NONE }), [rows, key]);
  const clear = useCallback(() => setState({ key, ids: NONE }), [key]);

  const value = useMemo<Selection>(
    () => ({
      rows,
      chosen: rows.filter((r) => ids.has(r.id)),
      isSelected: (id) => ids.has(id),
      allSelected: rows.length > 0 && rows.every((r) => ids.has(r.id)),
      toggle,
      setAll,
      clear,
    }),
    [rows, ids, toggle, setAll, clear],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useListSelection(): Selection {
  const s = useContext(SelectionContext);
  if (!s) throw new Error("useListSelection outside <ListSelection>");
  return s;
}

/** A checkbox in the list's style (Frappe's small square box). */
export const CHECKBOX = "h-3.5 w-3.5 cursor-pointer rounded-[3px] border-gray-300 text-gray-900 accent-gray-900 focus:ring-0 focus:ring-offset-0";
