"use client";

// The Item Group Tree (owner, 24-11-2026), as the old site's tree view drew it (frappe.views.TreeView,
// captured 23-11-2026): "Item Group Tree", Collapse All / Expand All, ⋯ (View List, Refresh), New;
// the root "All Item Groups" open, groups as folders, leaves as files, children in name order. A
// click selects a node and shows its buttons: Edit, Add Child (groups only), Delete. Add Child and New
// ask for the new group's name and whether it is a group ("Group Node"), as the old dialog did.
// Rename is not offered here (docs/14 §2).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteDocAction, saveDocAction } from "@/app/purchase/doc-actions";
import { cn } from "@/lib/purchase/cn";
import { ConfirmDialog } from "../form/Grid";
import { CHECKBOX } from "../list/selection";
import { usePopover } from "../ui/usePopover";

export interface TreeNode {
  id: string;
  name: string;
  parent: string | null;
  isGroup: boolean;
}

const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

export function ItemGroupTree({ nodes, basePath, listHref, canWrite }: { nodes: TreeNode[]; basePath: string; listHref: string; canWrite: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const children = useMemo(() => {
    const m = new Map<string, TreeNode[]>();
    for (const n of nodes) {
      const k = n.parent ?? "";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    for (const list of m.values()) list.sort(byName);
    return m;
  }, [nodes]);
  const roots = children.get("") ?? [];
  const [open, setOpen] = useState<Set<string>>(() => new Set(roots.map((r) => r.name)));
  const [selected, setSelected] = useState<string | null>(roots[0]?.name ?? null);
  const [adding, setAdding] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TreeNode | null>(null);
  const menu = usePopover<HTMLDivElement>();
  const groups = nodes.filter((n) => n.isGroup).map((n) => n.name);
  const selectedNode = nodes.find((n) => n.name === selected) ?? null;

  const toggle = (name: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const remove = (n: TreeNode) =>
    start(async () => {
      const r = await deleteDocAction("itemGroups", n.id);
      setConfirm(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Deleted");
      router.refresh();
    });

  const render = (n: TreeNode, depth: number): React.ReactNode => {
    const kids = children.get(n.name) ?? [];
    const isOpen = open.has(n.name);
    const isRoot = n.parent === null;
    return (
      <li key={n.id}>
        <div className={cn("group flex items-center gap-2 rounded-md py-1 pr-2", selected === n.name && "bg-gray-100")} style={{ paddingLeft: depth * 20 + 6 }}>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 text-left text-[13px] text-gray-800"
            onClick={() => {
              setSelected(n.name);
              if (n.isGroup) toggle(n.name);
            }}
          >
            {n.isGroup ? (
              <>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden />}
                {isOpen ? <FolderOpen className="h-4 w-4 text-gray-500" aria-hidden /> : <Folder className="h-4 w-4 text-gray-500" aria-hidden />}
              </>
            ) : (
              <>
                <span className="w-3.5" aria-hidden />
                <FileText className="h-4 w-4 text-gray-400" aria-hidden />
              </>
            )}
            <span className="truncate">{n.name}</span>
          </button>
          {selected === n.name && (
            <span className="ml-2 inline-flex flex-wrap gap-1">
              {!isRoot && <Link href={`${basePath}/${encodeURIComponent(n.id)}`} className="po-btn-secondary px-2 py-0.5 text-xs">Edit</Link>}
              {canWrite && n.isGroup && (
                <button type="button" className="po-btn-secondary px-2 py-0.5 text-xs" onClick={() => setAdding(n.name)}>Add Child</button>
              )}
              {canWrite && !isRoot && (
                <button type="button" className="po-btn-secondary px-2 py-0.5 text-xs" onClick={() => setConfirm(n)}>Delete</button>
              )}
            </span>
          )}
        </div>
        {n.isGroup && isOpen && kids.length > 0 && <ul>{kids.map((k) => render(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-gray-500">Stock › Items and Pricing</nav>
          <h1 className="truncate text-2xl font-bold tracking-tight text-pacific-dark">Item Group Tree</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="po-btn-secondary" onClick={() => setOpen(new Set())}>Collapse All</button>
          <button type="button" className="po-btn-secondary" onClick={() => setOpen(new Set(groups))}>Expand All</button>
          <div ref={menu.ref} className="relative">
            <button type="button" className="po-btn-secondary px-2" title="Menu" aria-label="Menu" aria-expanded={menu.open} onClick={() => menu.setOpen(!menu.open)}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
            {menu.open && (
              <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <Link role="menuitem" href={listHref} className="block px-3 py-1.5 text-[13px] text-gray-800 hover:bg-gray-50">View List</Link>
                <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-[13px] text-gray-800 hover:bg-gray-50" onClick={() => { menu.setOpen(false); router.refresh(); }}>
                  Refresh
                </button>
              </div>
            )}
          </div>
          {canWrite && (
            <button
              type="button"
              className="po-btn-primary"
              onClick={() => setAdding(selectedNode?.isGroup ? selectedNode.name : selectedNode?.parent ?? roots[0]?.name ?? "All Item Groups")}
            >
              <Plus className="h-4 w-4" aria-hidden /> New
            </button>
          )}
        </div>
      </div>
      <section className="po-card min-h-[300px] p-4">
        <ul className={cn(busy && "opacity-60")}>{roots.map((r) => render(r, 0))}</ul>
      </section>
      {adding && <NewNodeDialog parent={adding} onClose={() => setAdding(null)} onDone={(name) => { setAdding(null); setOpen((s) => new Set([...s, adding])); setSelected(name); router.refresh(); }} />}
      {confirm && <ConfirmDialog message={`Permanently delete ${confirm.name}?`} busy={busy} onNo={() => setConfirm(null)} onYes={() => remove(confirm)} />}
    </>
  );
}

/** The tree's "New Item Group" dialog: the name and "Group Node", under the chosen parent. */
function NewNodeDialog({ parent, onClose, onDone }: { parent: string; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const [isGroup, setIsGroup] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const create = () =>
    start(async () => {
      const r = await saveDocAction("itemGroups", { id: null, doc: { __islocal: 1, item_group_name: name.trim(), is_group: isGroup ? 1 : 0, parent_item_group: parent }, modified: null });
      if (!r.ok) return setError(r.error);
      toast.success("Saved");
      onDone(r.value.name);
    });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="New Item Group">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">New Item Group</h2>
          <button type="button" className="text-gray-400 hover:text-gray-700" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-600">New Item Group Name<span className="ml-0.5 text-red-500">*</span></span>
            <input className="po-field-input w-full" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }} />
          </label>
          <label className="flex items-start gap-2 text-[13px] text-gray-700">
            <input type="checkbox" className={cn(CHECKBOX, "mt-0.5")} checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
            <span>
              Group Node
              <span className="block text-xs text-gray-500">Further nodes can be only created under &apos;Group&apos; type nodes</span>
            </span>
          </label>
          <p className="text-xs text-gray-500">Parent: {parent}</p>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button type="button" className="po-btn-primary" disabled={busy || !name.trim()} onClick={create}>{busy ? "Creating…" : "Create New"}</button>
        </div>
      </div>
    </div>
  );
}
