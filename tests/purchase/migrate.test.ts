import { describe, expect, it } from "vitest";
import { bool, dateOnly, dec, decOrNull, enumOf, importId, int, localDateTime, text } from "@/lib/purchase/migrate/convert";
import { parseValues } from "@/lib/purchase/migrate/dump";
import { tarEntries } from "@/lib/purchase/migrate/files";
import { fromNano, sumNano, toNano } from "@/lib/purchase/migrate/reconcile";

describe("parseValues — mysqldump extended inserts", () => {
  it("reads strings, numbers and NULL, row by row", () => {
    expect(parseValues(`('PUR-ORD/25-26/02510','A & A Silicates',415799.500000000,NULL,1),('x',0,-2.5,'',0)`)).toEqual([
      ["PUR-ORD/25-26/02510", "A & A Silicates", "415799.500000000", null, "1"],
      ["x", "0", "-2.5", "", "0"],
    ]);
  });

  it("unescapes backslash escapes and keeps commas and brackets inside strings", () => {
    const [row] = parseValues(String.raw`('O\'Brien, (Bombay)','line1\nline2','C:\\files','tab\there','say \"hi\"')`);
    expect(row).toEqual(["O'Brien, (Bombay)", "line1\nline2", "C:\\files", "tab\there", 'say "hi"']);
  });

  it("keeps non-ASCII text intact", () => {
    expect(parseValues(`('₹ Twenty Lakh only','Ölmühle')`)).toEqual([["₹ Twenty Lakh only", "Ölmühle"]]);
  });

  it("rejects a malformed row instead of guessing", () => {
    expect(() => parseValues(`('unterminated`)).toThrow();
  });
});

describe("value conversions", () => {
  it("turns the old site's Asia/Kolkata times into UTC", () => {
    expect(localDateTime("2026-11-16 10:04:03.567429")?.toISOString()).toBe("2026-11-16T04:34:03.567Z");
    expect(localDateTime("2024-04-01 00:15:00")?.toISOString()).toBe("2024-03-31T18:45:00.000Z");
    expect(localDateTime(null)).toBeNull();
    expect(localDateTime("0000-00-00 00:00:00")).toBeNull();
  });

  it("keeps dates as calendar dates", () => {
    expect(dateOnly("2026-11-07")?.toISOString()).toBe("2026-11-07T00:00:00.000Z");
    expect(dateOnly("")).toBeNull();
    expect(() => dateOnly("07-11-2026")).toThrow();
  });

  it("keeps numbers exact, as text", () => {
    expect(dec("415799.500000000")).toBe("415799.500000000");
    expect(dec("32,391")).toBe("32391");
    expect(dec(null)).toBe("0");
    expect(decOrNull("")).toBeNull();
    expect(() => dec("12 kg")).toThrow();
  });

  it("reads checks, integers and optional text the ERPNext way", () => {
    expect([bool("1"), bool("0"), bool(null), bool("")]).toEqual([true, false, false, false]);
    expect(int("12")).toBe(12);
    expect(text("")).toBeNull();
    expect(text("Road")).toBe("Road");
  });

  it("maps known labels and reports unknown ones", () => {
    const issues: string[] = [];
    const map = { Road: "ROAD", Air: "AIR" } as const;
    expect(enumOf(map, "Road", "PO x", issues)).toBe("ROAD");
    expect(enumOf(map, "Teleport", "PO x", issues)).toBeNull();
    expect(issues).toEqual(['PO x: unknown value "Teleport"']);
  });

  it("gives every imported record a stable ID", () => {
    expect(importId("po", "PUR-ORD/25-26/02510")).toBe(importId("po", "PUR-ORD/25-26/02510"));
    expect(importId("po", "PUR-ORD/25-26/02510")).not.toBe(importId("su", "PUR-ORD/25-26/02510"));
    expect(importId("po", "PUR-ORD/25-26/02510")).toMatch(/^po_[\w-]{22}$/);
  });
});

describe("exact decimal sums for the reconciliation", () => {
  it("adds money without floating-point drift", () => {
    expect(fromNano(sumNano(["0.1", "0.2"]))).toBe("0.30");
    expect(fromNano(sumNano(["415799.500000000", "2001326.000000000", "-0.36"]))).toBe("2417125.14");
    expect(toNano("1.000000001")).toBe(1_000_000_001n);
    expect(fromNano(toNano("10096.678"))).toBe("10096.678");
  });
});

describe("tarEntries — the backup's file archives", () => {
  const header = (name: string, size: number) => {
    const h = Buffer.alloc(512);
    h.write(name, 0, "utf8");
    h.write("0000644\0", 100);
    h.write(size.toString(8).padStart(11, "0") + "\0", 124);
    h.write("0", 156);
    h.write("ustar\0", 257);
    h.write("00", 263);
    return h;
  };
  const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);

  it("lists files with their contents", () => {
    const pdf = Buffer.from("%PDF-1.4 test");
    const logo = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const tar = Buffer.concat([
      header("site/public/files/PO - 00044.pdf", pdf.length), pad(pdf),
      header("site/public/files/pacific_logo.png", logo.length), pad(logo),
      Buffer.alloc(1024),
    ]);
    const entries = tarEntries(tar);
    expect(entries.map((e) => e.name)).toEqual(["site/public/files/PO - 00044.pdf", "site/public/files/pacific_logo.png"]);
    expect(entries[0].data.toString()).toBe("%PDF-1.4 test");
    expect([...entries[1].data]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
