# Step 8 (part 1): the PO's timeline, comments, attachments and email

**Status:** built and checked in the browser, 18-11-2026. Part 2, the masters screens, is
[09-masters.md](09-masters.md).

**Checked in the browser** on imported POs:
- The history of 02510 (approved), 00200 (notification emails) and 00046 (an attachment) reads as the old timeline
  did.
- A comment was added (Ctrl+Enter), edited and deleted.
- A file was attached (private), opened and removed. An 11 MB upload was refused.
- An email was written with the PO sheet attached, then replied to. It stayed "Not Sent": no outgoing email is set up
  here.
- A cancelled PO offers no email.
- The test rows were then removed: the local data is again the import's.

**Code:**
- **Page:** `src/app/purchase/orders/[id]/page.tsx` puts the sidebar and the footer around the form
  (`OrderForm`'s `sidebar` and `footer`).
- **Components (`src/components/purchase/activity/`):**
  - `OrderFooter.tsx`: the comment box and the timeline
  - `OrderSidebar.tsx`: attachments, comment count, created / edited
  - `AttachDialog.tsx`: Attach File
  - `compose.tsx`: New Email, and the context that opens it
  - `bits.tsx`
- **Rules:**
  - `src/lib/purchase/orders/timeline.ts`: the timeline, pure. `doc-meta.ts` holds its field labels.
  - `activity.ts`: what the page loads.
  - `comments.ts`.
  - `attachments.ts` (`attachment-names.ts` holds the pure name rules).
- **Email (`src/lib/purchase/notify/`):**
  - `notifications.ts`: the three notifications, pure
  - `compose.ts`: the dialog's defaults, pure
  - `outbox.ts`: writes and sends
- **Server actions:** `src/app/purchase/orders/activity-actions.ts`. Notifications are hooked into `actions.ts`
  (save, approve).
- **Routes:**
  - `POST /api/purchase/orders/[id]/attachments` (upload)
  - `GET /api/purchase/attachments/[id]` (a file)
- **Seams added:**
  - `src/lib/purchase/server/mail.ts`: outgoing email, `SMTP_*` like the Main ERP
  - file writes in `server/files.ts`
- **Access (`access.ts`):** `comment`, `attach` and `email`, all three roles.

**Tests:** `tests/purchase/activity.test.ts` covers:
- version wording, the three-field stop, row changes, added/removed rows, hidden fields, the 40-character cut;
- timeline order and the 10-version limit;
- attachment lines with link and lock;
- notification and comment cards;
- "x ago" wording;
- file names;
- who may comment, attach and email;
- the dialog's subject and addresses;
- the notifications' recipients.

## 1. Timeline (below the tabs)

Ported from Frappe 14.101.1 (`form_timeline.js`, `version_timeline_content_builder.js`, `load.py`):

- **"Add a comment":** the box, "Ctrl+Enter to add comment", Comment.
- **"Activity":** a header with Communication | All. It shows once the PO has an email or a comment.
- **Items, newest first.** Lines at the same moment keep ERPNext's order (emails, comments, versions, workflow,
  attachments, notes). So an approval reads "X Approved", then the version, then "X To Receive and Bill".
- **Versions:** only the newest 10, each giving up to four lines:
  - "X changed value of A from a to b, …": the first three visible fields. ERPNext read the change list in order and
    stopped at the third, so on most approvals "X submitted this document" is never reached. That is kept.
  - "X changed values for A from a to b in row #n".
  - "X added rows for Items, Items": one name per row, as it printed.
  - "X removed rows for …".
  - Values are cut to 40 characters and shown in bold; an empty value is `""`.
  - Hidden fields are never named: Workflow State, the item-wise tax detail.
- **Workflow and status lines:** "X Approved" (workflow badge), "X To Receive and Bill", "X Added file.pdf" (a lock
  when private, linked while attached), "X Removed file.pdf".
- **Emails** are cards:
  - The old site's 95 notification emails read "Notification sent to {first three names} …", then the time and the
    message.
  - An email a person wrote shows sender, time, subject, delivery status (Sent / Not Sent / Error), the message and
    what was attached, with Reply and Reply All.
  - Only the newest 20 emails show, then "Load More Communications".
- **Comments** are cards: "{name} commented · {time}". The author may Edit (then Save or Dismiss) and delete; an Admin
  may delete any. "Copy Link" is in ⋯.
- **Last line:** "{X} created this {time} • {Y} edited this {time}" ("You" for yourself).
- **Times** use Frappe's wording: "just now", "5 minutes ago", "yesterday", "1 week ago", "2 years ago"; the date and
  time show on hover.

## 2. Sidebar (left of the tabs; below them on a narrow screen)

- **Attachments:**
  - "Attach File", then each file as a pill: a lock when private, its name opening it, × removing it after "Are you
    sure you want to delete the attachment?". The newest 10 show, then "Show All".
  - A private file needs the module's view access; every file opens through the gated route.
  - PDFs and pictures open in the browser; other files download, sandboxed.
- **The comment count:** takes you to the comment box.
- **"{X} edited this · {time}" and "{Y} created this · {time}".**
- **Attach File** (FileUploader, "My Device"):
  - Drop or pick files; each is private unless unticked. Then Upload.
  - The size limit is 10 MB, Frappe's default.
  - The same bytes again reuse the stored file. Another file of the same name gets its hash's end before the
    extension.
  - The timeline records "Added …" and "Removed …". A removed file's bytes go when nothing else uses them.

**Left out: unused in 2.5 years.** Plan §5 keeps such things out unless you say otherwise:

| Feature | Use in the old data |
|---|---|
| Assigned To | 0 POs |
| Tags | 0 |
| Likes | 0 |
| Shared With | none found |
| Follow | none found |
| Comment @mentions | 1 comment ever |
| The uploader's Library, Link and Camera | never used |

## 3. Email

**New Email** is in the ⋯ menu as "Email" (Ctrl+E) and at the top of the timeline. It is offered on a PO that is not
cancelled, to all three roles. It follows Frappe's composer:

- **To:** starts with the PO's contact email. CC and BCC are behind ▾.
- **Subject (required):** "{supplier} (#PUR-ORD/…)", or "Re: …" after an earlier email.
- **Message.**
- **Options:** Send me a copy, Send Read Receipt, and Attach Document Print with the print format (the five
  layouts). The PO's attachments can be picked.
- **Buttons:** Discard and Send.
- **Messages:** "Enter Email Recipient(s)", "… is not a valid Email Address", "Missing Fields: Subject". At most 100
  addresses.
- **Sending:**
  - The email is written on the timeline first, then sent through `server/mail.ts` (nodemailer with
    `SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM`, as in the Main ERP). Replies go to the sender.
  - Without SMTP set up it stays **"Not Sent"**, and the toast says so: Frappe's queue kept mail the same way when
    there was no outgoing account.
  - A failure shows **"Error"** with the reason.
  - A cancelled PO's sheet cannot be attached ("Not allowed to print cancelled documents").

**The old site's three notifications** (`po_setup.json`), with Frappe's recipient rules:

| Notification | When | Subject / message | To |
|---|---|---|---|
| Is Save | a new PO (state Created) | "Purchase Order X Is Created" / "New Purchase Order X Is Created" | enabled users with Request Dept Head, Store Head, Purchase Head or Admin |
| Is Submit | approval | "Purchase Order X Is Submit" / "New Purchase Order X Is Submit" | Store Head, Request Dept Head, Purchase Head, Admin, Supplier |
| Purchase order approved | approval | "Purchase Order X has been approved" / "Purchase order is approved" | the PO's creator and its contact email (the supplier's contact) |

- **Roles:** come from the old site's users and roles (`purchase_users`). At the merge, the Main ERP's.
- **No print** was attached.
- **Behaviour:**
  - They run after the action's answer, so mail never slows or undoes a save or an approval.
  - Each shows on the timeline as "Notification sent to …".
  - A failure is recorded there.

**They are off unless `PURCHASE_NOTIFICATIONS=on`.** The old site's last notification email is dated 21-09-2024:
- 82 "approved" emails, 8 "Is Save" and 5 "Is Submit", all between April and September 2024.
- 2,977 of the 3,199 POs were made after that, with no notification logged.

Switching them on would start emailing staff and suppliers again after two years, so it is your decision.

## 4. Questions for you

1. **Notifications:** switch them on (`PURCHASE_NOTIFICATIONS=on` and the SMTP settings), or keep them off?
2. **Email to supplier:**
   - The plan includes it, so it is built.
   - On the old site no one ever sent an email from a PO: all 95 emails were automatic.
   - The captured form showed no Email item for the capturing user.
   - Keep it for all three roles?
3. **The unused sidebar items** (Assigned To, Tags, likes, Shared With, Follow): leave them out?

## 5. Not in this part

- **The masters screens:** Supplier, Item, Address, Contact, and the tax, payment-terms and T&C templates (part 2).
- **Email templates and signatures:** none existed on the old site's PO emails.
