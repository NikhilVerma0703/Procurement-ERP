"use client";

// The PO form's shared state: the values being edited (OrderFormValues, the
// same shape the save validates), the texts shown beside links, per-row info,
// the refused fields, and the figures — computed live with the server's own
// engine while a draft is edited, the stored ones once it is submitted.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { calculatePurchaseOrder, type PurchaseOrderCalcResult } from "@/lib/purchase/calc/index";
import type { CurrencyDisplay } from "@/lib/purchase/format";
import { engineInput } from "@/lib/purchase/orders/engine-input";
import type { FormDisplays, FormMasters, OrderDoc, RowInfo } from "@/lib/purchase/orders/form-load";
import type { ItemRowValues, OrderFormValues, OverheadRowValues, ScheduleRowValues, TaxRowValues } from "@/lib/purchase/orders/form-schema";
import type { PoAction } from "@/lib/purchase/orders/workflow";

export interface Tables {
  items: ItemRowValues;
  taxes: TaxRowValues;
  costOverheads: OverheadRowValues;
  paymentSchedule: ScheduleRowValues;
}
export type TableKey = keyof Tables;

export interface FormCtx {
  doc: OrderDoc;
  masters: FormMasters;
  allowed: Set<PoAction>;
  values: OrderFormValues;
  displays: FormDisplays;
  rowInfo: RowInfo[];
  errors: Record<string, string>;
  dirty: boolean;
  /** Draft fields can be typed in. */
  editable: boolean;
  /** Submitted: the fields ERPNext allowed after submit can be changed (then "Update"). */
  updatable: boolean;
  figures: PurchaseOrderCalcResult | null;
  money: { doc: CurrencyDisplay & { code: string }; base: CurrencyDisplay & { code: string } };
  set: <K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) => void;
  patch: (values: Partial<OrderFormValues>) => void;
  setDisplays: (d: Partial<FormDisplays>) => void;
  setRow: <T extends TableKey>(table: T, index: number, row: Partial<Tables[T]>) => void;
  addRow: <T extends TableKey>(table: T, row: Tables[T], at?: number) => void;
  removeRows: (table: TableKey, indices: number[]) => void;
  replaceRows: <T extends TableKey>(table: T, rows: Tables[T][]) => void;
  setRowInfo: (index: number, info: Partial<RowInfo>) => void;
  setErrors: (e: Record<string, string>) => void;
  markClean: () => void;
}

export const FormContext = createContext<FormCtx | null>(null);

export function useForm(): FormCtx {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("useForm outside the PO form");
  return ctx;
}

const blankInfo = (): RowInfo => ({ stockUom: null, gstHsnCode: null, lastPurchaseRate: 0, receivedQty: 0, billedAmt: 0, pageBreak: false });

/** The state behind FormContext. */
export function useFormState(doc: OrderDoc, masters: FormMasters, allowed: Set<PoAction>): FormCtx {
  const [values, setValues] = useState<OrderFormValues>(doc.values);
  const [displays, setDisplaysState] = useState<FormDisplays>(doc.displays);
  const [rowInfo, setRowInfoState] = useState<RowInfo[]>(doc.rowInfo.length ? doc.rowInfo : doc.values.items.map(blankInfo));
  const [errors, setErrorsState] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const touch = useCallback((keys: string[]) => {
    setDirty(true);
    setErrorsState((e) => {
      if (!keys.some((k) => Object.keys(e).some((x) => x === k || x.startsWith(`${k}.`)))) return e;
      const next = { ...e };
      for (const k of Object.keys(next)) if (keys.some((key) => k === key || k.startsWith(`${key}.`))) delete next[k];
      return next;
    });
  }, []);

  const set = useCallback(<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    touch([key as string]);
  }, [touch]);

  const patch = useCallback((p: Partial<OrderFormValues>) => {
    setValues((v) => ({ ...v, ...p }));
    touch(Object.keys(p));
  }, [touch]);

  const setDisplays = useCallback((d: Partial<FormDisplays>) => setDisplaysState((x) => ({ ...x, ...d })), []);

  const setRow = useCallback(<T extends TableKey>(table: T, index: number, row: Partial<Tables[T]>) => {
    setValues((v) => {
      const list = [...((v[table] ?? []) as Tables[T][])];
      if (!list[index]) return v;
      list[index] = { ...list[index], ...row };
      return { ...v, [table]: list };
    });
    touch(Object.keys(row).map((k) => `${table}.${index}.${k}`));
  }, [touch]);

  const addRow = useCallback(<T extends TableKey>(table: T, row: Tables[T], at?: number) => {
    setValues((v) => {
      const list = [...((v[table] ?? []) as Tables[T][])];
      list.splice(at ?? list.length, 0, row);
      return { ...v, [table]: list };
    });
    if (table === "items") setRowInfoState((r) => {
      const next = [...r];
      next.splice(at ?? next.length, 0, blankInfo());
      return next;
    });
    touch([table]);
  }, [touch]);

  const removeRows = useCallback((table: TableKey, indices: number[]) => {
    const drop = new Set(indices);
    setValues((v) => ({ ...v, [table]: ((v[table] ?? []) as unknown[]).filter((_, i) => !drop.has(i)) }));
    if (table === "items") setRowInfoState((r) => r.filter((_, i) => !drop.has(i)));
    // Row errors are keyed by position: they no longer apply.
    setErrorsState((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${table}.`))));
    setDirty(true);
  }, []);

  const replaceRows = useCallback(<T extends TableKey>(table: T, rows: Tables[T][]) => {
    setValues((v) => ({ ...v, [table]: rows }));
    if (table === "items") setRowInfoState(rows.map(blankInfo));
    touch([table]);
  }, [touch]);

  const setRowInfo = useCallback((index: number, info: Partial<RowInfo>) => {
    setRowInfoState((r) => r.map((x, i) => (i === index ? { ...x, ...info } : x)));
  }, []);

  const editable = doc.docStatus === "Draft" && allowed.has("save");
  const updatable = doc.docStatus === "Submitted" && allowed.has("update");

  const live = useMemo(() => {
    if (doc.docStatus !== "Draft") return null;
    try {
      return calculatePurchaseOrder(engineInput(values, masters.engine));
    } catch {
      return null;
    }
  }, [doc.docStatus, values, masters.engine]);

  const company = masters.engine.companyCurrency;
  const money = useMemo(() => {
    const d = masters.currencyDisplay[values.currency] ?? {};
    const b = masters.currencyDisplay[company] ?? {};
    return { doc: { ...d, code: values.currency }, base: { ...b, code: company } };
  }, [masters.currencyDisplay, values.currency, company]);

  return {
    doc, masters, allowed, values, displays, rowInfo, errors, dirty, editable, updatable,
    figures: doc.docStatus === "Draft" ? live : doc.figures,
    money, set, patch, setDisplays, setRow, addRow, removeRows, replaceRows, setRowInfo,
    setErrors: setErrorsState,
    markClean: () => setDirty(false),
  };
}
