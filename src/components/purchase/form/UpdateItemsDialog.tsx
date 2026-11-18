"use client";

// "Update Items" on an approved PO (erpnext.utils.update_child_items): the
// rows in a dialog — Item Code, Reqd by date, Qty, Rate, and in each row's
// form UOM and Conversion Factor — where rows may be changed, added and
// removed. The server checks received and billed quantities and recomputes
// the whole PO (transitions.ts, updateOrderItems).
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { itemFetch, uomFactorFetch } from "@/app/purchase/orders/fetches";
import { useForm } from "./context";
import { DateInput, Field, LinkInput, NumberInput, Section } from "./controls";
import { Grid, RowDialog } from "./Grid";

interface Row {
  docname?: string;
  itemCode: string;
  scheduleDate: string;
  uom: string;
  conversionFactor: number;
  qty: number;
  rate: number;
}

export function UpdateItemsDialog({ onClose, onUpdate, busy }: { onClose: () => void; onUpdate: (rows: Row[]) => void; busy: boolean }) {
  const f = useForm();
  const v = f.values;
  const [rows, setRows] = useState<Row[]>(() =>
    v.items.map((r) => ({ docname: r.id, itemCode: r.itemCode, scheduleDate: r.scheduleDate, uom: r.uom, conversionFactor: Number(r.conversionFactor) || 1, qty: Number(r.qty), rate: Number(r.rate) })),
  );
  const [editing, setEditing] = useState<number | null>(null);
  const set = (i: number, x: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...x } : r)));

  async function pickItem(i: number, code: string | null) {
    set(i, { itemCode: code ?? "" });
    if (!code) return;
    const r = await itemFetch(code, { company: v.company, taxCategory: v.taxCategory ?? null, transactionDate: v.transactionDate, setWarehouse: v.setWarehouse ?? null, conversionRate: Number(v.conversionRate) || 1 });
    if (r.ok && r.value) {
      const d = r.value;
      setRows((rs) => rs.map((x, k) => (k === i ? { ...x, uom: x.uom || d.uom, conversionFactor: x.conversionFactor || d.conversionFactor, qty: x.qty || 1, scheduleDate: x.scheduleDate || (v.scheduleDate ?? "") } : x)));
    }
  }

  async function pickUom(i: number, uom: string | null) {
    set(i, { uom: uom ?? "" });
    const row = rows[i];
    if (!uom || !row?.itemCode) return;
    const r = await uomFactorFetch(row.itemCode, uom);
    if (r.ok && r.value) set(i, { conversionFactor: r.value });
  }

  return (
    <RowDialog
      title="Update Items"
      onClose={onClose}
      actions={
        <button type="button" className="po-btn-primary py-1.5" disabled={busy} onClick={() => onUpdate(rows.filter((r) => r.itemCode))}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Update
        </button>
      }
    >
      <Section>
        <Grid
          label="Items"
          rows={rows}
          editable
          onAdd={() => setRows((rs) => [...rs, { itemCode: "", scheduleDate: v.scheduleDate ?? "", uom: "", conversionFactor: 0, qty: 0, rate: 0 }])}
          onDelete={(idx) => setRows((rs) => rs.filter((_, k) => !idx.includes(k)))}
          onEdit={setEditing}
          columns={[
            { key: "item", label: "Item Code", width: "min-w-[220px]", cell: (r, i) => <LinkInput type="item" value={r.itemCode} onChange={(x) => void pickItem(i, x)} disabled={Boolean(r.docname)} /> },
            { key: "date", label: "Reqd by date", required: true, width: "w-36", cell: (r, i) => <DateInput value={r.scheduleDate} onChange={(x) => set(i, { scheduleDate: x ?? "" })} /> },
            { key: "qty", label: "Qty", align: "right", width: "w-28", cell: (r, i) => <NumberInput value={r.qty} onChange={(x) => set(i, { qty: x })} /> },
            { key: "rate", label: "Rate", align: "right", width: "w-36", cell: (r, i) => <NumberInput value={r.rate} trim={false} onChange={(x) => set(i, { rate: x })} /> },
          ]}
        />
      </Section>
      {editing !== null && rows[editing] && (
        <Section title={`Row #${editing + 1}`}>
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <Field label="UOM" required>
              <LinkInput type="uom" params={{ item: rows[editing].itemCode }} value={rows[editing].uom} onChange={(x) => void pickUom(editing, x)} />
            </Field>
            <Field label="Conversion Factor">
              <NumberInput value={rows[editing].conversionFactor} decimals={9} onChange={(x) => set(editing, { conversionFactor: x })} />
            </Field>
          </div>
        </Section>
      )}
    </RowDialog>
  );
}
