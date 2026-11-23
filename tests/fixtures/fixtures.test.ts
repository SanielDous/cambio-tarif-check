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
  csv: [
    "private/exports/Fahrten_2024-12-31_2025-12-31.csv",
    "private/exports/Fahrten_2025-12-31_2026-11-23.csv",
  ],
  xlsx: ["private/exports/Fahrten_2024-12-31_2025-12-31.xlsx"],
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

const unzip = (path: string) => unzipSync(readFileSync(path));

interface XlsxCell {
  /** `str` for string cells, `n` for numeric (incl. date serial) cells, `other` for the rest. */
  type: "str" | "n" | "other";
  /** Decoded text, empty if the cell has no value. */
  text: string;
  hasValue: boolean;
}

/** Rows of cells of the single worksheet (the portal's workbook uses the `x:` prefix). */
function readXlsxCells(path: string): XlsxCell[][] {
  const xml = strFromU8(unzip(path)["xl/worksheets/sheet1.xml"]!);
  return (xml.match(/<x:row[\s>][\s\S]*?<\/x:row>/g) ?? []).map((row) =>
    (row.match(/<x:c(?:\s[^>]*?)?(?:\/>|>[\s\S]*?<\/x:c>)/g) ?? []).map((cell): XlsxCell => {
      const t = /\st="(\w+)"/.exec(cell)?.[1] ?? "n";
      const value = /<x:v>([\s\S]*?)<\/x:v>/.exec(cell)?.[1];
      return {
        type: t === "str" || t === "n" ? t : "other",
        text: unescapeXml(value ?? ""),
        hasValue: value !== undefined,
      };
    }),
  );
}

/** Rows of the string cells' text (other cells become empty strings). */
const readXlsxStrings = (path: string): string[][] =>
  readXlsxCells(path).map((row) => row.map((c) => (c.type === "str" ? c.text : "")));

/** Decoded text of every part of the workbook. */
const xlsxPartTexts = (path: string): string[] =>
  Object.values(unzip(path)).map((data) => unescapeXml(strFromU8(data)));

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

  describe("trips-2025.xlsx", () => {
    const [header, ...rows] = readXlsxCells(fixture("trips-2025.xlsx"));
    const names = header!.map((c) => c.text);
    const column = (name: string) => {
      const index = names.indexOf(name);
      expect(index, `column ${name}`).toBeGreaterThanOrEqual(0);
      return rows.map((row) => row[index]!);
    };

    it("has the same 84 rows and 28 columns as the CSV", () => {
      expect(names).toEqual(readCsv(fixture("trips-2025.csv"))[0]);
      expect(rows).toHaveLength(84);
      for (const row of rows) expect(row).toHaveLength(28);
    });

    it("has no document properties and no shared strings", () => {
      const parts = Object.keys(unzip(fixture("trips-2025.xlsx")));
      expect(parts.filter((p) => p.startsWith("docProps/"))).toEqual([]);
      expect(parts).not.toContain("xl/sharedStrings.xml");
    });

    it.each([
      "Buchungsbeginn",
      "Buchungsende",
      "Rechnungsdatum",
      "Betrag Zeit",
      "Betrag Kilometer",
      "Betrag Gesamt",
      "Kilometer",
    ])("%s is a numeric cell in all rows", (name) => {
      const cells = column(name);
      expect(cells[0]).toMatchObject({ type: "n", hasValue: true });
      expect(cells.filter((c) => c.type === "n" && c.hasValue)).toHaveLength(84);
    });

    it.each(["Datum", "Stadt", "Wagenklasse", "Tarif"])(
      "%s is a string cell in all rows",
      (name) => {
        const cells = column(name);
        expect(cells[0]).toMatchObject({ type: "str", hasValue: true });
        expect(cells.filter((c) => c.type === "str" && c.hasValue)).toHaveLength(84);
      },
    );

    it("has Fahrtbeginn as a numeric cell in exactly 7 rows", () => {
      expect(column("Fahrtbeginn").filter((c) => c.type === "n" && c.hasValue)).toHaveLength(7);
    });
  });

  describe("personal data", () => {
    const present = (names: string[]) => names.filter((n) => existsSync(resolve(root, n)));
    const csvOriginals = present(ORIGINALS.csv);
    const xlsxOriginals = present(ORIGINALS.xlsx);

    it.skipIf(csvOriginals.length + xlsxOriginals.length === 0)(
      "does not leak any value of the local originals into a fixture",
      () => {
        const values = personalValues([
          ...csvOriginals.map((name) => readCsv(resolve(root, name))),
          ...xlsxOriginals.map((name) => readXlsxStrings(resolve(root, name))),
        ]);
        expect(values.length).toBeGreaterThan(0);

        // Long values are searched as substrings anywhere (every zip part for the XLSX), short
        // ones only as whole fields or cells to avoid false positives from common short words.
        const texts = [
          ...["trips-2025.csv", "trips-2026.csv"].map((n) => readFileSync(fixture(n), "utf8")),
          ...xlsxPartTexts(fixture("trips-2025.xlsx")),
        ];
        const fields = new Set([
          ...["trips-2025.csv", "trips-2026.csv"].flatMap((n) => readCsv(fixture(n)).flat()),
          ...readXlsxStrings(fixture("trips-2025.xlsx")).flat(),
        ]);
        const leaked = values.filter((value) =>
          value.length >= 6 ? texts.some((t) => t.includes(value)) : fields.has(value),
        );
        // Report only the count: the values themselves are personal data.
        expect(leaked.length).toBe(0);
      },
    );
  });
});

const TARIFFS = ["AKTIV", "BASIS", "CAMPUS", "COMFORT"];

describe("calculator fixtures", () => {
  interface Entry {
    surchargeCents: number;
    costs: Record<string, { time: number; km: number; total: number }>;
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
        for (const amount of [time, km, total]) expect(typeof amount).toBe("number");
        expect(Math.abs(total - (time + km))).toBeLessThanOrEqual(0.005);
      }
    }
  });
});
