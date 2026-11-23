import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dateParts, parseLocal } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import { dedupeTrips } from "./dedupe";
import { detectColumns } from "./detect-columns";
import { ImportError, type RawTable, type RowProblem, type Trip } from "./fields";
import { normalizeRows } from "./normalize-rows";
import { readTable } from "./read-table";

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");

function fixtureFile(name: string): File {
  return new File([readFileSync(resolve(FIXTURES, name))], name);
}

async function importFile(file: File): Promise<{ trips: Trip[]; problems: RowProblem[] }> {
  const table = await readTable(file);
  const { mapping, missing, ambiguous } = detectColumns(table.headers);
  expect(missing).toEqual([]);
  expect(ambiguous).toEqual([]);
  return normalizeRows(table, mapping, PRICE_DATA);
}

const importFixture = (name: string) => importFile(fixtureFile(name));

describe("import of the fixtures", () => {
  it("reads trips-2025.csv: 84 trips, no problems", async () => {
    const { trips, problems } = await importFixture("trips-2025.csv");
    expect(trips).toHaveLength(84);
    expect(problems).toEqual([]);
  });

  it("reads the first trip of trips-2025.csv", async () => {
    const [first] = (await importFixture("trips-2025.csv")).trips;
    expect(first).toMatchObject({
      city: "Aachen",
      vehicleClass: "S Kleinwagen",
      priceClass: "S",
      start: parseLocal("15.12.2025 17:15"),
      end: parseLocal("15.12.2025 19:21"),
      km: 19,
      billedTime: 498,
      billedKm: 494,
      tariff: "AKTIV",
      driver: "Person A",
      status: "BILLED",
    });
    expect(dateParts(first?.start ?? 0)).toMatchObject({ year: 2025, month: 12, day: 15 });
  });

  it("reads trips-2026.csv: 1 trip", async () => {
    const { trips, problems } = await importFixture("trips-2026.csv");
    expect(trips).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it("gives every trip a distinct, stable id", async () => {
    const a = (await importFixture("trips-2025.csv")).trips;
    const b = (await importFixture("trips-2025.csv")).trips;
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
    expect(new Set(a.map((t) => t.id)).size).toBe(84);
  });

  it("reads trips-2025.xlsx deep-equal to trips-2025.csv", async () => {
    const csv = await importFixture("trips-2025.csv");
    const xlsx = await importFixture("trips-2025.xlsx");
    expect(xlsx.problems).toEqual([]);
    expect(xlsx.trips).toEqual(csv.trips);
  });

  it.each(["America/New_York", "Asia/Tokyo"])(
    "reads the XLSX identically with TZ=%s",
    async (zone) => {
      const csv = await importFixture("trips-2025.csv");
      const previous = process.env.TZ;
      process.env.TZ = zone;
      try {
        expect((await importFixture("trips-2025.xlsx")).trips).toEqual(csv.trips);
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );
});

describe("readTable", () => {
  const header =
    "Stadt;Wagenklasse;Buchungsbeginn;Buchungsende;Kilometer;Betrag Zeit;Betrag Kilometer;Tarif";
  const row = "Aachen;S Kleinwagen;15.12.2025 17:15:00;15.12.2025 19:21:00;19;4,98;4,94;AKTIV";

  it("skips a title line above the header", async () => {
    const file = new File([`Fahrtenexport\r\n\r\n${header}\r\n${row}\r\n`], "x.csv");
    const table = await readTable(file);
    expect(table.headers[0]).toBe("Stadt");
    expect(table.rows).toHaveLength(1);
    const { trips } = normalizeRows(table, detectColumns(table.headers).mapping, PRICE_DATA);
    expect(trips).toHaveLength(1);
  });

  it("detects comma and tab delimiters", async () => {
    for (const sep of [",", "\t"]) {
      const text = `${header}\n${row}`
        .replaceAll(";", sep)
        .replace("4,98", '"4,98"')
        .replace("4,94", '"4,94"');
      const table = await readTable(new File([text], "x.csv"));
      expect(table.headers).toHaveLength(8);
      expect(table.rows[0]?.[5]).toBe("4,98");
    }
  });

  it("re-decodes windows-1252 files", async () => {
    const text = `${header.replace("Stadt", "Städte")};Währung\r\n${row};EUR\r\n`;
    const table = await readTable(new File([Buffer.from(text, "latin1")], "x.csv"));
    expect(table.headers[0]).toBe("Städte");
    expect(table.headers[8]).toBe("Währung");
  });

  it("rejects an empty file", async () => {
    await expect(readTable(new File([], "x.csv"))).rejects.toMatchObject({
      name: "ImportError",
      code: "empty",
    });
    await expect(readTable(new File(["\r\n\r\n"], "x.csv"))).rejects.toMatchObject({
      code: "empty",
    });
  });

  it("rejects a file without a header row as unsupported", async () => {
    await expect(readTable(new File(["a;b;c\n1;2;3"], "x.csv"))).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects an unknown extension as unsupported", async () => {
    const error = await readTable(new File(["x"], "x.pdf")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect(error).toMatchObject({ code: "unsupported" });
  });

  it("rejects random bytes with an ImportError, never another error", async () => {
    const bytes = new Uint8Array(2048);
    let seed = 12345;
    for (let i = 0; i < bytes.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bytes[i] = seed >> 16;
    }
    for (const name of ["x.csv", "x.xlsx"]) {
      const error = await readTable(new File([bytes], name)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ImportError);
      expect(["unsupported", "unreadable"]).toContain((error as ImportError).code);
    }
  });

  it("rejects files above 5 MB", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "x.csv");
    await expect(readTable(big)).rejects.toMatchObject({ code: "too-large" });
  });
});

describe("normalizeRows", () => {
  const headers = [
    "Stadt",
    "Wagenklasse",
    "Buchungsbeginn",
    "Buchungsende",
    "Kilometer",
    "Betrag Zeit",
    "Betrag Kilometer",
    "Tarif",
  ];
  const good: unknown[] = [
    "Aachen",
    "S Kleinwagen",
    "15.12.2025 17:15:00",
    "15.12.2025 19:21:00",
    "19",
    "4,98",
    "4,94",
    "AKTIV",
  ];
  const table = (...rows: unknown[][]): RawTable => ({ fileName: "t.csv", headers, rows });
  const mapping = detectColumns(headers).mapping;
  const run = (row: unknown[]) => normalizeRows(table(row), mapping, PRICE_DATA);
  /** The good row with some cells replaced. */
  const row = (changes: Record<number, unknown>): unknown[] =>
    good.map((v, i) => (i in changes ? changes[i] : v));

  it("accepts the good row", () => {
    const { trips, problems } = run(good);
    expect(problems).toEqual([]);
    expect(trips[0]).toMatchObject({ km: 19, billedTime: 498, billedKm: 494, tariff: "AKTIV" });
  });

  it.each<[string, unknown[], RowProblem["reason"]]>([
    ["invalid-date", row({ 2: "gestern" }), "invalid-date"],
    ["an impossible date", row({ 3: "31.02.2025 10:00:00" }), "invalid-date"],
    ["invalid-number (km)", row({ 4: "viel" }), "invalid-number"],
    ["invalid-number (amount)", row({ 5: "4,9x" }), "invalid-number"],
    ["end-before-start", row({ 3: "15.12.2025 17:00:00" }), "end-before-start"],
    [
      "before-price-data",
      row({ 2: "01.01.2024 10:00:00", 3: "01.01.2024 12:00:00" }),
      "before-price-data",
    ],
    ["unknown-tariff", row({ 7: "PREMIUM" }), "unknown-tariff"],
    ["unknown-tariff (empty)", row({ 7: "" }), "unknown-tariff"],
    ["unknown-class", row({ 1: "Z Bus" }), "unknown-class"],
    ["not-billed", row({ 5: "", 6: "" }), "not-billed"],
  ])("reports %s", (_name, cells, reason) => {
    const { trips, problems } = run(cells);
    expect(trips).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ fileName: "t.csv", rowNumber: 2, reason });
  });

  it("numbers rows from 2 and skips blank rows", () => {
    const { trips, problems } = normalizeRows(
      table(good, ["", null, "  ", undefined], row({ 7: "X" })),
      mapping,
      PRICE_DATA,
    );
    expect(trips).toHaveLength(1);
    expect(problems.map((p) => p.rowNumber)).toEqual([4]);
  });

  it("parses numbers as text with decimal comma and thousands point", () => {
    const { trips } = run(row({ 4: "1.234,5", 5: "1.234,56" }));
    expect(trips[0]).toMatchObject({ km: 1234.5, billedTime: 123456 });
  });

  it("accepts numeric cells and rounds amounts to cents", () => {
    const { trips } = run(row({ 4: 19, 5: 4.98, 6: 19.995 }));
    expect(trips[0]).toMatchObject({ km: 19, billedTime: 498, billedKm: 2000 });
  });

  it("accepts Date cells from their UTC components", () => {
    const { trips } = run(
      row({
        2: new Date(Date.UTC(2025, 11, 15, 17, 15)),
        3: new Date(Date.UTC(2025, 11, 15, 19, 21)),
      }),
    );
    expect(trips[0]?.start).toBe(parseLocal("15.12.2025 17:15"));
    expect(trips[0]?.end).toBe(parseLocal("15.12.2025 19:21"));
  });

  it("takes the price class from the first token and the tariff trimmed, upper-case", () => {
    const { trips } = run(row({ 1: "XL Transporter", 7: " aktiv " }));
    expect(trips[0]).toMatchObject({
      priceClass: "XL",
      vehicleClass: "XL Transporter",
      tariff: "AKTIV",
    });
  });
});

describe("dedupeTrips", () => {
  it("drops trips imported twice", async () => {
    const { trips } = await importFixture("trips-2025.csv");
    const result = dedupeTrips([...trips, ...trips]);
    expect(result.trips).toHaveLength(84);
    expect(result.duplicates).toBe(84);
  });

  it("keeps the trips of two different files", async () => {
    const a = (await importFixture("trips-2025.csv")).trips;
    const b = (await importFixture("trips-2026.csv")).trips;
    const result = dedupeTrips([...a, ...b]);
    expect(result.trips).toHaveLength(85);
    expect(result.duplicates).toBe(0);
  });
});
