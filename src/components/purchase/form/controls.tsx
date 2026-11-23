"use client";

// The PO form's field controls, drawn as the old ERPNext form drew them: the
// label above a light-grey field, a red asterisk for a mandatory one, a red
// border and message under a field the save refused, dates as dd-mm-yyyy,
// numbers in the site's #,###.### format while not being typed, link fields
// that search as you type (GET /api/purchase/lookup) and keep only a value
// picked from the list, and collapsible sections.
import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/purchase/cn";
import { formatNumber } from "@/lib/purchase/format";
import { PURCHASE_API_PATHS } from "@/lib/purchase/routes";

export const inputClass =
  "po-input block w-full rounded-md border border-transparent bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-200 disabled:cursor-default disabled:text-gray-700";

export function Label({ children, required, htmlFor }: { children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs text-gray-600">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

/** The label of the field a control sits in (a Field, or a grid cell), for its id and accessible name. */
export const FieldName = createContext<{ id?: string; label?: string } | null>(null);
const useFieldName = () => useContext(FieldName) ?? {};

export function Field({ label, required, error, children, description, className }: {
  label?: ReactNode;
  required?: boolean;
  error?: string;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    // data-po-field: the field's label, for ⋯ › Jump to field (form/JumpToField.tsx).
    <div className={cn("min-w-0", className)} data-invalid={error ? "true" : undefined} data-po-field={typeof label === "string" ? label : undefined}>
      {label && <Label required={required} htmlFor={id}>{label}</Label>}
      <FieldName.Provider value={{ id, label: typeof label === "string" ? label : undefined }}>{children}</FieldName.Provider>
      {description && !error && <p className="mt-1 text-[11px] text-gray-500">{description}</p>}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

const invalid = (error?: string) => (error ? "border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-red-100" : "");

export function TextInput({ value, onChange, disabled, error, placeholder, onBlur, list }: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  onBlur?: () => void;
  /** The id of a <datalist> of suggestions (an Autocomplete field). */
  list?: string;
}) {
  const name = useFieldName();
  return (
    <input
      id={name.id}
      aria-label={name.id ? undefined : name.label}
      className={cn(inputClass, invalid(error))}
      value={value ?? ""}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={error ? true : undefined}
      list={list}
      autoComplete={list ? "off" : undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export function TextArea({ value, onChange, disabled, rows = 3 }: { value: string | null | undefined; onChange: (v: string) => void; disabled?: boolean; rows?: number }) {
  const name = useFieldName();
  return <textarea id={name.id} aria-label={name.id ? undefined : name.label} className={cn(inputClass, "resize-y")} rows={rows} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

/** A number typed as the user types it, shown in the site's format otherwise. */
export function NumberInput({ value, onChange, disabled, error, decimals = 3, align = "right", onCommit, trim = true }: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  disabled?: boolean;
  error?: string;
  decimals?: number;
  align?: "left" | "right";
  /** After the value is typed and the field left (Frappe's change trigger). */
  onCommit?: (v: number) => void;
  /** Show 1.500 as 1.5 (Float fields) instead of keeping the decimals (Currency). */
  trim?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? formatShown(value, decimals, trim);
  const name = useFieldName();
  return (
    <input
      id={name.id}
      aria-label={name.id ? undefined : name.label}
      className={cn(inputClass, align === "right" && "text-right", invalid(error))}
      inputMode="decimal"
      value={shown}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      onFocus={() => setText(value == null || value === 0 ? (value === 0 ? "0" : "") : String(value))}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (n !== null) onChange(n);
      }}
      onBlur={() => {
        const n = parseNumber(text ?? "");
        setText(null);
        if (text !== null && onCommit) onCommit(n ?? 0);
        if (text !== null && n === null) onChange(0);
      }}
    />
  );
}

export function parseNumber(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (t === "" || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatShown(v: number | null | undefined, decimals: number, trim: boolean): string {
  if (v == null || !Number.isFinite(v)) return "";
  if (!trim) return formatNumber(v, decimals);
  if (Number.isInteger(v)) return formatNumber(v, 0);
  return formatNumber(v, decimals);
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-11-18" → "18-11-2026". */
export const toDmy = (ymd: string | null | undefined) => (ymd ? `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}` : "");
/** "18-11-2026" (or 18/11/2026) → "2026-11-18"; null when it is not a date. */
export function fromDmy(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** A date typed as dd-mm-yyyy or picked from the calendar; its value is "YYYY-MM-DD". */
export function DateInput({ value, onChange, disabled, error }: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const name = useFieldName();
  return (
    <div className="relative">
      <input
        id={name.id}
        aria-label={name.id ? undefined : name.label}
        className={cn(inputClass, "pr-8", invalid(error))}
        value={text ?? toDmy(value)}
        placeholder={disabled ? "" : "dd-mm-yyyy"}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return;
          if (text.trim() === "") onChange(null);
          else {
            const ymd = fromDmy(text);
            if (ymd) onChange(ymd);
          }
          setText(null);
        }}
      />
      {!disabled && (
        <>
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700"
            aria-label="Pick a date"
            onClick={() => {
              const el = picker.current;
              if (!el) return;
              try {
                el.showPicker();
              } catch {
                el.click();
              }
            }}
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
            value={value ?? ""}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
        </>
      )}
    </div>
  );
}

export function SelectInput<T extends string>({ value, onChange, options, disabled, error, blank = false }: {
  value: T | string | null | undefined;
  onChange: (v: T | null) => void;
  options: readonly T[];
  disabled?: boolean;
  error?: string;
  blank?: boolean;
}) {
  const listed = value && !(options as readonly string[]).includes(value) ? [value as T, ...options] : options;
  const name = useFieldName();
  return (
    <select
      id={name.id}
      aria-label={name.id ? undefined : name.label}
      className={cn(inputClass, "appearance-auto pr-6", invalid(error))}
      value={value ?? ""}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
    >
      {blank && <option value="" />}
      {listed.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function CheckInput({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean | undefined; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  // In a grid cell there is no label beside the box: it takes the column's name ("Is Primary (row 1)").
  const cell = useFieldName();
  return (
    <label htmlFor={id} className={cn("flex items-center gap-2 py-1 text-[13px] text-gray-700", disabled ? "cursor-default" : "cursor-pointer")}>
      <input id={id} type="checkbox" aria-label={label ? undefined : cell.label} className="h-3.5 w-3.5 rounded border-gray-300 accent-gray-800" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A computed or fetched value: shown, never typed. */
export function ReadOnly({ value, multiline, className, align }: { value: ReactNode; multiline?: boolean; className?: string; align?: "left" | "right" }) {
  return (
    <div
      className={cn(
        "min-h-[30px] rounded-md bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] text-gray-700",
        multiline && "whitespace-pre-line leading-5",
        align === "right" && "text-right",
        className,
      )}
    >
      {value === null || value === undefined || value === "" ? <span className="select-none">&nbsp;</span> : value}
    </div>
  );
}

export interface LookupRow {
  value: string;
  description?: string | null;
}

/**
 * A Link field: type to search, pick from the list. A value typed but not picked is dropped
 * when the field is left (Frappe kept only existing records in a link).
 */
export function LinkInput({ type, value, onChange, params, disabled, error, placeholder }: {
  type: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  params?: Record<string, string | null | undefined>;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const name = useFieldName();
  const query = text ?? "";
  const paramKey = useMemo(() => JSON.stringify(params ?? {}), [params]);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ type, q: query });
        for (const [k, v] of Object.entries(JSON.parse(paramKey) as Record<string, string | null>)) if (v) sp.set(k, v);
        const res = await fetch(`${PURCHASE_API_PATHS.lookup}?${sp}`, { signal: ctl.signal });
        const body = (await res.json()) as { results?: LookupRow[] };
        setRows(body.results ?? []);
        setActive(0);
      } catch {
        /* aborted or offline: keep the last list */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, query, type, paramKey]);

  // The list is drawn over the page (a portal), so a grid or a dialog that scrolls never clips it.
  useLayoutEffect(() => {
    if (!open || !input.current) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (r) setRect({ top: r.top, bottom: r.bottom, left: r.left, width: r.width });
    };
    place();
    const onScroll = (e: Event) => {
      if (list.current && list.current.contains(e.target as Node)) return;
      place();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || list.current?.contains(t)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  function pick(v: string | null) {
    setText(null);
    setOpen(false);
    if (v !== (value ?? null)) onChange(v);
  }

  function close() {
    // Leaving the field: an emptied field clears the link; an exact match is taken; anything else is dropped.
    if (text !== null) {
      if (text.trim() === "") pick(null);
      else {
        const exact = rows.find((r) => r.value.toLowerCase() === text.trim().toLowerCase());
        if (exact) pick(exact.value);
        else {
          setText(null);
          setOpen(false);
        }
      }
    } else setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <input
        ref={input}
        id={name.id}
        aria-label={name.id ? undefined : name.label}
        className={cn(inputClass, invalid(error))}
        value={text ?? value ?? ""}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => !disabled && setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, rows.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && rows[active]) {
              e.preventDefault();
              pick(rows[active].value);
            }
          } else if (e.key === "Escape") {
            setText(null);
            setOpen(false);
          } else if (e.key === "Tab") {
            close();
          }
        }}
      />
      {open && !disabled && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={list}
          className="purchase-root fixed z-[60] max-h-72 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
          style={
            rect.bottom + 296 > window.innerHeight && rect.top > 300
              ? { position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left, width: Math.max(rect.width, 280) }
              : { position: "fixed", top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) }
          }
        >
          {loading && rows.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && rows.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No results</div>}
          {rows.map((r, i) => (
            <button
              key={r.value}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn("block w-full px-3 py-1.5 text-left", i === active ? "bg-gray-100" : "hover:bg-gray-50")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r.value)}
            >
              <span className="block truncate text-[13px] font-medium text-gray-900">{r.value}</span>
              {r.description && <span className="block truncate text-[11px] text-gray-500">{r.description}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** The event that opens a collapsed section from outside it (⋯ › Jump to field opens the field's section). */
export const OPEN_SECTION_EVENT = "po-open-section";

/**
 * A form section: a top rule, its title (collapsible ones with a chevron), then its fields. A collapsed
 * section keeps its fields in the page, hidden, so Jump to field can find and open them.
 */
export function Section({ title, collapsible, defaultOpen = true, children, className }: {
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !collapsible) return;
    const onOpen = () => setOpen(true);
    el.addEventListener(OPEN_SECTION_EVENT, onOpen);
    return () => el.removeEventListener(OPEN_SECTION_EVENT, onOpen);
  }, [collapsible]);
  const shown = !collapsible || open;
  return (
    <section ref={ref} data-po-section={title} className={cn("border-t border-gray-200 px-4 py-4 first:border-t-0 sm:px-5", className)}>
      {title &&
        (collapsible ? (
          <button type="button" className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {title}
            <ChevronDown className={cn("h-4 w-4 text-gray-500 transition", open && "rotate-180")} />
          </button>
        ) : (
          <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
        ))}
      <div className={cn(title && "mt-3")} hidden={!shown}>
        {children}
      </div>
    </section>
  );
}
