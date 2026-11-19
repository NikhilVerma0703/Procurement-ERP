"use client";

// One master record's page: its layout (screens.ts) drawn by MasterForm, with
// the data and actions its server page passes. A screen with a quick entry
// makes new records from its list's dialog, so its "New" goes there. A saved
// record can be renamed (⋯ → Rename), as every one of these doctypes could.
import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/purchase/orders/form-schema";
import type { PillColour } from "@/lib/purchase/masters/list-query";
import type { Values } from "@/lib/purchase/masters/spec";
import { masterNewPath, masterPath, PURCHASE_PATHS, type MasterKey } from "@/lib/purchase/routes";
import { MasterForm } from "./MasterForm";
import { RenameDialog } from "./RenameDialog";
import { screenOf } from "./screens";

export function MasterScreen({ master, recordId, isNew, initial, title, indicator, editable, save, remove, slots, footer, returnTo, menu, actions, intro }: {
  master: MasterKey;
  /** The saved record's id (for Rename). */
  recordId?: string;
  isNew: boolean;
  initial: Values;
  title: string;
  indicator?: { label: string; colour: PillColour } | null;
  editable: boolean;
  save: (values: Values) => Promise<ActionResult<{ id: string; notices?: string[] }>>;
  remove?: () => Promise<ActionResult>;
  slots?: Record<string, ReactNode>;
  footer?: ReactNode;
  /** After a new record's first save, go back here (the supplier an address was made from). */
  returnTo?: string | null;
  menu?: { label: string; run: () => void; danger?: boolean }[];
  /** Buttons beside Save (an item template's View and Create). */
  actions?: ReactNode;
  intro?: ReactNode;
}) {
  const screen = screenOf(master);
  const list = PURCHASE_PATHS[master];
  const [renaming, setRenaming] = useState(false);
  const name = typeof initial._name === "string" ? initial._name : null;
  const titleField = screen.renameTitle;
  return (
    <>
      <MasterForm
        spec={screen.spec}
        initial={initial}
        isNew={isNew}
        title={title}
        crumbs={[{ label: "Buying" }, { label: screen.spec.doctype, href: list }]}
        indicator={indicator}
        editable={editable}
        onSave={save}
        onDelete={remove}
        recordHref={(id) => masterPath(master, id)}
        newHref={screen.quick ? `${list}?new=1` : masterNewPath(master)}
        listHref={list}
        slots={slots}
        footer={footer}
        onFieldChange={screen.trigger}
        afterCreateHref={returnTo ? () => returnTo : undefined}
        menu={[...(menu ?? []), ...(!isNew && editable && recordId && name ? [{ label: "Rename", run: () => setRenaming(true) }] : [])]}
        actions={actions}
        intro={intro}
      />
      {renaming && recordId && name && (
        <RenameDialog
          master={master}
          id={recordId}
          doctype={screen.spec.doctype}
          name={name}
          title={titleField ? { label: titleField.label, value: String(initial[titleField.key] ?? "") } : null}
          onClose={() => setRenaming(false)}
        />
      )}
    </>
  );
}
