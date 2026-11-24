// The pages of a Stock screen drawn from its definition (owner, 24-11-2026: "make all these
// remainings"): its list (doc/DocList, the old list view), one record (the old form: editable for
// the masters of Items and Pricing, read-only for the transactions), and a new record. Server
// components; each starts with purchasePageGate("stock") (CLAUDE.md, seams).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OrderFooter } from "@/components/purchase/activity/OrderFooter";
import { PageHeader } from "@/components/purchase/layout/PageHeader";
import { purchaseCan } from "@/lib/purchase/access";
import { loadDocActivity } from "@/lib/purchase/doc/activity";
import { newDoc } from "@/lib/purchase/doc/doc-save";
import type { DoctypeLayout, LayoutField } from "@/lib/purchase/doc/layout";
import { linkHrefs } from "@/lib/purchase/doc/link-hrefs";
import { adjacentDocs, currencyDisplays, currencyOfField, listDocs, loadDoc, siteMoment } from "@/lib/purchase/doc/list-data";
import {
  countLabel, docIndicator, docListParams, isEstimatedCount, isValueField, listCell, listColumns, NUMERIC_TYPES, parseDocListQuery, sortOptions,
  standardFilters, type ListColumnView,
} from "@/lib/purchase/doc/list-view";
import { formButtons, LINK_LOOKUP } from "@/lib/purchase/doc/master-form";
import { childLayoutsOf, layoutOf, type DocScreen } from "@/lib/purchase/doc/screens";
import { displayValue } from "@/lib/purchase/doc/values";
import { formatCurrency, formatDateTime } from "@/lib/purchase/format";
import { likesOf, NO_LIKES } from "@/lib/purchase/likes";
import type { ListField, ListFieldType } from "@/lib/purchase/orders/list";
import { PURCHASE_API_ROOT, PURCHASE_PATHS } from "@/lib/purchase/routes";
import { purchasePageGate } from "@/lib/purchase/server/page";
import { DocEditor } from "./DocEditor";
import { DocList, type DocListRow, type DocListStandardFilter } from "./DocList";
import { DocumentView } from "./DocumentView";
import { IndicatorPill } from "./IndicatorPill";

type Params = Record<string, string | string[] | undefined>;
type Doc = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** The filter builder's fields: ID, the DocType's value fields, then Frappe's standard ones. */
function filterFieldsOf(l: DoctypeLayout): ListField[] {
  const typeOf = (f: LayoutField): ListFieldType =>
    f.fieldtype === "Link" || f.fieldtype === "Dynamic Link" ? "link"
      : f.fieldtype === "Select" ? "select"
      : f.fieldtype === "Date" ? "date"
      : f.fieldtype === "Datetime" ? "datetime"
      : f.fieldtype === "Percent" ? "percent"
      : NUMERIC_TYPES.has(f.fieldtype) || f.fieldtype === "Check" ? "number"
      : "data";
  const out: ListField[] = [{ key: "name", label: "ID", type: "data" }];
  const seen = new Set(["name"]);
  for (const f of l.fields) {
    if (!isValueField(f) || f.hidden || seen.has(f.fieldname)) continue;
    seen.add(f.fieldname);
    out.push({ key: f.fieldname, label: f.label ?? f.fieldname, type: typeOf(f), options: f.fieldtype === "Select" ? (f.options ?? "").split("\n").filter(Boolean) : undefined });
  }
  out.push(
    { key: "owner", label: "Created By", type: "link" },
    { key: "modified_by", label: "Last Updated By", type: "link" },
    { key: "creation", label: "Created On", type: "datetime" },
    { key: "modified", label: "Last Updated On", type: "datetime" },
    { key: "_liked_by", label: "Liked By", type: "data" },
  );
  return out;
}

/** The comments the old row counted (_comments, the cache its list read). */
function commentCount(doc: Doc): number {
  try {
    const c = JSON.parse(str(doc._comments) || "[]") as unknown;
    return Array.isArray(c) ? c.length : 0;
  } catch {
    return 0;
  }
}

/** The list (the old list view) of a screen. */
export async function DocListPage({ screen, searchParams, views }: { screen: DocScreen; searchParams: Params; views?: { label: string; href: string; active: boolean }[] }) {
  const gate = await purchasePageGate("stock");
  const user = gate.user!;
  const l = layoutOf(screen);
  const defaults = { sort: screen.sort.field, order: screen.sort.order };
  const q = parseDocListQuery(l, searchParams, defaults);
  const [{ rows, total }, currencies] = await Promise.all([listDocs(screen, q), currencyDisplays()]);
  const likes = await likesOf(screen.key, rows.map((r) => r.id), user.email);
  const columns = listColumns(l, { hideNameColumn: screen.hideNameColumn });
  const format = (f: LayoutField, v: unknown, doc: Doc) => {
    if (f.fieldtype !== "Currency") return displayValue(f, v);
    const code = currencyOfField(f, doc, "INR");
    const c = currencies[code];
    return formatCurrency(Number(v), { symbol: c?.symbol ?? code, fractionUnits: c?.fractionUnits });
  };
  const titleField = l.titleField;
  const view: DocListRow[] = rows.map(({ id, doc }) => {
    const modified = siteMoment(doc.modified) ?? new Date(0);
    return {
      id,
      name: str(doc.name),
      subject: (titleField && str(doc[titleField])) || str(doc.name),
      indicator: docIndicator(l, doc),
      docstatus: Number(doc.docstatus ?? 0) || 0,
      cells: columns.map((c) => (c.kind === "field" && c.field ? listCell(c.field, doc, format) : null)),
      comments: commentCount(doc),
      modified: modified.toISOString(),
      modifiedTitle: formatDateTime(modified),
      likes: likes[id] ?? NO_LIKES,
    };
  });
  const standard: DocListStandardFilter[] = standardFilters(l).map((s) => ({ ...s, lookup: s.fieldtype === "Link" ? LINK_LOOKUP[s.options ?? ""] ?? null : null }));
  const columnView: ListColumnView[] = columns.map((c) => ({ kind: c.kind, label: c.label, from: c.from, numeric: Boolean(c.field && NUMERIC_TYPES.has(c.field.fieldtype)) }));
  const params = docListParams({ ...q, limit: q.pageLength, exact: false }, defaults).toString();
  return (
    <DocList
      doctype={screen.doctype}
      crumbs={["Stock", screen.card]}
      basePath={screen.path}
      likeKind={screen.key}
      viewer={user.email}
      canLike={purchaseCan(user, "like")}
      canDelete={(screen.editable || !!screen.ownForm) && purchaseCan(user, "stock")}
      newHref={(screen.editable || screen.ownForm) && purchaseCan(user, "stock") ? `${screen.path}/new` : null}
      columns={columnView}
      rows={view}
      total={total}
      countText={countLabel(view.length, total, q.exact)}
      estimated={isEstimatedCount(total, q.exact)}
      query={q}
      defaults={defaults}
      standard={standard}
      filterFields={filterFieldsOf(l)}
      sortOptions={sortOptions(l)}
      exportHref={`${PURCHASE_API_ROOT}/doc-export/${screen.key}${params ? `?${params}` : ""}`}
      views={views}
      now={new Date().toISOString()}
    />
  );
}

/** One record: the old form, editable for a master, read-only for a transaction. */
export async function DocRecordPage({ screen, id }: { screen: DocScreen; id: string }) {
  const gate = await purchasePageGate("stock");
  const loaded = await loadDoc(screen, id);
  if (!loaded) notFound();
  const l = layoutOf(screen);
  const children = childLayoutsOf(screen);
  const [{ prev, next }, activity, hrefs] = await Promise.all([
    adjacentDocs(screen, id),
    loadDocActivity(screen.doctype, loaded.name, loaded.stamps),
    linkHrefs(l, loaded.doc, children),
  ]);
  const footer = (
    <OrderFooter
      orderId={loaded.id}
      items={activity.items}
      created={activity.created}
      edited={activity.edited}
      viewer={{ email: gate.user?.email ?? "", isAdmin: gate.tier === "ADMIN" }}
      canComment={false}
    />
  );
  if (screen.editable) {
    return (
      <>
        <DocEditor
          key={str(loaded.doc.modified)}
          screenKey={screen.key}
          doctype={screen.doctype}
          card={screen.card}
          listPath={screen.path}
          id={loaded.id}
          initial={loaded.doc}
          modified={str(loaded.doc.modified)}
          layout={l}
          childLayouts={children}
          prev={prev}
          next={next}
          buttons={formButtons(screen.doctype, loaded.name, { itemGroups: PURCHASE_PATHS.itemGroups, items: PURCHASE_PATHS.items, itemPrices: PURCHASE_PATHS.itemPrices })}
          hrefs={Object.fromEntries(hrefs)}
          canWrite={purchaseCan(gate.user, "stock")}
        />
        {footer}
      </>
    );
  }
  const indicator = docIndicator(l, loaded.doc);
  const title = (l.titleField && str(loaded.doc[l.titleField])) || loaded.name;
  return (
    <>
      <PageHeader
        crumbs={["Stock", screen.doctype, loaded.name]}
        title={title}
        badge={indicator ? <IndicatorPill label={indicator.label} colour={indicator.colour} /> : undefined}
        actions={
          <div className="flex items-center gap-1.5">
            {prev ? <Link href={`${screen.path}/${encodeURIComponent(prev)}`} className="po-btn-secondary" title="Previous Document" aria-label="Previous Document"><ChevronLeft className="h-4 w-4" /></Link> : null}
            {next ? <Link href={`${screen.path}/${encodeURIComponent(next)}`} className="po-btn-secondary" title="Next Document" aria-label="Next Document"><ChevronRight className="h-4 w-4" /></Link> : null}
          </div>
        }
      />
      <section className="po-card">
        <DocumentView
          layout={l}
          doc={loaded.doc}
          options={{
            currency: str(loaded.doc.currency) || "INR",
            href: (_table, f, value) => (f.options ? hrefs.get(`${f.options}\u0000${value}`) ?? null : null),
          }}
        />
      </section>
      {footer}
    </>
  );
}

/** A new record of a master, with the values the page was opened with (Frappe's route options). */
export async function DocNewPage({ screen, searchParams }: { screen: DocScreen; searchParams: Params }) {
  const gate = await purchasePageGate("stock");
  if (!screen.editable || !purchaseCan(gate.user, "stock")) notFound();
  const prefill = Object.fromEntries(Object.entries(searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v.slice(0, 140)]] : [])));
  const l = layoutOf(screen);
  return (
    <DocEditor
      screenKey={screen.key}
      doctype={screen.doctype}
      card={screen.card}
      listPath={screen.path}
      id={null}
      initial={newDoc(screen, prefill)}
      modified={null}
      layout={l}
      childLayouts={childLayoutsOf(screen)}
      prev={null}
      next={null}
      buttons={formButtons(screen.doctype, null, { itemGroups: PURCHASE_PATHS.itemGroups, items: PURCHASE_PATHS.items, itemPrices: PURCHASE_PATHS.itemPrices })}
      hrefs={{}}
      canWrite
    />
  );
}
