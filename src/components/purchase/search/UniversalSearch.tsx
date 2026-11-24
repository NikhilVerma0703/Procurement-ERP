"use client";

// The top search box — "Search or type a command (Ctrl + G)" — as the old site's awesome bar
// (owner, 23-11-2026: "make that search box … same functionality and behaviour"). What it lists is
// lib/purchase/search/awesome.ts (the old code, ported); this draws it the old way: a list under the
// box, the first entry chosen, ↑ ↓ to move, Enter to open (Ctrl+Enter in a new tab), Esc to leave,
// Ctrl+G from anywhere to come back. "Search for …" opens the global search over the documents,
// "Help on Search" the old help table. The pages visited are remembered in this browser, per login,
// for "recent" and "most visited" (the old site kept them on its server as Route History).

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/purchase/cn";
import { randomPassword, SEARCH_HELP, searchOptions, searchScope, visitedPage, type SearchOption, type VisitedPage } from "@/lib/purchase/search/awesome";
import { PURCHASE_API_PATHS } from "@/lib/purchase/routes";

interface Visits {
  recent: VisitedPage[];
  counts: Record<string, { page: VisitedPage; count: number }>;
}
const storeKey = (user: string) => `po-search-visits:${user}`;
const loadVisits = (user: string): Visits => {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(user)) ?? "null") as Visits | null;
    return v && Array.isArray(v.recent) && v.counts && typeof v.counts === "object" ? v : { recent: [], counts: {} };
  } catch {
    return { recent: [], counts: {} };
  }
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Dialog = { kind: "help" } | { kind: "message"; title: string; html: string } | { kind: "global"; text: string };

export function UniversalSearch({ userId, role }: { userId: string; role: string }) {
  const scope = useMemo(() => searchScope({ role }), [role]);
  const pathname = usePathname();
  const router = useRouter();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const visits = useRef<Visits>({ recent: [], counts: {} });

  useEffect(() => {
    visits.current = loadVisits(userId);
  }, [userId]);

  // Each page opened counts as a visit, once its title is known (Frappe's route history).
  useEffect(() => {
    const t = setTimeout(() => {
      const page = visitedPage(pathname, document.title, scope);
      if (!page) return;
      const v = loadVisits(userId);
      v.recent = [page, ...v.recent.filter((p) => p.path !== page.path)].slice(0, 20);
      v.counts[page.path] = { page, count: (v.counts[page.path]?.count ?? 0) + 1 };
      try {
        localStorage.setItem(storeKey(userId), JSON.stringify(v));
      } catch {
        /* storage full or blocked: the box still works without history */
      }
      visits.current = v;
    }, 500);
    return () => clearTimeout(t);
  }, [pathname, userId, scope]);

  const currentList = useMemo(() => scope.doctypes.find((d) => d.list === pathname.replace(/\/+$/, "")) ?? null, [scope, pathname]);

  const compute = useCallback(
    (value: string) => {
      const v = visits.current;
      const frequent = Object.values(v.counts).sort((a, b) => b.count - a.count);
      setOptions(searchOptions(value, { ...scope, currentList, recent: v.recent, frequent }));
      setActive(0);
    },
    [scope, currentList],
  );

  // The old box waited 100 ms after the last key before it searched.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => compute(text), 100);
    return () => clearTimeout(t);
  }, [text, open, compute]);

  // Ctrl+G: "Open Awesomebar" (the old site's shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: SearchOption | undefined, newTab = false) => {
    if (!o) return;
    setText("");
    setOpen(false);
    input.current?.blur();
    if (o.href) {
      if (newTab) window.open(o.href, "_blank", "noopener");
      else router.push(o.href);
      return;
    }
    const a = o.action;
    if (!a) return;
    if (a.kind === "global-search") setDialog({ kind: "global", text: a.text });
    else if (a.kind === "help") setDialog({ kind: "help" });
    else if (a.kind === "message") setDialog({ kind: "message", title: a.title, html: a.html });
    else setDialog({ kind: "message", title: "Result", html: esc(randomPassword(16)) });
  };

  return (
    <div className="po-search relative w-full max-w-md print:hidden">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Search or type a command"
          aria-expanded={open}
          aria-controls="po-search-list"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search or type a command (Ctrl + G)"
          className="w-full rounded-lg border border-transparent bg-gray-100 py-1.5 pl-9 pr-3 text-[13px] text-gray-900 outline-none transition placeholder:text-gray-500 focus:border-gray-300 focus:bg-white"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setOpen(true);
            compute(text);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(options.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(options[active], e.ctrlKey || e.metaKey);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
        />
      </div>
      {open && options.length > 0 && (
        <ul ref={list} id="po-search-list" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {options.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => choose(o, e.ctrlKey || e.metaKey)}
              className={cn("cursor-pointer px-3 py-1.5 text-[13px] text-gray-800", i === active && "bg-gray-100")}
            >
              {o.type === "Search" ? (
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate" dangerouslySetInnerHTML={{ __html: o.label }} />
                  <kbd>↵</kbd>
                </span>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: o.label }} />
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog?.kind === "help" && (
        <Modal title="Search Help" onClose={() => setDialog(null)}>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {SEARCH_HELP.map(([what, how]) => (
                <tr key={what}>
                  <td className="w-1/2 border border-gray-200 px-3 py-2">{what}</td>
                  <td className="border border-gray-200 px-3 py-2">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
      {dialog?.kind === "message" && (
        <Modal title={dialog.title} onClose={() => setDialog(null)}>
          <div className="text-[13px] text-gray-800" dangerouslySetInnerHTML={{ __html: dialog.html }} />
        </Modal>
      )}
      {dialog?.kind === "global" && <GlobalSearchDialog initial={dialog.text} onClose={() => setDialog(null)} onOpen={(href) => { setDialog(null); router.push(href); }} />}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className={cn("w-full rounded-lg bg-white shadow-xl", wide ? "max-w-4xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

interface GlobalResult {
  doctype: string;
  name: string;
  content: string;
  href: string;
}

/** The result's content with the words searched for in bold (the old dialog's snippet). */
function snippet(content: string, q: string): string {
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const text = esc(content.split(" ||| ").join(" · "));
  if (!words.length) return text;
  return text.replace(new RegExp(`(${words.map(esc).join("|")})`, "gi"), "<b>$1</b>");
}

/** "Search for …": the old site's search dialog — every DocType's matches, "More" for the rest. */
function GlobalSearchDialog({ initial, onClose, onOpen }: { initial: string; onClose: () => void; onOpen: (href: string) => void }) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<GlobalResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>("All Results");
  const [exhausted, setExhausted] = useState<Set<string>>(new Set());
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    box.current?.select();
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${PURCHASE_API_PATHS.search}?${new URLSearchParams({ q: q.trim() })}`, { signal: ctl.signal });
        const body = (await res.json()) as { results?: GlobalResult[] };
        setResults(body.results ?? []);
        setCategory("All Results");
        setExhausted(new Set());
      } catch {
        /* a newer search replaced this one */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const groups = useMemo(() => {
    const m = new Map<string, GlobalResult[]>();
    for (const r of results ?? []) m.set(r.doctype, [...(m.get(r.doctype) ?? []), r]);
    return [...m.entries()];
  }, [results]);

  const more = async (doctype: string) => {
    const have = (results ?? []).filter((r) => r.doctype === doctype).length;
    const res = await fetch(`${PURCHASE_API_PATHS.search}?${new URLSearchParams({ q: q.trim(), doctype, start: String(have), limit: "20" })}`);
    const body = (await res.json()) as { results?: GlobalResult[] };
    const extra = body.results ?? [];
    if (extra.length < 20) setExhausted((s) => new Set(s).add(doctype));
    setResults((r) => [...(r ?? []), ...extra]);
  };

  const Result = ({ r }: { r: GlobalResult }) => (
    <li className="py-2">
      <a
        href={r.href}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          onOpen(r.href);
        }}
        className="text-[13px] font-semibold text-gray-900 hover:underline"
      >
        {r.name}
      </a>
      <div className="mt-0.5 line-clamp-2 text-xs text-gray-600" dangerouslySetInnerHTML={{ __html: snippet(r.content, q) }} />
    </li>
  );

  return (
    <Modal title="Search" onClose={onClose} wide>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input ref={box} className="po-field-input pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" aria-label="Searching" />}
      </div>
      {results === null ? (
        <p className="py-10 text-center text-[13px] text-gray-500">Search for anything</p>
      ) : !groups.length ? (
        <p className="py-10 text-center text-[13px] text-gray-500">{loading ? "Searching ..." : "No Results found"}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[11rem_1fr]">
          <ul className="flex flex-row flex-wrap gap-1 text-[13px] md:flex-col">
            {["All Results", ...groups.map(([d]) => d)].map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn("w-full rounded-md px-2.5 py-1.5 text-left", c === category ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50")}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {category === "All Results"
              ? groups.map(([d, rows]) => (
                  <section key={d} className="mb-4">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{d}</h3>
                    <ul className="divide-y divide-gray-100">
                      {rows.slice(0, 3).map((r) => <Result key={`${d}-${r.name}`} r={r} />)}
                    </ul>
                    {rows.length > 3 && (
                      <button type="button" className="mt-1 text-xs font-medium text-brand-700 hover:underline" onClick={() => setCategory(d)}>
                        More...
                      </button>
                    )}
                  </section>
                ))
              : (() => {
                  const rows = groups.find(([d]) => d === category)?.[1] ?? [];
                  return (
                    <section>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</h3>
                      <ul className="divide-y divide-gray-100">
                        {rows.map((r) => <Result key={`${category}-${r.name}`} r={r} />)}
                      </ul>
                      {!exhausted.has(category) && rows.length >= 20 && (
                        <button type="button" className="mt-2 po-btn-secondary text-xs" onClick={() => void more(category)}>
                          More...
                        </button>
                      )}
                    </section>
                  );
                })()}
          </div>
        </div>
      )}
    </Modal>
  );
}
