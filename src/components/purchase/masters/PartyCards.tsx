// A party's addresses and contacts, as the Address & Contact tab of its
// ERPNext form listed them (address_list.html, contact_list.html): each with
// its tags and an Edit button, "No address added yet." when there is none,
// then New Address / New Contact, which open a new one linked to the party
// and come back here after its first save.
import Link from "next/link";
import { addressLines } from "@/lib/purchase/address";
import type { AddressCard, ContactCard } from "@/lib/purchase/masters/parties";
import { masterNewPath, masterPath } from "@/lib/purchase/routes";

const tag = (t: string) => <span className="font-normal text-gray-500"> ({t})</span>;

export function PartyCards({ addresses, contacts, link, back, canAdd }: {
  addresses: AddressCard[];
  contacts: ContactCard[];
  /** The party new addresses and contacts are linked to. */
  link: { doctype: string; name: string };
  /** The party's page, to come back to. */
  back: string;
  canAdd: boolean;
}) {
  const prefill = { link_doctype: link.doctype, link_name: link.name, return: back };
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        {addresses.map((a, i) => (
          <div key={a.id} className="mb-3 rounded-md border border-gray-200 p-3 text-[13px]">
            <div className="mb-1 flex items-start gap-2">
              <p className="flex-1 font-semibold text-gray-900">
                {i + 1}. {a.title}
                {a.type && a.type !== "Other" && tag(a.type)}
                {a.primary && tag("Primary")}
                {a.shipping && tag("Shipping")}
              </p>
              <Link href={masterPath("addresses", a.id)} className="po-btn-secondary px-2 py-0.5 text-xs">
                Edit
              </Link>
            </div>
            <p className="text-gray-700">
              {addressLines(a.display).map((l, j) => (
                <span key={j} className="block">
                  {l}
                </span>
              ))}
            </p>
          </div>
        ))}
        {!addresses.length && <p className="mb-3 text-xs text-gray-500">No address added yet.</p>}
        {canAdd && (
          <Link href={masterNewPath("addresses", prefill)} className="po-btn-secondary px-2 py-1 text-xs">
            New Address
          </Link>
        )}
      </div>
      <div>
        {contacts.map((c) => (
          <div key={c.id} className="mb-3 rounded-md border border-gray-200 p-3 text-[13px]">
            <div className="mb-1 flex items-start gap-2">
              <p className="flex-1 font-semibold text-gray-900">
                {c.name}
                {c.primary && tag("Primary")}
                {c.designation && <span className="font-normal text-gray-500"> – {c.designation}</span>}
              </p>
              <Link href={masterPath("contacts", c.id)} className="po-btn-secondary px-2 py-0.5 text-xs">
                Edit
              </Link>
            </div>
            <div className="space-y-0.5 text-gray-700">
              {c.phone && <Line label="Phone" value={c.phone} href={`tel:${c.phone}`} primary />}
              {c.mobileNo && <Line label="Mobile No" value={c.mobileNo} href={`tel:${c.mobileNo}`} primary />}
              {c.otherPhones.map((p, j) => (
                <Line key={`p${j}`} label="Phone" value={p} href={`tel:${p}`} />
              ))}
              {c.emailId && <Line label="Email" value={c.emailId} href={`mailto:${c.emailId}`} primary />}
              {c.otherEmails.map((e, j) => (
                <Line key={`e${j}`} label="Email" value={e} href={`mailto:${e}`} />
              ))}
            </div>
          </div>
        ))}
        {!contacts.length && <p className="mb-3 text-xs text-gray-500">No contacts added yet.</p>}
        {canAdd && (
          <Link href={masterNewPath("contacts", prefill)} className="po-btn-secondary px-2 py-1 text-xs">
            New Contact
          </Link>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, href, primary }: { label: string; value: string; href: string; primary?: boolean }) {
  return (
    <p>
      {label}:{" "}
      <a href={href} className="text-gray-800 hover:underline">
        {value}
      </a>
      {primary && <span className="text-gray-500"> (Primary)</span>}
    </p>
  );
}
