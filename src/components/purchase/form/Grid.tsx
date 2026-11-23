"use client";

// An ERPNext child-table grid: a checkbox column (select rows to delete them),
// "No.", the table's list-view columns (a red asterisk on mandatory ones),
// and a pencil that opens the row's full form. Cells are typed in place.
// Below: "Add Row", and "Delete" while rows are selected.
import { Pencil, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/purchase/cn";
import { FieldName } from "./controls";

export interface GridColumn<T> {
  key: string;
  label: ReactNode;
  required?: boolean;
  align?: "left" | "right";
  /** A Tailwind width class for the column. */
  width?: string;
  cell: (row: T, index: number) => ReactNode;
}

export function Grid<T>({ label, rows, columns, editable, onAdd, onDelete, onEdit, rowError, addLabel = "Add Row", emptyText = "No Data" }: {
  label?: ReactNode;
  rows: T[];
  columns: GridColumn<T>[];
  editable: boolean;
  onAdd?: () => void;
  onDelete?: (indices: number[]) => void;
  onEdit?: (index: number) => void;
  /** Rows the save refused, drawn red. */
  rowError?: (index: number) => boolean;
  addLabel?: string;
  emptyText?: string;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => setSelected(new Set()), [rows.length]);
  const all = rows.length > 0 && selected.size === rows.length;
  return (
    // A table is a field of the form too (Items, Purchase Taxes and Charges…): Jump to field lists it.
    <div data-po-field={typeof label === "string" ? label : undefined}>
      {label && <div className="mb-1.5 text-xs text-gray-600">{label}</div>}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-600">
              {editable && (
                <th className="w-9 border-b border-gray-200 px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    className="h-3.5 w-3.5 accent-gray-800"
                    checked={all}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())}
                  />
                </th>
              )}
              <th className="w-12 border-b border-gray-200 px-2 py-2 text-center font-normal">No.</th>
              {columns.map((c) => (
                <th key={c.key} className={cn("border-b border-l border-gray-200 px-2 py-2 font-normal", c.align === "right" && "text-right", c.width)}>
                  {c.label}
                  {c.required && <span className="ml-0.5 text-red-500">*</span>}
                </th>
              ))}
              {onEdit && <th className="w-9 border-b border-l border-gray-200" aria-label="Edit" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="px-3 py-5 text-center text-xs text-gray-400">
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className={cn("align-middle", rowError?.(i) ? "bg-red-50/60" : "hover:bg-gray-50/60")}>
                {editable && (
                  <td className="border-b border-gray-100 px-2 py-1">
                    <input
                      type="checkbox"
                      aria-label={`Select row ${i + 1}`}
                      className="h-3.5 w-3.5 accent-gray-800"
                      checked={selected.has(i)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        setSelected(next);
                      }}
                    />
                  </td>
                )}
                <td className="border-b border-gray-100 px-2 py-1 text-center text-gray-500">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className={cn("po-grid-cell border-b border-l border-gray-100 px-0.5 py-0.5", c.align === "right" && "text-right")}>
                    <FieldName.Provider value={{ label: `${typeof c.label === "string" ? c.label : c.key} (row ${i + 1})` }}>{c.cell(row, i)}</FieldName.Provider>
                  </td>
                ))}
                {onEdit && (
                  <td className="border-b border-l border-gray-100 text-center">
                    <button type="button" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Edit row ${i + 1}`} onClick={() => onEdit(i)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="mt-2 flex items-center gap-2">
          {selected.size > 0 && onDelete && (
            <button
              type="button"
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
              onClick={() => {
                onDelete([...selected].sort((a, b) => a - b));
                setSelected(new Set());
              }}
            >
              Delete
            </button>
          )}
          {onAdd && (
            <button type="button" className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-200" onClick={onAdd}>
              {addLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A row's full form ("Editing Row #2"), over the page. */
export function RowDialog({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <div className="flex items-center gap-2">
            {actions}
            <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** A yes/no question before an action that cannot be undone (Frappe's frappe.confirm). */
export function ConfirmDialog({ message, onYes, onNo, yesLabel = "Yes", busy }: { message: ReactNode; onYes: () => void; onNo: () => void; yesLabel?: string; busy?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onNo()}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-3 text-[15px] font-semibold text-gray-900">Confirm</div>
        <div className="px-5 py-4 text-sm text-gray-700">{message}</div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" className="po-btn-secondary" onClick={onNo} disabled={busy}>
            No
          </button>
          <button type="button" className="po-btn-primary" onClick={onYes} disabled={busy}>
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
