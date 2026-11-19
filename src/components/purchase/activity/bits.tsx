"use client";

// Small pieces the PO's sidebar and timeline share: a time as the old timeline
// wrote it ("1 week ago", the date and time on hover), a user's initials in a
// circle (Frappe's avatar), and a timeline line's text with its bold names
// and file links.
import { Lock } from "lucide-react";
import { formatDateTime, timeAgo } from "@/lib/purchase/format";
import type { Run } from "@/lib/purchase/orders/timeline";

export function When({ at }: { at: string }) {
  return (
    <time dateTime={at} title={formatDateTime(at)} suppressHydrationWarning>
      {timeAgo(at)}
    </time>
  );
}

const initials = (name: string) =>
  name
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600" aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.lock ? (
          <Lock key={i} className="ml-1 inline h-3 w-3 align-[-1px] text-amber-500" aria-label="Private" />
        ) : r.href ? (
          <a key={i} href={r.href} target="_blank" rel="noopener noreferrer" className="text-gray-800 underline-offset-2 hover:underline">
            {r.text}
          </a>
        ) : r.bold ? (
          <b key={i} className="font-semibold text-gray-800">
            {r.text}
          </b>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}
