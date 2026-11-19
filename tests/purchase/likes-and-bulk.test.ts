// The list's checkboxes and hearts (owner decision 19-11-2026): the "Liked By" filter with ERPNext's
// meaning, Frappe's delete-in-rounds, and the selection the browser sends. Made-up data only.
import { describe, expect, it } from "vitest";
import { purchaseCan } from "@/lib/purchase/access";
import { byNameDescending, deleteInRounds } from "@/lib/purchase/bulk-delete";
import {
  isLikedByMeFilter, likedByCondition, likedByMatches, likedByMeFilter, likedByText, likesCountText,
} from "@/lib/purchase/like-rules";
import { fieldByKey, parseListQuery } from "@/lib/purchase/orders/list";
import { parseSelectedIds } from "@/lib/purchase/orders/selection";

describe("likes", () => {
  it("writes the old _liked_by text, as json.dumps did", () => {
    expect(likedByText([])).toBe("");
    expect(likedByText(["a@example.com"])).toBe('["a@example.com"]');
    expect(likedByText(["a@example.com", "b@example.com"])).toBe('["a@example.com", "b@example.com"]');
  });

  it("shows a count only when someone liked it, and 99+ past 99", () => {
    expect(likesCountText(0)).toBe("");
    expect(likesCountText(3)).toBe("3");
    expect(likesCountText(100)).toBe("99+");
  });

  it("answers the ♥ heading's filter: Liked By like %<me>%", () => {
    const f = likedByMeFilter("a@example.com");
    expect(f).toEqual({ field: "_liked_by", op: "like", value: "%a@example.com%" });
    expect(isLikedByMeFilter(f, "A@Example.com")).toBe(true);
    expect(isLikedByMeFilter({ ...f, op: "not like" }, "a@example.com")).toBe(false);
    // It is a field of the filter builder, as Frappe's standard "Liked By" was.
    expect(fieldByKey("_liked_by")?.label).toBe("Liked By");
    expect(parseListQuery({ filters: JSON.stringify([["_liked_by", "like", "%a@example.com%"]]) }).filters).toEqual([f]);
  });

  it("matches like a text column: case ignored, % wildcards, and the not-operators hold for nobody", () => {
    const text = likedByText(["Asha@Example.com", "b@example.com"]);
    expect(likedByMatches({ op: "like", value: "%asha@example.com%" }, text)).toBe(true);
    expect(likedByMatches({ op: "like", value: "%c@example.com%" }, text)).toBe(false);
    expect(likedByMatches({ op: "not like", value: "%c@example.com%" }, text)).toBe(true);
    // A record nobody liked: never "like", "=" or "in"; always the not-operators and "is not set".
    expect(likedByMatches({ op: "like", value: "%" }, "")).toBe(false);
    expect(likedByMatches({ op: "not like", value: "%a@example.com%" }, "")).toBe(true);
    expect(likedByMatches({ op: "!=", value: '["a@example.com"]' }, "")).toBe(true);
    expect(likedByMatches({ op: "not in", value: ['["a@example.com"]'] }, "")).toBe(true);
    expect(likedByMatches({ op: "is", value: "set" }, "")).toBe(false);
    expect(likedByMatches({ op: "is", value: "not set" }, "")).toBe(true);
    expect(likedByMatches({ op: "=", value: '["a@example.com"]' }, likedByText(["A@example.com"]))).toBe(true);
  });

  it("turns a condition into the ids to keep, or the liked ids to leave out", () => {
    const likers = new Map([
      ["po1", ["a@example.com"]],
      ["po2", ["b@example.com"]],
      ["po3", ["a@example.com", "b@example.com"]],
    ]);
    expect(likedByCondition({ op: "like", value: "%a@example.com%" }, likers)).toEqual({ in: ["po1", "po3"] });
    // Records nobody liked also meet "not like": everything but the liked ones that do not.
    expect(likedByCondition({ op: "not like", value: "%a@example.com%" }, likers)).toEqual({ notIn: ["po1", "po3"] });
    expect(likedByCondition({ op: "is", value: "set" }, likers)).toEqual({ in: ["po1", "po2", "po3"] });
    expect(likedByCondition({ op: "is", value: "not set" }, likers)).toEqual({ notIn: ["po1", "po2", "po3"] });
  });

  it("lets everyone who can open a record like it", () => {
    for (const role of ["PURCHASE", "APPROVER", "ADMIN"]) expect(purchaseCan({ role }, "like")).toBe(true);
    expect(purchaseCan({ role: "SALES" }, "like")).toBe(false);
  });
});

describe("the selection's Delete, in rounds", () => {
  it("goes newest name first, as Python's sorted(…, reverse=True)", () => {
    const rows = [{ id: "1", name: "PO-0001" }, { id: "2", name: "PO-0001-1" }, { id: "3", name: "PO-0002" }];
    expect([...rows].sort(byNameDescending).map((r) => r.name)).toEqual(["PO-0002", "PO-0001-1", "PO-0001"]);
  });

  it("tries again what only another's deletion frees, and stops when a round frees nothing", async () => {
    // "M" can go only once "K" has gone, and comes first in name order; "LOCKED" never can.
    const gone = new Set<string>();
    const tries: string[] = [];
    const outcome = await deleteInRounds(
      [{ id: "k", name: "K" }, { id: "m", name: "M" }, { id: "l", name: "LOCKED" }],
      async (row) => {
        tries.push(row.name);
        if (row.name === "LOCKED") return "Cannot delete or cancel because Item LOCKED is linked with Purchase Order PO-1";
        if (row.name === "M" && !gone.has("K")) return "Cannot delete or cancel because Item M is linked with Item K";
        gone.add(row.name);
        return null;
      },
    );
    expect(outcome.done.map((r) => r.name)).toEqual(["K", "M"]);
    expect(outcome.failed).toEqual([{ id: "l", name: "LOCKED", error: "Cannot delete or cancel because Item LOCKED is linked with Purchase Order PO-1" }]);
    // Round 1 in reverse name order; round 2 retries the two refused; round 3 frees nothing and stops.
    expect(tries).toEqual(["M", "LOCKED", "K", "M", "LOCKED", "LOCKED"]);
  });

  it("deletes nothing twice and reports every refusal when nothing can go", async () => {
    const outcome = await deleteInRounds([{ id: "a", name: "A" }, { id: "b", name: "B" }], async (r) => `no ${r.name}`);
    expect(outcome.done).toEqual([]);
    expect(outcome.failed.map((f) => f.error)).toEqual(["no B", "no A"]);
  });
});

describe("the selection the browser sends", () => {
  it("keeps a JSON list of ids, once each, and drops anything else", () => {
    expect(parseSelectedIds('["a","b","a"]')).toEqual(["a", "b"]);
    expect(parseSelectedIds(["a", 3, null, "", "x".repeat(65), "c"])).toEqual(["a", "c"]);
    expect(parseSelectedIds("not json")).toEqual([]);
    expect(parseSelectedIds('{"a":1}')).toEqual([]);
    expect(parseSelectedIds(undefined)).toEqual([]);
  });
});
