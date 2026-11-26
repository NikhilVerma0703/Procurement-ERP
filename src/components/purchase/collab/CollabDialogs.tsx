"use client";

// Actions › Assign To ("Add to ToDo") and Actions › Add Tags, as Frappe 14.101.1 drew them (assign_to.js,
// list_view.js add_tags; owner, 26-11-2026: "Build all of them"); and the row's assignee avatars
// (frappe.avatar_group: up to three, then "+n"; a click filters the list by that user).
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { addTagsAction, assignableUsersAction, assignAction, tagSuggestionsAction } from "@/app/purchase/collab-actions";
import { cn } from "@/lib/purchase/cn";
import { Modal } from "../list/BulkDialogs";

const INPUT = "w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] text-gray-900";
const LABEL = "mb-1 block text-xs text-gray-600";

/** Pills for the chosen values, and a box that suggests more (Frappe's MultiSelectPills). */
function PillsInput({ values, onChange, options, onQuery, placeholder, free }: {
  values: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string; description?: string }[];
  onQuery?: (q: string) => void;
  placeholder?: string;
  /** Typed text is a value of its own (tags). */
  free?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const shown = options.filter((o) => !values.includes(o.value) && (!q || `${o.label} ${o.description ?? ""}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 20);
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setQ("");
  };
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div className="relative">
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800">
              {labelOf(v)}
              <button type="button" aria-label={`Remove ${labelOf(v)}`} className="text-gray-400 hover:text-gray-700" onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className={INPUT}
        value={q}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          onQuery?.(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (shown[0] && (!free || !q.trim())) add(shown[0].value);
            else if (free) add(q);
          }
        }}
      />
      {open && (shown.length > 0 || (free && q.trim())) && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {shown.map((o) => (
            <button key={o.value} type="button" className="block w-full px-3 py-1.5 text-left hover:bg-gray-50" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.value)}>
              <span className="block text-[13px] text-gray-900">{o.label}</span>
              {o.description && <span className="block text-[11px] text-gray-500">{o.description}</span>}
            </button>
          ))}
          {free && q.trim() && !shown.some((o) => o.value === q.trim()) && (
            <button type="button" className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50" onMouseDown={(e) => e.preventDefault()} onClick={() => add(q)}>
              {q.trim()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "Add to ToDo": Assign to me, Assign To, Complete By, Priority, Comment; Add. */
export function AssignToDialog({ doctype, ids, viewer, onDone, onClose }: { doctype: string; ids: string[]; viewer: string; onDone: () => void; onClose: () => void }) {
  const [users, setUsers] = useState<{ email: string; name: string }[]>([]);
  const [assignTo, setAssignTo] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void assignableUsersAction(doctype).then((r) => r.ok && setUsers(r.value));
  }, [doctype]);
  const me = assignTo.includes(viewer);
  const options = useMemo(() => users.map((u) => ({ value: u.email, label: u.name || u.email, description: u.name ? u.email : undefined })), [users]);

  const add = async () => {
    if (!assignTo.length) return setMissing(true);
    setBusy(true);
    try {
      const r = await assignAction(doctype, ids, { assignTo, date: date || null, priority, description: comment || null });
      if (!r.ok) return void toast.error(r.error);
      if (r.value.duplicates.length) toast(`Already in the following Users ToDo list:${r.value.duplicates.join(", ")}`);
      onDone();
    } catch {
      toast.error("The server could not be reached. Refresh to see what was saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add to ToDo"
      onClose={onClose}
      footer={
        <button type="button" className="po-btn-primary" disabled={busy} onClick={() => void add()}>
          Add
        </button>
      }
    >
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-[13px] text-gray-800">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-gray-300"
            checked={me}
            onChange={(e) => setAssignTo(e.target.checked ? [...assignTo.filter((x) => x !== viewer), viewer] : assignTo.filter((x) => x !== viewer))}
          />
          Assign to me
        </label>
        <div>
          <span className={cn(LABEL, missing && !assignTo.length && "text-red-600")}>Assign To</span>
          <PillsInput values={assignTo} onChange={(v) => { setAssignTo(v); setMissing(false); }} options={options} />
          {missing && !assignTo.length && <p className="mt-1 text-xs text-red-600">Missing Values Required: Assign To</p>}
        </div>
        <label className="block">
          <span className={LABEL}>Complete By</span>
          <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>Priority</span>
          <select className={INPUT} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["Low", "Medium", "High"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Comment</span>
          <textarea className={cn(INPUT, "h-24")} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={10000} />
        </label>
      </div>
    </Modal>
  );
}

/** "Add Tags": Tags (the tags in use suggested, a new one typed); Add. */
export function AddTagsDialog({ doctype, ids, onDone, onClose }: { doctype: string; ids: string[]; onDone: () => void; onClose: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const query = (q: string) => void tagSuggestionsAction(doctype, q).then((r) => r.ok && setKnown(r.value));
  useEffect(() => query(""), [doctype]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    if (!tags.length) return;
    setBusy(true);
    try {
      const r = await addTagsAction(doctype, ids, tags);
      if (!r.ok) return void toast.error(r.error);
      onDone();
    } catch {
      toast.error("The server could not be reached. Refresh to see what was saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Add Tags"
      onClose={onClose}
      footer={
        <button type="button" className="po-btn-primary" disabled={busy || !tags.length} onClick={() => void add()}>
          Add
        </button>
      }
    >
      <span className={LABEL}>Tags</span>
      <PillsInput values={tags} onChange={setTags} options={known.map((t) => ({ value: t, label: t }))} onQuery={query} free />
    </Modal>
  );
}

const PALETTE = ["bg-blue-100 text-blue-800", "bg-green-100 text-green-800", "bg-amber-100 text-amber-800", "bg-purple-100 text-purple-800", "bg-pink-100 text-pink-800", "bg-cyan-100 text-cyan-800"];
const initials = (name: string) => {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
};
const colourOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

/** The row's assignees: up to three avatars, then "+n"; each filters the list by its user. */
export function Assignees({ people, onFilter }: { people: { email: string; name: string }[]; onFilter?: (email: string) => void }) {
  if (!people.length) return null;
  const shown = people.slice(0, 3);
  return (
    <span className="relative z-10 inline-flex items-center -space-x-1.5">
      {shown.map((p) => (
        <button
          key={p.email}
          type="button"
          title={p.name || p.email}
          className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold", colourOf(p.email))}
          onClick={() => onFilter?.(p.email)}
        >
          {initials(p.name || p.email)}
        </button>
      ))}
      {people.length > 3 && (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-gray-100 px-1 text-[10px] font-semibold text-gray-700" title={people.slice(3).map((p) => p.name || p.email).join(", ")}>
          +{people.length - 3}
        </span>
      )}
    </span>
  );
}

/** A row's tags (Show Tags): the first two, as get_tags_html showed them. */
export function TagPills({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-gray-400">-</span>;
  return (
    <span className="flex min-w-0 gap-1">
      {tags.slice(0, 2).map((t) => (
        <span key={t} className="truncate rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700" title={t}>
          {t}
        </span>
      ))}
    </span>
  );
}
