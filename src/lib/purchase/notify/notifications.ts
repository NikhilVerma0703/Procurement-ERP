// The old site's three PO email notifications (docs/reference/erpnext-setup/
// po_setup.json, its Notification records), and how Frappe 14 picked their
// recipients (email/doctype/notification/notification.py, get_list_of_recipients;
// frappe/utils/user.py, get_info_based_on_role):
//   * "Purchase Order {{doc.name}} Is Save" — a new PO (state Created):
//     "Purchase Order PUR-ORD/… Is Created", to every enabled user holding the
//     role Request Dept Head, Store Head, Purchase Head or Admin;
//   * "Purchase Order {{doc.name}} Is Submit" — on approval: "Purchase Order
//     PUR-ORD/… Is Submit", to Store Head, Request Dept Head, Purchase Head,
//     Admin and Supplier;
//   * "Purchase order approved" — on approval: "Purchase Order PUR-ORD/… has been
//     approved", to the PO's creator and its contact email (the supplier's contact).
// No print was attached. Each list is de-duplicated (Frappe's set()); the
// Administrator's and Guest's placeholder addresses are never mailed. Pure.
import { isEmailAddress } from "./compose";

export type NotifyEvent = "New" | "Submit";

export interface NotificationDef {
  name: string;
  event: NotifyEvent;
  /** The PO's workflow state the notification asks for (its condition). */
  state: "Created" | "Approved";
  subject: (number: string) => string;
  message: (number: string) => string;
  /** Every enabled user holding one of these roles. */
  roles: string[];
  /** The PO's own fields holding an email: its creator, its contact. */
  fields: ("owner" | "contact_email")[];
}

export const NOTIFICATIONS: readonly NotificationDef[] = [
  {
    name: "Purchase Order {{doc.name}} Is Save",
    event: "New",
    state: "Created",
    subject: (n) => `Purchase Order ${n} Is Created`,
    message: (n) => `New Purchase Order ${n} Is Created`,
    roles: ["Request Dept Head", "Store Head", "Purchase Head", "Admin"],
    fields: [],
  },
  {
    name: "Purchase Order {{doc.name}} Is Submit",
    event: "Submit",
    state: "Approved",
    subject: (n) => `Purchase Order ${n} Is Submit`,
    message: (n) => `New Purchase Order ${n} Is Submit`,
    roles: ["Store Head", "Request Dept Head", "Purchase Head", "Admin", "Supplier"],
    fields: [],
  },
  {
    name: "Purchase order approved",
    event: "Submit",
    state: "Approved",
    subject: (n) => `Purchase Order ${n} has been approved`,
    message: () => "Purchase order is approved",
    roles: [],
    fields: ["owner", "contact_email"],
  },
];

export interface NotifyContext {
  number: string;
  /** "Created", "Approved", "Rejected". */
  workflowState: string;
  /** Who created the PO (an email). */
  owner: string | null;
  contactEmail: string | null;
}

export interface RoleUser {
  email: string;
  enabled: boolean;
  roles: string[];
}

const NEVER = new Set(["admin@example.com", "guest@example.com"]);

/** The notifications an event sends for a PO in its current state. */
export const dueNotifications = (event: NotifyEvent, ctx: NotifyContext) => NOTIFICATIONS.filter((n) => n.event === event && n.state === ctx.workflowState);

/** Who a notification goes to, each address once, in the order found. */
export function recipientsFor(def: NotificationDef, ctx: NotifyContext, users: readonly RoleUser[]): string[] {
  const out: string[] = [];
  const add = (e: string | null | undefined) => {
    for (const part of String(e ?? "").split(/[,\n]/)) {
      const s = part.trim();
      if (s && isEmailAddress(s) && !NEVER.has(s.toLowerCase()) && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    }
  };
  for (const field of def.fields) add(field === "owner" ? ctx.owner : ctx.contactEmail);
  for (const role of def.roles) for (const u of users) if (u.enabled && u.roles.includes(role)) add(u.email);
  return out;
}
