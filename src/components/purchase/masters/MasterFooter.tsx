// The foot of a master's form, as Frappe's timeline ended: who created the
// record and who last edited it, and when ("You" for the signed-in user).
import type { Stamp } from "@/lib/purchase/masters/kit";
import { When } from "../activity/bits";

export function MasterFooter({ created, edited, viewer }: { created: Stamp; edited: Stamp; viewer: string }) {
  return (
    <p className="mt-4 px-1 text-[13px] text-gray-600">
      <Who stamp={created} viewer={viewer} verb="created" />
      {" • "}
      <Who stamp={edited} viewer={viewer} verb="edited" />
    </p>
  );
}

function Who({ stamp, viewer, verb }: { stamp: Stamp; viewer: string; verb: string }) {
  const you = stamp.email && stamp.email.toLowerCase() === viewer.toLowerCase();
  return (
    <span>
      {you ? "You" : <b className="font-semibold text-gray-800">{stamp.by ?? stamp.email ?? "Someone"}</b>} {verb} this <When at={stamp.at} />
    </span>
  );
}
