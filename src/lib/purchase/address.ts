// How the old site wrote an address and a contact on the PO (the "… Details"
// fields: Supplier Address Details, Shipping Address Details, Billing Address
// Details, Contact Name). India Compliance's address template, checked
// against the stored POs:
//
//   Plot 4, Industrial Estate<br>Phase II<br>Rajkot<br>\nGujarat, State Code: 24<br>
//   PIN Code: 360001<br>India<br>\nGSTIN: 24PQRST5678K1Z2<br>
//
// Pure.

export interface AddressParts {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  gstState?: string | null;
  gstStateNumber?: string | null;
  pincode?: string | null;
  country: string;
  gstin?: string | null;
}

export function addressDisplay(a: AddressParts): string {
  let s = `${a.addressLine1}<br>`;
  if (a.addressLine2) s += `${a.addressLine2}<br>`;
  s += `${a.city}<br>\n`;
  if (a.gstState) s += `${a.gstState}, State Code: ${a.gstStateNumber ?? ""}<br>`;
  if (a.pincode) s += `PIN Code: ${a.pincode}<br>`;
  s += `${a.country}<br>\n`;
  if (a.gstin) s += `GSTIN: ${a.gstin}<br>`;
  return s;
}

/** An address display as lines of text, for the screen. */
export function addressLines(display: string | null | undefined): string[] {
  return String(display ?? "")
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/\n/g, "").trim())
    .filter(Boolean);
}

export interface ContactParts {
  salutation?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
}

/** Contact Name: first, middle and last name, as ERPNext joins them. */
export function contactDisplay(c: ContactParts): string {
  return [c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ");
}

/** Place of Supply: the company's GST state, written as the old site did ("33-Tamil Nadu"). */
export function placeOfSupply(gstStateNumber: string | null | undefined, gstState: string | null | undefined): string | null {
  return gstStateNumber && gstState ? `${gstStateNumber}-${gstState}` : null;
}
