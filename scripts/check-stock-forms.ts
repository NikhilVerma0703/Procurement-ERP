// End-to-end check of the Stock masters' forms (owner, 25-11-2026: "complete all these … of the
// editable forms, only Item Price was tested end to end"): every master of Items and Pricing saved,
// edited and deleted through the server's own code (doc/doc-save.ts — what the forms' Save and Delete
// call), against this machine's database, with each refusal the old site gave. It leaves nothing
// behind: its records are deleted, its timeline entries and naming counters put back.
//
//   npm run check:stock-forms        (local database only)

import { execFileSync } from "node:child_process";
import type { PurchaseUser } from "@/lib/purchase/server/current-user";
import { db } from "@/lib/purchase/server/db";
import { deleteDoc, saveDoc } from "@/lib/purchase/doc/doc-save";
import { DOC_SCREENS } from "@/lib/purchase/doc/screens";

execFileSync(process.execPath, ["--import", "tsx", "scripts/require-local-database.ts", "npm run check:stock-forms"], { stdio: "inherit" });

const user = { id: "stock-forms-check", email: "stock-forms.check@procurement.local", name: "Stock Forms Check", role: "STORE" } as unknown as PurchaseUser;
const screen = (doctype: string) => DOC_SCREENS.find((s) => s.doctype === doctype)!;
type Result = Awaited<ReturnType<typeof saveDoc>>;

let passed = 0;
const failed: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failed.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
};
const save = (doctype: string, doc: Record<string, unknown>, id: string | null = null, modified: string | null = null) => saveDoc(user, screen(doctype), { id, doc, modified });
const saved = (label: string, r: Result) => {
  check(label, r.ok, r.ok ? "" : r.error);
  if (!r.ok) throw new Error(`Stopped: ${label} failed (${r.error})`);
  return r.value;
};
const refused = (label: string, r: { ok: boolean; error?: string }, words: string) =>
  check(label, !r.ok && String(r.error).includes(words), r.ok ? "it was saved" : `got: ${r.error}`);
const legacyOf = async (table: "purchase_item_groups" | "purchase_price_lists" | "purchase_item_prices" | "purchase_documents", id: string) =>
  ((await db.$queryRawUnsafe<{ legacy: Record<string, unknown> }[]>(`SELECT legacy FROM ${table} WHERE id = $1`, id))[0]?.legacy ?? {}) as Record<string, unknown>;

(async () => {
  const started = new Date();
  const series = await db.purchaseNamingSeries.findMany({ select: { prefix: true, current: true } });
  const counters = new Map(series.map((s) => [s.prefix, s.current]));
  const made: { doctype: string; id: string }[] = [];
  try {
    // --- Item Group (item_group.py, NestedSet) ---------------------------------------------------
    console.log("Item Group");
    const group = saved("a new group under All Item Groups", await save("Item Group", { item_group_name: "ZZ Check Group", parent_item_group: "All Item Groups", is_group: 1 }));
    made.push({ doctype: "Item Group", id: group.id });
    const leaf = saved("a leaf under it, with an HSN code", await save("Item Group", { item_group_name: "ZZ Check Leaf", parent_item_group: "ZZ Check Group", gst_hsn_code: "84241000" }));
    made.push({ doctype: "Item Group", id: leaf.id });
    check("the parent defaults to All Item Groups", (await legacyOf("purchase_item_groups", (saved("…with no parent given", await save("Item Group", { item_group_name: "ZZ Check Orphan" }))).id)).parent_item_group === "All Item Groups");
    made.push({ doctype: "Item Group", id: (await db.purchaseItemGroup.findUnique({ where: { code: "ZZ Check Orphan" } }))!.id });
    refused("refuses a parent that is not a group", await save("Item Group", { item_group_name: "ZZ Bad", parent_item_group: "ZZ Check Leaf" }), "is not a group");
    refused("refuses a name already taken", await save("Item Group", { item_group_name: "Steel" }), "Item Group Steel already exists");
    refused("refuses an item's name", await save("Item Group", { item_group_name: "Waste Cotton - White" }), "An item exists with same name");
    refused("refuses an HSN code that does not exist", await save("Item Group", { item_group_name: "ZZ Bad", gst_hsn_code: "XYZ" }), "Could not find HSN/SAC: XYZ");
    refused("keeps a group with children a group", await save("Item Group", { is_group: 0 }, group.id, group.modified), "cannot be a leaf node as it has children");
    refused("refuses a save over a newer version", await save("Item Group", { gst_hsn_code: "84241000" }, leaf.id, "2000-01-01 00:00:00.000000"), "Document has been modified after you have opened it");
    const root = (await db.purchaseItemGroup.findUnique({ where: { code: "All Item Groups" } }))!;
    refused("keeps the root read only", await save("Item Group", { is_group: 1 }, root.id), "root item group and cannot be edited");
    refused("refuses to delete a group with children", await deleteDoc(user, screen("Item Group"), group.id), "as it has child nodes");
    refused("refuses to delete a group items use", await deleteDoc(user, screen("Item Group"), (await db.purchaseItemGroup.findUnique({ where: { code: "Steel" } }))!.id), "is linked with Item");

    // --- Price List and Item Price (price_list.py, item_price.py) --------------------------------
    console.log("Price List · Item Price");
    refused("a price list must be for buying or selling", await save("Price List", { price_list_name: "ZZ Check PL", currency: "INR" }), "Price List must be applicable for Buying or Selling");
    const pl = saved("a buying price list", await save("Price List", { price_list_name: "ZZ Check PL", currency: "INR", buying: 1 }));
    made.push({ doctype: "Price List", id: pl.id });
    check("enabled by default", (await legacyOf("purchase_price_lists", pl.id)).enabled === "1");
    const ip = saved("an item price on it", await save("Item Price", { item_code: "Waste Cotton - White", price_list: "ZZ Check PL", price_list_rate: 100, valid_from: "2026-11-25" }));
    made.push({ doctype: "Item Price", id: ip.id });
    const ipRow = await legacyOf("purchase_item_prices", ip.id);
    check("takes the list's buying and currency, and the item's name", ipRow.buying === "1" && ipRow.currency === "INR" && ipRow.item_name === "Waste Cotton - White", JSON.stringify({ b: ipRow.buying, c: ipRow.currency, n: ipRow.item_name }));
    check("is named with a 10-character hash", /^[0-9a-z]{10}$/.test(ip.name), ip.name);
    refused("refuses the same price twice", await save("Item Price", { item_code: "Waste Cotton - White", price_list: "ZZ Check PL", price_list_rate: 90, valid_from: "2026-11-25" }), "Item Price appears multiple times");
    refused("refuses a template item", await save("Item Price", { item_code: "AAKT090824A", price_list: "ZZ Check PL", price_list_rate: 1 }), "cannot be created for the template item AAKT090824A");
    refused("refuses Valid From after Valid Upto", await save("Item Price", { item_code: "Waste Cotton - White", price_list: "ZZ Check PL", price_list_rate: 1, valid_from: "2026-12-01", valid_upto: "2026-11-01" }), "Valid From Date must be lesser than Valid Up To Date.");
    const ip2 = saved("an edit of the rate", await save("Item Price", { price_list_rate: 120 }, ip.id, ip.modified));
    const version = await db.purchaseDocEvent.findFirst({ where: { doctype: "Item Price", docName: ip.name, kind: "VERSION", byEmail: user.email } });
    check("records the edit as a Version (track changes)", Boolean(version));
    saved("the list switched to USD and selling", await save("Price List", { currency: "USD", buying: 1, selling: 1 }, pl.id, pl.modified));
    const after = await db.purchaseItemPrice.findUnique({ where: { id: ip.id }, select: { currency: true, selling: true } });
    check("its item prices follow (update_item_price)", after?.currency === "USD" && after.selling === true, JSON.stringify(after));
    const plNow = (await legacyOf("purchase_price_lists", pl.id)).modified as string;
    saved("the list disabled", await save("Price List", { enabled: 0 }, pl.id, plNow));
    refused("a disabled list takes no prices", await save("Item Price", { price_list_rate: 130 }, ip.id, (await legacyOf("purchase_item_prices", ip.id)).modified as string), "does not exist or is disabled");
    refused("a list with prices is not deleted", await deleteDoc(user, screen("Price List"), pl.id), "is linked with Item Price");
    void ip2;

    // --- Product Bundle (product_bundle.py) ------------------------------------------------------
    console.log("Product Bundle");
    refused("a stock item cannot be a bundle", await save("Product Bundle", { new_item_code: "Waste Cotton - White", items: [{ item_code: "LPG Cylinder", qty: 1 }] }), "must not be a Stock Item");
    refused("a bundle needs its items", await save("Product Bundle", { new_item_code: "AMC - 950215612 Weighing Machine", items: [] }), "Missing Fields");
    const pb = saved("a bundle of a non-stock item", await save("Product Bundle", { new_item_code: "AMC - 950215612 Weighing Machine", items: [{ item_code: "Waste Cotton - White", qty: 2 }] }));
    made.push({ doctype: "Product Bundle", id: pb.id });
    const pbRow = await legacyOf("purchase_documents", pb.id);
    check("is named after its parent item; a row fetches its unit", pb.name === "AMC - 950215612 Weighing Machine" && (pbRow.items as Record<string, unknown>[])[0]?.uom !== null, JSON.stringify((pbRow.items as unknown[])?.[0]));
    refused("one bundle per item", await save("Product Bundle", { new_item_code: "AMC - 950215612 Weighing Machine", items: [{ item_code: "Waste Cotton - White", qty: 1 }] }), "already exists");

    // --- Shipping Rule (shipping_rule.py) --------------------------------------------------------
    console.log("Shipping Rule");
    const rule = { label: "ZZ Check Rule", account: "Accumulated Depreciations - PESPL", cost_center: "Main - PESPL" };
    refused("a Net Total rule needs conditions", await save("Shipping Rule", { ...rule, calculate_based_on: "Net Total", conditions: [] }), "Shipping Rule Conditions");
    refused("refuses overlapping conditions", await save("Shipping Rule", { ...rule, calculate_based_on: "Net Total", conditions: [{ from_value: 0, to_value: 100, shipping_amount: 10 }, { from_value: 50, to_value: 150, shipping_amount: 20 }] }), "Overlapping conditions found");
    refused("From must be below To", await save("Shipping Rule", { ...rule, calculate_based_on: "Net Total", conditions: [{ from_value: 100, to_value: 50, shipping_amount: 10 }] }), "From value must be less than to value in row 1");
    refused("refuses an account that does not exist", await save("Shipping Rule", { ...rule, account: "No Such Account", calculate_based_on: "Fixed", shipping_amount: 50 }), "Could not find Shipping Account: No Such Account");
    const sr = saved("a Net Total rule with two bands", await save("Shipping Rule", { ...rule, calculate_based_on: "Net Total", conditions: [{ from_value: 100, to_value: 0, shipping_amount: 0 }, { from_value: 0, to_value: 100, shipping_amount: 10 }] }));
    made.push({ doctype: "Shipping Rule", id: sr.id });
    const srRow = await legacyOf("purchase_documents", sr.id);
    check("sorts its bands by From Value; the company is the default", (srRow.conditions as Record<string, unknown>[]).map((c) => Number(c.from_value)).join(",") === "0,100" && srRow.company === "Pacific Engineered Surfaces Private Limited", JSON.stringify((srRow.conditions as Record<string, unknown>[]).map((c) => c.from_value)));

    // --- Pricing Rule (pricing_rule.py) ----------------------------------------------------------
    console.log("Pricing Rule");
    const pr = { title: "ZZ Check PR", apply_on: "Item Code", currency: "INR", buying: 1, price_or_product_discount: "Price", rate_or_discount: "Discount Percentage", discount_percentage: 5 };
    refused("Apply On Item Code needs items", await save("Pricing Rule", { ...pr, items: [] }), "Item Code is not added in the table");
    refused("buying or selling", await save("Pricing Rule", { ...pr, buying: 0, items: [{ item_code: "Waste Cotton - White" }] }), "Atleast one of the Selling or Buying must be selected");
    refused("Applicable For needs its value", await save("Pricing Rule", { ...pr, applicable_for: "Supplier", items: [{ item_code: "Waste Cotton - White" }] }), "Supplier is required");
    const prSaved = saved("a 5 % buying discount on an item", await save("Pricing Rule", { ...pr, items: [{ item_code: "Waste Cotton - White" }], item_groups: [{ item_group: "Consumable" }] }));
    made.push({ doctype: "Pricing Rule", id: prSaved.id });
    const prRow = await legacyOf("purchase_documents", prSaved.id);
    check("named from its series (PRLE-.####)", /^PRLE-\d{4}$/.test(prSaved.name), prSaved.name);
    check("keeps only the chosen Apply On's table (cleanup_fields_value)", (prRow.items as unknown[]).length === 1 && (prRow.item_groups as unknown[]).length === 0);

    // --- Item Alternative, Item Manufacturer, Customs Tariff Number ------------------------------
    console.log("Item Alternative · Item Manufacturer · Customs Tariff Number");
    refused("an item is not its own alternative", await save("Item Alternative", { item_code: "Waste Cotton - White", alternative_item_code: "Waste Cotton - White" }), "Alternative item must not be same as item code");
    refused("only for items that allow one", await save("Item Alternative", { item_code: "LPG Cylinder", alternative_item_code: "Waste Cotton - White" }), "Not allow to set alternative item for the item LPG Cylinder");
    const alt = saved("a two-way alternative", await save("Item Alternative", { item_code: "Waste Cotton - White", alternative_item_code: "ABRA 60-OR-IN IMPELLER  280 KEYWAY", two_way: 1 }));
    made.push({ doctype: "Item Alternative", id: alt.id });
    check("fetches both items' names", (await legacyOf("purchase_documents", alt.id)).alternative_item_name === "ABRA 60-OR-IN IMPELLER  280 KEYWAY");
    refused("one record per pair", await save("Item Alternative", { item_code: "Waste Cotton - White", alternative_item_code: "ABRA 60-OR-IN IMPELLER  280 KEYWAY" }), "Already record exists for the item Waste Cotton - White");
    refused("a manufacturer must exist (the old site had none)", await save("Item Manufacturer", { item_code: "Waste Cotton - White", manufacturer: "Acme", manufacturer_part_no: "P1" }), "Could not find Manufacturer: Acme");
    const ctn = saved("a tariff number", await save("Customs Tariff Number", { tariff_number: "84241000", description: "Fire extinguishers" }));
    made.push({ doctype: "Customs Tariff Number", id: ctn.id });
    check("named by its number", ctn.name === "84241000", ctn.name);
    refused("each number once", await save("Customs Tariff Number", { tariff_number: "84241000" }), "Customs Tariff Number 84241000 already exists");
    refused("transactions are not entered here", await deleteDoc(user, screen("Material Request"), "x"), "is not entered here");

    // --- Deleting (in the order the links allow) -------------------------------------------------
    console.log("Delete");
    for (const m of [...made].reverse()) {
      const r = await deleteDoc(user, screen(m.doctype), m.id);
      check(`deletes the ${m.doctype}`, r.ok, r.ok ? "" : r.error);
      if (r.ok) made.splice(made.indexOf(m), 1);
    }
  } finally {
    // Whatever a stop left behind goes too; the timeline and the counters are put back.
    for (const m of made.reverse()) await deleteDoc(user, screen(m.doctype), m.id).catch(() => null);
    await db.purchaseDocEvent.deleteMany({ where: { byEmail: user.email, at: { gte: started } } });
    for (const s of await db.purchaseNamingSeries.findMany({ select: { prefix: true, current: true } })) {
      if (!counters.has(s.prefix)) await db.purchaseNamingSeries.delete({ where: { prefix: s.prefix } });
      else if (counters.get(s.prefix) !== s.current) await db.purchaseNamingSeries.update({ where: { prefix: s.prefix }, data: { current: counters.get(s.prefix)! } });
    }
    const left = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT (SELECT COUNT(*) FROM purchase_item_groups WHERE code LIKE 'ZZ %') + (SELECT COUNT(*) FROM purchase_price_lists WHERE code LIKE 'ZZ %')
        + (SELECT COUNT(*) FROM purchase_documents WHERE created_by = $1)::int AS n`,
      user.email,
    );
    check("leaves nothing behind", Number(left[0].n) === 0, `${left[0].n} left`);
    console.log(`\n${failed.length ? "✗" : "✓"} ${passed} passed, ${failed.length} failed${failed.length ? `:\n  - ${failed.join("\n  - ")}` : ""}`);
    await db.$disconnect();
    process.exit(failed.length ? 1 : 0);
  }
})();
