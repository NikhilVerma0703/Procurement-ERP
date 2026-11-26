// Financial-year document numbers (owner, 26-11-2026): a new number carries the financial year of the
// document's own date; FY 2026-27 continues the 25-26 count, later years start again.
import { describe, expect, it } from "vitest";
import { carryOverPrefix, fyFull, fyShort, fyStartOf, hasFinancialYear, sameSeries, seriesForDate, seriesInFy } from "@/lib/purchase/financial-year";
import { layoutInFy } from "@/lib/purchase/doc/fy-layout";
import { LAYOUTS } from "@/lib/purchase/doc/layouts";
import { seriesKey } from "@/lib/purchase/stock/receipt-meta";

describe("the financial year of a date (1 April – 31 March)", () => {
  it.each([
    ["2026-11-26", 2026],
    ["2026-04-01", 2026],
    ["2026-03-31", 2025],
    ["2027-03-31", 2026],
    ["2027-04-01", 2027],
  ])("%s → %i", (d, y) => expect(fyStartOf(d)).toBe(y));

  it("reads a moment as its day in India", () => {
    // 31-03-2027 19:00 UTC is already 01-04-2027 in India.
    expect(fyStartOf(new Date("2027-03-31T19:00:00Z"))).toBe(2027);
    expect(fyShort(2026)).toBe("26-27");
    expect(fyFull(2026)).toBe("2026-2027");
    expect(fyShort(2099)).toBe("99-00");
  });
});

describe("series in the document's financial year", () => {
  it("puts the old fixed year in the date's year", () => {
    expect(seriesForDate("PUR-ORD/25-26/", "2026-11-26")).toBe("PUR-ORD/26-27/");
    expect(seriesForDate("PUR-ORD/25-26/", "2027-04-01")).toBe("PUR-ORD/27-28/");
    expect(seriesForDate("PR/25-26/.MM-", "2026-11-26")).toBe("PR/26-27/.MM-");
    expect(seriesForDate("GE-25-26-.#####", "2026-11-26")).toBe("GE-26-27-.#####");
    expect(seriesForDate("MAT-STE/24-25/", "2026-11-26")).toBe("MAT-STE/26-27/");
    // A back-dated document keeps the old year.
    expect(seriesForDate("PUR-ORD/25-26/", "2026-03-20")).toBe("PUR-ORD/25-26/");
  });

  it("leaves series without a financial year alone", () => {
    for (const s of ["MAT-MR-.YYYY.-", "MAT-SLE-.YYYY.-", "PRLE-.####", "GE-.{financial_year}.-.#####", "PR-.YY.-"]) {
      expect(hasFinancialYear(s)).toBe(false);
      expect(seriesInFy(s, 2026)).toBe(s);
    }
  });

  it("recognises a series whatever year it names", () => {
    expect(sameSeries("GE-26-27-.#####", "GE-25-26-.#####")).toBe(true);
    expect(sameSeries("GE-26-27-.#####", "GE-.{financial_year}.-.#####")).toBe(false);
  });

  it("gives the counter's key in the new year", () => {
    expect(seriesKey(seriesForDate("PR/25-26/.MM-", "2026-11-26"))).toEqual({ prefix: "PR/26-27/MM-", digits: 5 });
  });
});

describe("the count (owner's choice, 26-11-2026)", () => {
  it("carries the 25-26 count into 26-27, and nowhere else", () => {
    expect(carryOverPrefix("PUR-ORD/26-27/")).toBe("PUR-ORD/25-26/");
    expect(carryOverPrefix("PR/26-27/MM-")).toBe("PR/25-26/MM-");
    expect(carryOverPrefix("GE-26-27-")).toBe("GE-25-26-");
    expect(carryOverPrefix("PUR-ORD/27-28/")).toBeNull();
    expect(carryOverPrefix("MAT-MR-2026-")).toBeNull();
  });
});

describe("the forms' Series choices", () => {
  it("offers the series in this year", () => {
    const pr = layoutInFy(LAYOUTS["Purchase Receipt"], "2026-11-26").fields.find((f) => f.fieldname === "naming_series")!;
    expect(pr.options!.split("\n")).toContain("PR/26-27/.MM-");
    expect(pr.default).toBe("PR/26-27/.MM-");
    const ge = layoutInFy(LAYOUTS["Gate Entry"], "2027-05-01").fields.find((f) => f.fieldname === "naming_series")!;
    expect(ge.options!.split("\n")).toEqual(["GE-27-28-.#####", "GE-.{financial_year}.-.#####"]);
  });
});
