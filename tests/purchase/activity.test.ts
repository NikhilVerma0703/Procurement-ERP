// Step 8: a PO's timeline, comments and attachments — the rules that need no
// database: ERPNext 14's timeline wording (versions, workflow, status labels,
// attachments, notifications), its "x ago" times, stored file names, and who
// may comment and attach.
import { describe, expect, it } from "vitest";
import { purchaseCan } from "@/lib/purchase/access";
import { timeAgo } from "@/lib/purchase/format";
import { defaultEmailSubject, isEmailAddress, splitAddresses } from "@/lib/purchase/notify/compose";
import { dueNotifications, NOTIFICATIONS, recipientsFor, type NotifyContext } from "@/lib/purchase/notify/notifications";
import { cleanFileName, withSuffix } from "@/lib/purchase/orders/attachment-names";
import { buildTimeline, timelineValue, versionLines, type Run, type TimelineEvent } from "@/lib/purchase/orders/timeline";

const text = (runs: Run[]) => runs.map((r) => (r.lock ? "🔒" : r.text)).join("");
const lines = (data: unknown) => versionLines(data, "Thiru R").map(text);
const at = (iso: string) => new Date(iso);

function ev(o: Partial<TimelineEvent> & Pick<TimelineEvent, "kind" | "at">): TimelineEvent {
  return { id: `${o.kind}-${o.at.toISOString()}`, source: "Comment", byEmail: "stores@example.com", subject: null, content: null, data: null, ...o };
}

describe("version lines (version_timeline_content_builder.js)", () => {
  it("names the first three visible fields and stops, so a late docstatus change is not reached", () => {
    // 02510's approval: Workflow State is hidden, docstatus comes last.
    const data = {
      changed: [
        ["workflow_state", "Created", "Approved"],
        ["base_grand_total", "₹ 415,800.50", "₹ 415,799.50"],
        ["base_rounding_adjustment", "₹ -0.50", "₹ 0.50"],
        ["grand_total", "₹ 415,800.50", "₹ 415,799.50"],
        ["rounding_adjustment", "₹ -0.50", "₹ 0.50"],
        ["status", "Draft", "To Receive and Bill"],
        ["docstatus", 0, 1],
      ],
    };
    expect(lines(data)).toEqual([
      "Thiru R changed value of Grand Total (Company Currency) from ₹ 415,800.50 to ₹ 415,799.50, Rounding Adjustment (Company Currency) from ₹ -0.50 to ₹ 0.50, Grand Total from ₹ 415,800.50 to ₹ 415,799.50",
    ]);
  });

  it("says who submitted or cancelled when the docstatus change comes first", () => {
    expect(lines({ changed: [["docstatus", 0, 1], ["status", "Draft", "To Bill"]] })).toEqual(["Thiru R submitted this document", "Thiru R changed value of Status from Draft to To Bill"]);
    expect(lines({ changed: [["docstatus", 1, 2]] })).toEqual(["Thiru R cancelled this document"]);
  });

  it("row changes say the row; added and removed rows name the table once per row", () => {
    expect(lines({ row_changed: [["items", 0, "r1", [["item_tax_template", "", "GST 18% - PESPL"], ["amount", 1, 2]]]] })).toEqual([
      'Thiru R changed values for Item Tax Template from "" to GST 18% - PESPL in row #1, Final Amount from 1 to 2 in row #1',
    ]);
    expect(lines({ added: [["items", {}], ["items", {}]], removed: [["taxes", {}]] })).toEqual(["Thiru R added rows for Items, Items", "Thiru R removed rows for Purchase Taxes and Charges"]);
  });

  it("never names a hidden or unknown field, and says nothing when only those changed", () => {
    expect(lines({ changed: [["workflow_state", "Created", "Approved"], ["no_such_field", 1, 2]] })).toEqual([]);
    expect(lines({ row_changed: [["taxes", 0, "t1", [["item_wise_tax_detail", "{}", "{\"x\":1}"]]]] })).toEqual([]);
  });

  it("shows a value as text, cut at 40 characters, and an empty one as \"\"", () => {
    expect(timelineValue("<div><b>HSN/SAC</b>Taxable</div>")).toEqual({ text: "HSN/SACTaxable", bold: true });
    expect(timelineValue("x".repeat(45)).text).toBe(`${"x".repeat(40)}...`);
    expect(timelineValue(null).text).toBe('""');
    expect(timelineValue("").text).toBe('""');
    expect(timelineValue(0).text).toBe("0");
  });

  it("adds the updater when another document made the change", () => {
    expect(lines({ changed: [["status", "To Receive and Bill", "To Bill"]], updater_reference: { doctype: "Purchase Receipt" } })).toEqual([
      "Thiru R changed value of Status from To Receive and Bill to To Bill via Purchase Receipt",
    ]);
  });
});

describe("the timeline", () => {
  const nameOf = (e: string) => ({ "stores@example.com": "Thiru R", "a@example.com": "Althaf" })[e] ?? e;

  it("is newest first, workflow before the version and the status label of the same moment", () => {
    const items = buildTimeline(
      [
        ev({ kind: "LABEL", at: at("2026-11-07T06:21:26.107Z"), content: "To Receive and Bill" }),
        ev({ kind: "VERSION", source: "Version", at: at("2026-11-07T06:21:26.477Z"), data: { changed: [["status", "Draft", "To Receive and Bill"]] } }),
        ev({ kind: "WORKFLOW", at: at("2026-11-07T06:21:26.483Z"), content: "Approved" }),
      ],
      { nameOf },
    );
    expect(items.map((i) => (i.type === "line" ? text(i.runs) : i.type))).toEqual([
      "Thiru R Approved",
      "Thiru R changed value of Status from Draft to To Receive and Bill",
      "Thiru R To Receive and Bill",
    ]);
    expect(items[0]).toMatchObject({ type: "line", icon: "workflow" });
  });

  it("shows only the newest 10 versions", () => {
    const versions = Array.from({ length: 12 }, (_, i) => ev({ kind: "VERSION", source: "Version", at: new Date(Date.UTC(2026, 0, 1 + i)), data: { changed: [["status", "A", `S${i}`]] } }));
    const items = buildTimeline(versions, { nameOf });
    expect(items).toHaveLength(10);
    expect(text((items[9] as { runs: Run[] }).runs)).toContain("S2");
  });

  it("links an attached file while it is attached, with the lock of a private one", () => {
    const added = ev({ kind: "ATTACHMENT", at: at("2025-08-29T12:09:40Z"), content: 'Added <a href="/private/files/PACIFIC%20ENGINEERED.pdf" target="_blank">PACIFIC ENGINEERED.pdf</a> <i class="fa fa-lock text-warning"></i>' });
    const removed = ev({ kind: "ATTACHMENT", subject: "Attachment Removed", at: at("2025-08-30T10:00:00Z"), content: "Removed PACIFIC ENGINEERED.pdf" });
    const items = buildTimeline([added, removed], { nameOf, fileHref: (u) => (u === "/private/files/PACIFIC ENGINEERED.pdf" ? "/api/purchase/attachments/a1" : null) });
    expect(items.map((i) => (i.type === "line" ? [i.icon, text(i.runs)] : null))).toEqual([
      ["remove", "Thiru R Removed PACIFIC ENGINEERED.pdf"],
      ["upload", "Thiru R Added PACIFIC ENGINEERED.pdf🔒"],
    ]);
    expect((items[1] as { runs: Run[] }).runs.find((r) => r.href)?.href).toBe("/api/purchase/attachments/a1");
  });

  it("shows the old site's emails as notifications, to the recipients by name", () => {
    const [mail] = buildTimeline(
      [ev({ kind: "EMAIL", source: "Communication", at: at("2024-09-20T04:39:11Z"), subject: "Purchase Order X has been approved", content: "Purchase order is approved", data: { recipients: "a@example.com, b@example.com", cc: null } })],
      { nameOf },
    );
    expect(mail).toMatchObject({ type: "email", automated: true, to: ["Althaf", "b@example.com"], html: "Purchase order is approved" });
  });

  it("keeps comments as cards with their author", () => {
    const [c] = buildTimeline([ev({ kind: "COMMENT", at: at("2025-07-12T10:33:05Z"), byEmail: "a@example.com", content: "<p>1 Drum - 30 KGS</p>" })], { nameOf });
    expect(c).toMatchObject({ type: "comment", byName: "Althaf", byEmail: "a@example.com", html: "<p>1 Drum - 30 KGS</p>" });
  });
});

describe("times as the old timeline wrote them (prettyDate)", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const ago = (seconds: number) => timeAgo(new Date(now.getTime() - seconds * 1000), now);
  it("from just now to years", () => {
    expect(ago(30)).toBe("just now");
    expect(ago(90)).toBe("1 minute ago");
    expect(ago(600)).toBe("10 minutes ago");
    expect(ago(5400)).toBe("1 hour ago");
    expect(ago(3 * 3600)).toBe("3 hours ago");
    expect(ago(86400 * 1.5)).toBe("yesterday");
    expect(ago(86400 * 4)).toBe("4 days ago");
    expect(ago(86400 * 10)).toBe("1 week ago");
    expect(ago(86400 * 20)).toBe("2 weeks ago");
    expect(ago(86400 * 40)).toBe("1 month ago");
    expect(ago(86400 * 200)).toBe("6 months ago");
    expect(ago(86400 * 400)).toBe("1 year ago");
    expect(ago(86400 * 800)).toBe("2 years ago");
    expect(timeAgo(new Date(now.getTime() + 60000), now)).toBe("");
  });
});

describe("attachments", () => {
  it("are stored under their base name, cleaned and at most 140 characters", () => {
    expect(cleanFileName("C:\\Users\\x\\Quote.pdf")).toBe("Quote.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("a\u0000b\nc.pdf")).toBe("abc.pdf");
    expect(cleanFileName("  ")).toBe("file");
    expect(cleanFileName("..")).toBe("file");
    const long = cleanFileName(`${"n".repeat(200)}.pdf`);
    expect(long).toHaveLength(140);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("another file of the same name gets the end of its hash before the extension", () => {
    expect(withSuffix("Invoice.pdf", "3f2a1b")).toBe("Invoice3f2a1b.pdf");
    expect(withSuffix("README", "3f2a1b")).toBe("README3f2a1b");
  });

  it("anyone who works on POs may comment, attach and email", () => {
    for (const role of ["PURCHASE", "APPROVER", "ADMIN"]) {
      expect(purchaseCan({ role }, "comment")).toBe(true);
      expect(purchaseCan({ role }, "attach")).toBe(true);
      expect(purchaseCan({ role }, "email")).toBe(true);
    }
    expect(purchaseCan({ role: "VIEWER" }, "comment")).toBe(false);
    expect(purchaseCan(null, "attach")).toBe(false);
  });
});

describe("email from a PO", () => {
  it("New Email starts with the supplier's name tagged with the PO, or Re: the last email", () => {
    expect(defaultEmailSubject("PUR-ORD/25-26/02510", "A & A Silicates", null)).toBe("A & A Silicates (#PUR-ORD/25-26/02510)");
    expect(defaultEmailSubject("PUR-ORD/25-26/02510", null, null)).toBe("PUR-ORD/25-26/02510 (#PUR-ORD/25-26/02510)");
    expect(defaultEmailSubject("PUR-ORD/25-26/02510", "A & A Silicates", "A & A Silicates (#PUR-ORD/25-26/02510)")).toBe("Re: A & A Silicates (#PUR-ORD/25-26/02510)");
    expect(defaultEmailSubject("PUR-ORD/25-26/02510", "A & A Silicates", "Re: Rates")).toBe("Re: Rates (#PUR-ORD/25-26/02510)");
  });

  it("reads address lists as the dialog takes them", () => {
    expect(splitAddresses("a@x.com, b@y.com;\nA@x.com, Supplier <c@z.com>,")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
    expect(splitAddresses("")).toEqual([]);
    expect(isEmailAddress("buyer@pacific.example")).toBe(true);
    expect(isEmailAddress("o'neil.sales+po@mail.supplier-co.in")).toBe(true);
    expect(isEmailAddress("not an email")).toBe(false);
    expect(isEmailAddress("a@b")).toBe(false);
    // Nothing the mail library's address parser could read as another address.
    expect(isEmailAddress('"x@evil.com"@example.com')).toBe(false);
    expect(isEmailAddress("a(comment)@example.com")).toBe(false);
    expect(isEmailAddress("a@example.com>b@evil.com")).toBe(false);
  });
});

describe("the old site's notifications", () => {
  const ctx = (o: Partial<NotifyContext> = {}): NotifyContext => ({ number: "PUR-ORD/25-26/09999", workflowState: "Created", owner: "maker@example.com", contactEmail: null, ...o });
  const users = [
    { email: "stores@example.com", enabled: true, roles: ["Store Head", "Admin"] },
    { email: "head@example.com", enabled: true, roles: ["Purchase Head"] },
    { email: "gone@example.com", enabled: false, roles: ["Admin"] },
    { email: "supplierrole@example.com", enabled: true, roles: ["Supplier"] },
    { email: "admin@example.com", enabled: true, roles: ["Admin"] },
  ];

  it("are the three the old site had, with their texts", () => {
    expect(NOTIFICATIONS.map((n) => [n.name, n.subject("X"), n.message("X")])).toEqual([
      ["Purchase Order {{doc.name}} Is Save", "Purchase Order X Is Created", "New Purchase Order X Is Created"],
      ["Purchase Order {{doc.name}} Is Submit", "Purchase Order X Is Submit", "New Purchase Order X Is Submit"],
      ["Purchase order approved", "Purchase Order X has been approved", "Purchase order is approved"],
    ]);
  });

  it("a new PO sends Is Save; an approval sends the other two; a rejection none", () => {
    expect(dueNotifications("New", ctx()).map((n) => n.name)).toEqual(["Purchase Order {{doc.name}} Is Save"]);
    expect(dueNotifications("Submit", ctx({ workflowState: "Approved" })).map((n) => n.name)).toEqual(["Purchase Order {{doc.name}} Is Submit", "Purchase order approved"]);
    expect(dueNotifications("Submit", ctx({ workflowState: "Rejected" }))).toEqual([]);
  });

  it("go to enabled users holding the roles, each once, never the Administrator's placeholder", () => {
    const [isSave] = dueNotifications("New", ctx());
    expect(recipientsFor(isSave, ctx(), users)).toEqual(["stores@example.com", "head@example.com"]);
    const [isSubmit, approved] = dueNotifications("Submit", ctx({ workflowState: "Approved" }));
    expect(recipientsFor(isSubmit, ctx(), users)).toEqual(["stores@example.com", "head@example.com", "supplierrole@example.com"]);
    // Its creator and the supplier's contact, when they are email addresses.
    expect(recipientsFor(approved, ctx({ contactEmail: "sales@supplier.example" }), users)).toEqual(["maker@example.com", "sales@supplier.example"]);
    expect(recipientsFor(approved, ctx({ owner: "Administrator", contactEmail: "" }), users)).toEqual([]);
  });
});
