"use client";

// ⋯ › Jump to field (Ctrl+J), as Frappe's form had it: a dialog with one box, "Select Field". Type part
// of a field's label, pick it, and the form shows that field: its tab is opened, a collapsed section
// around it is expanded, and the page scrolls to it and puts the cursor in it. The fields are the ones
// the form shows (every tab, collapsed sections included), each named by its label.
import { useEffect, useMemo, useRef, useState } from "react";
import { OPEN_SECTION_EVENT } from "./controls";

interface Target {
  label: string;
  /** The tab it is on (data-po-tab), when it has one. */
  tab: string | null;
  el: HTMLElement;
}

/** The form's fields, in the order they appear, each label once. */
function collect(root: HTMLElement): Target[] {
  const seen = new Set<string>();
  const out: Target[] = [];
  root.querySelectorAll<HTMLElement>("[data-po-field]").forEach((el) => {
    const label = el.dataset.poField?.trim();
    if (!label || seen.has(label)) return;
    seen.add(label);
    out.push({ label, tab: el.closest<HTMLElement>("[data-po-tab]")?.dataset.poTab ?? null, el });
  });
  return out;
}

export function JumpToField({ root, onTab, onClose }: { root: HTMLElement | null; onTab: (tab: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const targets = useMemo(() => (root ? collect(root) : []), [root]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? targets.filter((x) => x.label.toLowerCase().includes(t)) : targets).slice(0, 50);
  }, [q, targets]);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setActive(0), [q]);

  const go = (t: Target) => {
    onClose();
    if (t.tab) onTab(t.tab);
    const section = t.el.closest<HTMLElement>("[data-po-section]");
    section?.dispatchEvent(new Event(OPEN_SECTION_EVENT));
    // After the tab and section have shown it.
    window.setTimeout(() => {
      t.el.scrollIntoView({ block: "center", behavior: "smooth" });
      const control = t.el.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select, [contenteditable=true], button");
      control?.focus({ preventScroll: true });
      t.el.classList.add("po-jump-highlight");
      window.setTimeout(() => t.el.classList.remove("po-jump-highlight"), 1600);
    }, 60);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" role="dialog" aria-modal="true" aria-label="Jump to field" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <span className="text-[15px] font-semibold text-gray-900">Jump to field</span>
          <button type="button" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="mb-1 block text-xs text-gray-600" htmlFor="po-jump-field">
            Select Field
          </label>
          <input
            id="po-jump-field"
            ref={input}
            className="po-input block w-full rounded-md border border-transparent bg-[#f4f5f6] px-2.5 py-1.5 text-[13px] outline-none focus:border-gray-300 focus:bg-white"
            value={q}
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && shown[active]) {
                e.preventDefault();
                go(shown[active]);
              } else if (e.key === "Escape") onClose();
            }}
          />
          <ul className="mt-2 max-h-72 overflow-y-auto rounded-md border border-gray-100" role="listbox" aria-label="Fields">
            {shown.map((t, i) => (
              <li key={t.label} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left text-[13px] ${i === active ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50"}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(t)}
                >
                  {t.label}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-2 text-[13px] text-gray-400">No field matches.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
