// What the New Email dialog starts with for a PO, as Frappe 14's composer set
// it (views/communication.js, setup_subject_and_recipients; ERPNext's buying
// controller sets the PO's email field to contact_email):
//   * To: the PO's contact email;
//   * Subject: the last email's subject with "Re: " before it, or else the
//     PO's title (the supplier's name); always ending "(#PUR-ORD/…)" so a
//     reply can be traced to the PO.
// Also the address lists as the dialog takes them: comma- or line-separated.
// Pure.

export function defaultEmailSubject(number: string, supplierName: string | null, lastSubject: string | null): string {
  let subject = "";
  if (lastSubject) {
    subject = lastSubject;
    if (subject.toLowerCase().split(":")[0].trim() !== "re") subject = `Re: ${subject}`;
  }
  if (!subject) subject = supplierName || number;
  const identifier = `#${number}`;
  return subject.includes(identifier) ? subject : `${subject} (${identifier})`;
}

/** The addresses in a To / CC / BCC field: separated by commas, semicolons or lines; each once. */
export function splitAddresses(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/[,;\n]/)) {
    const s = raw.trim().replace(/^.*<([^>]+)>$/, "$1").trim();
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

/**
 * One plain email address (Frappe's validate_email_address, kept strict): letters, digits and
 * . _ % + ' - before the @, a dotted domain after it. No quotes, comments or brackets, so nothing
 * reaches the mailer's address parser that could be read as another address (nodemailer 8's
 * addressparser advisories).
 */
export const isEmailAddress = (s: string) => /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s) && s.length <= 254;
