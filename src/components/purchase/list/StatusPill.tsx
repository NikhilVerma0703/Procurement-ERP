import Link from "next/link";
import { cn } from "@/lib/purchase/cn";

// The list's Status column shows the PO's workflow state, coloured by the old
// site's Workflow State styles: Approved "Success" (green), Rejected "Danger"
// (red), Created with no style (grey). A cancelled PO keeps the state it had,
// as it did on the old site. Clicking the pill filters the list by it.

const COLOURS = {
  green: "bg-[#e4f5e9] text-[#16794c]",
  red: "bg-[#fff0f0] text-[#cc2929]",
  gray: "bg-gray-100 text-gray-700",
} as const;

export const WORKFLOW_COLOUR: Record<string, keyof typeof COLOURS> = { Approved: "green", Rejected: "red", Created: "gray" };

const DOCSTATUS_TITLE: Record<string, string> = {
  Draft: "Document is in draft state",
  Submitted: "Document has been submitted",
  Cancelled: "Document has been cancelled",
};

export function StatusPill({ label, docStatus, href }: { label: string; docStatus: string; href?: string }) {
  const className = cn(
    "relative z-10 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium",
    COLOURS[WORKFLOW_COLOUR[label] ?? "gray"],
    href && "hover:opacity-80",
  );
  const body = (
    <>
      <span aria-hidden>•</span>
      <span className="truncate">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className={className} title={DOCSTATUS_TITLE[docStatus]} scroll={false}>
      {body}
    </Link>
  ) : (
    <span className={className} title={DOCSTATUS_TITLE[docStatus]}>
      {body}
    </span>
  );
}
