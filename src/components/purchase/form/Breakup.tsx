"use client";

// The two read-only breakups under Totals, built from the figures as the old
// site rendered them on save: Tax Breakup (ERPNext's itemised taxes, grouped
// by HSN/SAC since GST Settings had HSN-wise breakup on: taxable amount and,
// per tax account, rate and amount) and GST Breakup (India Compliance: per
// HSN/SAC, the taxable value and each GST head's rate and amount).
import { formatCurrency, formatNumber } from "@/lib/purchase/format";
import { useForm } from "./context";

const rate = (x: number) => `${Number.isInteger(x) ? formatNumber(x, 0) : formatNumber(x, 3)}%`;

export function TaxBreakup() {
  const f = useForm();
  const fig = f.figures;
  if (!fig || !fig.taxes.some((t) => Object.keys(t.itemWiseTaxDetail).length)) return <p className="text-xs text-gray-500">No taxes.</p>;
  const m = (x: number) => formatCurrency(x, f.money.doc);
  const keyOf = (i: number) => f.rowInfo[i]?.gstHsnCode || fig.items[i].itemCode || fig.items[i].itemName || "";
  const groups = new Map<string, { taxable: number; itemKeys: Set<string> }>();
  fig.items.forEach((row, i) => {
    const g = groups.get(keyOf(i)) ?? { taxable: 0, itemKeys: new Set<string>() };
    g.taxable += row.netAmount;
    g.itemKeys.add(row.itemCode || row.itemName || "");
    groups.set(keyOf(i), g);
  });
  const taxes = fig.taxes.filter((t) => Object.keys(t.itemWiseTaxDetail).length);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border border-gray-200 text-[12px]">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="border-b border-gray-200 px-2 py-1.5 text-left font-medium">HSN/SAC</th>
            <th className="border-b border-l border-gray-200 px-2 py-1.5 text-right font-medium">Taxable Amount</th>
            {taxes.map((t) => (
              <th key={t.idx} className="border-b border-l border-gray-200 px-2 py-1.5 text-right font-medium">{t.accountHead}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...groups].map(([key, g]) => (
            <tr key={key}>
              <td className="border-b border-gray-100 px-2 py-1.5">{key}</td>
              <td className="border-b border-l border-gray-100 px-2 py-1.5 text-right">{m(g.taxable)}</td>
              {taxes.map((t) => {
                let r = 0;
                let amount = 0;
                for (const k of g.itemKeys) {
                  const d = t.itemWiseTaxDetail[k];
                  if (d) {
                    r = d[0];
                    amount += d[1];
                  }
                }
                return (
                  <td key={t.idx} className="border-b border-l border-gray-100 px-2 py-1.5 text-right">
                    {r ? `(${rate(r)}) ` : ""}
                    {m(amount)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HEADS = [
  { key: "cgst", label: "CGST" },
  { key: "sgst", label: "SGST" },
  { key: "igst", label: "IGST" },
  { key: "cess", label: "CESS" },
] as const;

export function GstBreakup() {
  const f = useForm();
  const fig = f.figures;
  if (!fig) return null;
  const m = (x: number) => formatCurrency(x, f.money.base);
  const groups = new Map<string, { taxable: number; heads: Record<string, { rate: number; amount: number }> }>();
  fig.items.forEach((row, i) => {
    const key = f.rowInfo[i]?.gstHsnCode || "";
    const g = groups.get(key) ?? { taxable: 0, heads: {} };
    g.taxable += row.taxableValue;
    for (const h of HEADS) {
      const amount = row.gst[`${h.key}_amount`] ?? 0;
      const r = row.gst[`${h.key}_rate`] ?? 0;
      if (!amount && !r) continue;
      const cur = g.heads[h.key] ?? { rate: r, amount: 0 };
      cur.amount += amount;
      g.heads[h.key] = cur;
    }
    groups.set(key, g);
  });
  const used = HEADS.filter((h) => [...groups.values()].some((g) => g.heads[h.key]));
  if (!used.length) return <p className="text-xs text-gray-500">No GST.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border border-gray-200 text-[12px]">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="border-b border-gray-200 px-2 py-1.5 text-left font-medium">HSN/SAC</th>
            <th className="border-b border-l border-gray-200 px-2 py-1.5 text-right font-medium">Taxable Value</th>
            {used.map((h) => (
              <th key={h.key} className="border-b border-l border-gray-200 px-2 py-1.5 text-right font-medium">{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...groups].map(([key, g]) => (
            <tr key={key || "-"}>
              <td className="border-b border-gray-100 px-2 py-1.5">{key}</td>
              <td className="border-b border-l border-gray-100 px-2 py-1.5 text-right">{m(g.taxable)}</td>
              {used.map((h) => (
                <td key={h.key} className="border-b border-l border-gray-100 px-2 py-1.5 text-right">
                  {g.heads[h.key] ? `(${rate(g.heads[h.key].rate)}) ${m(g.heads[h.key].amount)}` : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
