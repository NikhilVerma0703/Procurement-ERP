"use client";

// Stock Ageing's chart (owner, 24-11-2026), as the old report drew it above its table (get_chart_data):
// a bar for each of the ten items held longest, by Average Age in days. One series, so no legend: the
// title says what is plotted; each bar's value and full item name show on hover or focus, and every
// figure is in the table below. Frappe's blue (--blue-500, #2490ef); thin columns with rounded tops
// from one baseline, hairline gridlines at round ticks.

import { useState } from "react";
import { formatFloat, formatNumber } from "@/lib/purchase/format";

const BAR = "#2490ef";

/** Round axis ticks from 0 past the largest value (1, 2, 2.5 or 5 × a power of ten). */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export function AgeingChart({ labels, values }: { labels: string[]; values: number[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (!labels.length) return null;
  const axis = ticks(Math.max(...values));
  const top = axis[axis.length - 1] || 1;
  return (
    <figure className="border-b border-gray-200 px-4 py-4" aria-label="Average Age of the ten items held longest">
      <figcaption className="mb-3 text-[13px] font-medium text-gray-700">Average Age <span className="font-normal text-gray-500">(days)</span></figcaption>
      <div className="flex gap-2">
        {/* y-axis */}
        <div className="relative h-48 w-10 shrink-0 text-right text-[11px] text-gray-500" aria-hidden>
          {axis.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%`, transform: "translateY(50%)" }}>
              {formatNumber(t, 0)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            {axis.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-gray-200" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
            ))}
            <div className="absolute inset-0 flex items-end">
              {values.map((v, i) => (
                <div
                  key={`${labels[i]}-${i}`}
                  className="relative flex h-full flex-1 items-end justify-center outline-none"
                  tabIndex={0}
                  role="img"
                  aria-label={`${labels[i]}: ${formatFloat(v)} days`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <div className="w-full max-w-[24px] rounded-t-[4px]" style={{ height: `${(v / top) * 100}%`, background: BAR, opacity: active === null || active === i ? 1 : 0.55 }} />
                  {active === i && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-[240px] -translate-x-1/2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] shadow-md">
                      <div className="font-medium text-gray-900">{labels[i]}</div>
                      <div className="text-gray-600">Average Age: {formatFloat(v)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex" aria-hidden>
            {labels.map((l, i) => (
              <div key={`${l}-${i}`} className="min-w-0 flex-1 truncate px-0.5 text-center text-[11px] text-gray-500" title={l}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
