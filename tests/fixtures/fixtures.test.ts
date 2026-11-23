import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const fixture = (name: string) => resolve(import.meta.dirname, name);

/** Columns whose values are personal and must not appear in any fixture. */
const PERSONAL_COLUMNS = [
  "fahrende Person",
  "Buchungsobjekt",
  "Kennzeichen",
  "Station",
  "Rechnungnummer",
  "Kommentar",
  "KommentarKundenService",
  "Abteilung",
  "Kostenstelle",
];

const ORIGINALS = {
  csv: ["Fahrten_2024-12-31_2025-12-31.csv", "Fahrten_2025-12-31_2026-11-23.csv"],
  xlsx: ["Fahrten_2024-12-31_2025-12-31.xlsx"],
};

/** Splits a portal CSV export into records of fields (handles quoted fields). */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") {
      record.push(field);
      field = "";
    } else if (c === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

const readCsv = (path: string) => parseCsv(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));

const unescapeXml = (s: string) =>
  s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

/** Rows of text cells (numbers and dates become empty strings) of the single worksheet. */
function readXlsxStrings(path: string): string[][] {
  const xml = strFromU8(unzipSync(readFileSync(path))["xl/worksheets/sheet1.xml"]!);
  return (xml.match(/<x:row[\s>][\s\S]*?<\/x:row>/g) ?? []).map((row) =>
    (row.match(/<x:c(?:\s[^>]*?)?(?:\/>|>[\s\S]*?<\/x:c>)/g) ?? []).map((cell) => {
      if (!/\st="str"/.test(cell)) return "";
      return unescapeXml(/<x:v>([\s\S]*?)<\/x:v>/.exec(cell)?.[1] ?? "");
    }),
  );
}

/** All distinct non-empty values of the personal columns of the given tables. */
function personalValues(tables: string[][][]): string[] {
  const values = new Set<string>();
  for (const [header, ...rows] of tables) {
    const indexes = PERSONAL_COLUMNS.map((name) => header!.indexOf(name)).filter((i) => i >= 0);
    for (const row of rows) {
      for (const i of indexes) if (row[i]) values.add(row[i]);
    }
  }
  return [...values];
}

describe("trip fixtures", () => {
  it.each([
    ["trips-2025.csv", 84],
    ["trips-2026.csv", 1],
  ])("%s has %i data rows with 28 fields each, BOM and CRLF", (name, count) => {
    const bytes = readFileSync(fixture(name));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8")).toContain("\r\n");
    const [header, ...rows] = readCsv(fixture(name));
    expect(header).toHaveLength(28);
    expect(rows).toHaveLength(count);
    for (const row of rows) expect(row).toHaveLength(28);
  });

  it("trips-2025.xlsx has the same 84 rows as the CSV", () => {
    const [header, ...rows] = readXlsxStrings(fixture("trips-2025.xlsx"));
    expect(header).toHaveLength(28);
    expect(rows).toHaveLength(84);
  });

  const originalsPresent = [...ORIGINALS.csv, ...ORIGINALS.xlsx].every((name) =>
    existsSync(resolve(root, name)),
  );

  it.skipIf(!originalsPresent)("contains no personal value of the local originals", () => {
    const values = personalValues([
      ...ORIGINALS.csv.map((name) => readCsv(resolve(root, name))),
      ...ORIGINALS.xlsx.map((name) => readXlsxStrings(resolve(root, name))),
    ]);
    expect(values.length).toBeGreaterThan(0);
    const fixtures = [
      readFileSync(fixture("trips-2025.csv"), "utf8"),
      readFileSync(fixture("trips-2026.csv"), "utf8"),
      readXlsxStrings(fixture("trips-2025.xlsx"))
        .map((row) => row.join(";"))
        .join("\n"),
    ];
    // Report only the count: the values themselves are personal data.
    const leaked = values.filter((value) => fixtures.some((text) => text.includes(value)));
    expect(leaked.length).toBe(0);
  });
});

const TARIFFS = ["AKTIV", "BASIS", "CAMPUS", "COMFORT"];

describe("calculator fixtures", () => {
  interface Entry {
    surchargeCents: number;
    costs: Record<string, { time: number; km: number | null; total: number }>;
  }
  const entries = JSON.parse(readFileSync(fixture("calculator-fixtures.json"), "utf8")) as Entry[];

  it("has 166 entries with surchargeCents 3", () => {
    expect(entries).toHaveLength(166);
    expect(new Set(entries.map((e) => e.surchargeCents))).toEqual(new Set([3]));
  });

  it("has the four tariffs in every entry (the START tariff only appears for Hamburg), and total = time + km", () => {
    for (const entry of entries) {
      expect(Object.keys(entry.costs)).toEqual(expect.arrayContaining(TARIFFS));
      for (const { time, km, total } of Object.values(entry.costs)) {
        expect(Math.abs(total - (time + (km ?? 0)))).toBeLessThanOrEqual(0.005);
      }
    }
  });
});
