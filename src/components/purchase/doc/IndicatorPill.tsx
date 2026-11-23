// A document's status pill in Frappe's indicator colours (red, orange, yellow, green, blue, grey),
// as the old lists and forms drew them. Phase II, owner 21-11-2026.

import { cn } from "@/lib/purchase/cn";
import type { IndicatorColour } from "@/lib/purchase/stock/receipt-status";

const COLOURS: Record<IndicatorColour, string> = {
  red: "bg-[#fff0f0] text-[#cc2929]",
  orange: "bg-[#fff1e7] text-[#c05014]",
  yellow: "bg-[#fdf7e3] text-[#a07d00]",
  green: "bg-[#e4f5e9] text-[#16794c]",
  blue: "bg-[#e8f1ff] text-[#2d6fd1]",
  gray: "bg-gray-100 text-gray-700",
};

export function IndicatorPill({ label, colour, className }: { label: string; colour: IndicatorColour; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium", COLOURS[colour], className)}>
      <span aria-hidden>•</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
