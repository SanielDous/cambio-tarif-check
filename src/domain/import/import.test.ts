import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reconstructBooking } from "@/domain/analysis/reconstruct-booking";
import { dateParts, parseLocal } from "@/domain/pricing/local-time";
import { latestPrices, PRICE_DATA } from "@/domain/pricing/price-data";
import { dedupeTrips } from "./dedupe";
import { detectColumns } from "./detect-columns";
import type { PriceData } from "@/domain/pricing/types";
import { bookingKey, ImportError, type RawTable, type RowProblem, type Trip } from "./fields";
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
  const table = (...rows: unknown[][]): RawTable => ({
    fileName: "t.csv",
    headers,
    rows,
    rowNumbers: rows.map((_, i) => i + 2),
  });
  const mapping = detectColumns(headers).mapping;
  const run = (row: unknown[]) => normalizeRows(table(row), mapping, PRICE_DATA);
  /** The good row with some cells replaced. */
  const row = (changes: Record<number, unknown>): unknown[] =>
    good.map((v, i) => (i in changes ? changes[i] : v));

  it("accepts a trip from the first day of the price data on", () => {
    const { trips, problems } = run(row({ 2: "31.05.2023 23:00:00", 3: "01.06.2023 01:00:00" }));
    expect(problems).toEqual([]);
    expect(trips).toHaveLength(1);
    const before = run(row({ 2: "31.05.2023 21:00:00", 3: "31.05.2023 23:59:00" })).problems;
    expect(before).toMatchObject([{ reason: "before-price-data", detail: "2023-06-01" }]);
  });

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
      row({ 2: "31.05.2023 10:00:00", 3: "31.05.2023 12:00:00" }),
      "before-price-data",
    ],
    [
      "unknown-tariff (START before 2024-05-02)",
      row({ 2: "01.01.2024 10:00:00", 3: "01.01.2024 12:00:00", 7: "START" }),
      "unknown-tariff",
    ],
    [
      "unknown-class (XL before 2024-05-02)",
      row({ 1: "XL Transporter XL", 2: "01.01.2024 10:00:00", 3: "01.01.2024 12:00:00" }),
      "unknown-class",
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

  describe("a price version without a tariff or class", () => {
    // Synthetic: the latest version once more, valid until 2025-12-01, without START and XL.
    const latest = PRICE_DATA.versions.at(-1)!;
    const tariffs = structuredClone(latest.tariffs);
    delete tariffs.START;
    for (const tariff of Object.values(tariffs)) delete tariff.prices.XL;
    const data: PriceData = {
      ...PRICE_DATA,
      validFrom: "2025-01-01",
      versions: [
        { ...latest, from: "2025-01-01", tariffs },
        { ...latest, from: "2025-12-01" },
      ],
    };
    const runWith = (changes: Record<number, unknown>) =>
      normalizeRows(table(row(changes)), mapping, data);
    const november = { 2: "15.11.2025 17:15:00", 3: "15.11.2025 19:21:00" };

    it("reports a tariff the version valid at the return does not have as unknown", () => {
      const { trips, problems } = runWith({ ...november, 7: "START" });
      expect(trips).toEqual([]);
      expect(problems).toMatchObject([{ reason: "unknown-tariff", detail: "START" }]);
      expect(runWith({ 7: "START" }).trips).toHaveLength(1);
    });

    it("reports a class no tariff of that version has as unknown", () => {
      const { trips, problems } = runWith({ ...november, 1: "XL Transporter XL" });
      expect(trips).toEqual([]);
      expect(problems).toMatchObject([{ reason: "unknown-class", detail: "XL Transporter XL" }]);
      expect(runWith({ 1: "XL Transporter XL" }).trips).toHaveLength(1);
    });

    it("reports a START trip in class XL before both existed as an unknown tariff", () => {
      const { problems } = runWith({ ...november, 1: "XL Transporter XL", 7: "START" });
      expect(problems).toMatchObject([{ reason: "unknown-tariff" }]);
    });
  });

  describe("not yet billed rows", () => {
    const withStatus = [...headers, "Verarbeitungsstatus"];
    const statusMapping = detectColumns(withStatus).mapping;
    const runStatus = (status: unknown, changes: Record<number, unknown> = {}) =>
      normalizeRows(
        {
          fileName: "t.csv",
          headers: withStatus,
          rows: [[...row(changes), status]],
          rowNumbers: [2],
        },
        statusMapping,
        PRICE_DATA,
      );

    it("reports both amounts empty with the month of the row's end", () => {
      const { problems } = run(row({ 3: "01.01.2026 01:00:00", 5: "", 6: "" }));
      expect(problems).toEqual([
        {
          fileName: "t.csv",
          rowNumber: 2,
          reason: "not-billed",
          month: "2026-01",
          bookingKey: bookingKey(run(good).trips[0] as Trip),
        },
      ]);
    });

    it("keys the row by start, class and city, the same as the billed trip", () => {
      const billed = run(good).trips[0] as Trip;
      const key = (changes: Record<number, unknown>) =>
        run(row({ 5: "", 6: "", ...changes })).problems[0]?.bookingKey;
      // The end differs before and after the trip: booked end, then the actual return.
      expect(key({ 3: "15.12.2025 20:00:00" })).toBe(bookingKey(billed));
      expect(key({ 2: "15.12.2025 17:30:00" })).not.toBe(bookingKey(billed));
      expect(key({ 1: "M Kompakt" })).not.toBe(bookingKey(billed));
      expect(key({ 0: "Köln" })).not.toBe(bookingKey(billed));
      expect(billed.id).not.toContain(bookingKey(billed));
    });

    it("leaves the month out when the end cannot be read", () => {
      const { problems } = run(row({ 3: "bald", 5: "", 6: "" }));
      expect(problems[0]?.reason).toBe("not-billed");
      expect(problems[0]).not.toHaveProperty("month");
    });

    it("leaves the booking key out when the start cannot be read", () => {
      const { problems } = run(row({ 2: "bald", 5: "", 6: "" }));
      expect(problems[0]?.reason).toBe("not-billed");
      expect(problems[0]).not.toHaveProperty("bookingKey");
    });

    it("decides an unknown status by the amounts and records it", () => {
      const billed = runStatus("ABGERECHNET");
      expect(billed.trips).toHaveLength(1);
      expect(billed.problems).toEqual([]);
      expect(billed.unknownStatuses).toEqual([{ value: "ABGERECHNET", rows: 1 }]);

      const open = runStatus("OPEN", { 5: "", 6: "" });
      expect(open.trips).toEqual([]);
      expect(open.problems).toMatchObject([
        { fileName: "t.csv", rowNumber: 2, reason: "not-billed", month: "2025-12" },
      ]);
      expect(open.unknownStatuses).toEqual([{ value: "OPEN", rows: 1 }]);
    });

    it("counts the rows per unknown status value", () => {
      const { trips, unknownStatuses } = normalizeRows(
        {
          fileName: "t.csv",
          headers: withStatus,
          rows: [
            [...row({}), "NEU"],
            [...row({ 2: "16.12.2025 10:00:00", 3: "16.12.2025 11:00:00" }), "NEU"],
            [...row({ 2: "17.12.2025 10:00:00", 3: "17.12.2025 11:00:00" }), "BILLED"],
            [...row({ 2: "18.12.2025 10:00:00", 3: "18.12.2025 11:00:00" }), "ALT"],
          ],
          rowNumbers: [2, 3, 4, 5],
        },
        statusMapping,
        PRICE_DATA,
      );
      expect(trips).toHaveLength(4);
      expect(unknownStatuses).toEqual([
        { value: "NEU", rows: 2 },
        { value: "ALT", rows: 1 },
      ]);
    });

    it("accepts BILLED in any case and spacing, and an empty status", () => {
      expect(runStatus(" billed ").trips).toHaveLength(1);
      expect(runStatus(" billed ").unknownStatuses).toEqual([]);
      expect(runStatus("").trips).toHaveLength(1);
      expect(runStatus(null).trips).toHaveLength(1);
      expect(runStatus(null).unknownStatuses).toEqual([]);
    });

    it("decides a missing status by the amounts", () => {
      expect(runStatus("", { 5: "", 6: "" }).problems[0]?.reason).toBe("not-billed");
      expect(runStatus("", { 5: "0", 6: "0" }).problems[0]?.reason).toBe("not-billed");
      expect(runStatus("").unknownStatuses).toEqual([]);
    });

    it("keeps a known billed status with both amounts empty as not billed", () => {
      const { trips, problems } = runStatus("BILLED", { 5: "", 6: "" });
      expect(trips).toEqual([]);
      expect(problems[0]?.reason).toBe("not-billed");
    });

    it("reports zero amounts for a trip with km", () => {
      const { trips, problems } = run(row({ 5: "0", 6: "0,00" }));
      expect(trips).toEqual([]);
      expect(problems[0]).toMatchObject({ reason: "not-billed", month: "2025-12" });
    });

    it("keeps a free trip with km when its status is a known billed status", () => {
      const { trips, problems } = runStatus("BILLED", { 5: "0", 6: "0,00" });
      expect(problems).toEqual([]);
      expect(trips[0]).toMatchObject({ km: 19, billedTime: 0, billedKm: 0 });
      // Listed, and flagged by the reconstruction, since no price explains it.
      expect(reconstructBooking(trips[0] as Trip, latestPrices(PRICE_DATA)).kind).toBe(
        "not-reproducible",
      );
    });

    it("reports zero amounts with km as not billed under an unknown or missing status", () => {
      expect(runStatus("OPEN", { 5: "0", 6: "0" }).problems[0]?.reason).toBe("not-billed");
      expect(runStatus(null, { 5: "0", 6: "0" }).problems[0]?.reason).toBe("not-billed");
    });

    it("keeps zero amounts without km and one zero amount with km", () => {
      expect(run(row({ 4: "0", 5: "0", 6: "0" })).trips).toHaveLength(1);
      expect(run(row({ 5: "0" })).trips).toHaveLength(1);
    });
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

describe("trip end (Fahrtende)", () => {
  const headers = [
    "Stadt",
    "Wagenklasse",
    "Buchungsbeginn",
    "Buchungsende",
    "Kilometer",
    "Betrag Zeit",
    "Betrag Kilometer",
    "Tarif",
    "Fahrtende",
  ];
  const run = (tripEnd: unknown) =>
    normalizeRows(
      {
        fileName: "t.csv",
        headers,
        rows: [
          [
            "Aachen",
            "S Kleinwagen",
            "09.05.2025 15:00:00",
            "09.05.2025 20:00:00",
            "22",
            "11,41",
            "5,72",
            "AKTIV",
            tripEnd,
          ],
        ],
        rowNumbers: [2],
      },
      detectColumns(headers).mapping,
      PRICE_DATA,
    );

  it("reads a valid trip end and leaves the id unchanged", () => {
    const { trips, problems } = run("09.05.2025 20:13:00");
    expect(problems).toEqual([]);
    expect(trips[0]?.tripEnd).toBe(parseLocal("09.05.2025 20:13"));
    expect(trips[0]?.id).toBe(run("").trips[0]?.id);
    expect(dedupeTrips([...run("09.05.2025 20:13:00").trips, ...run("").trips]).duplicates).toBe(1);
  });

  it("leaves an empty or unreadable trip end out without a problem", () => {
    for (const cell of ["", "  ", undefined, "kaputt"]) {
      const { trips, problems } = run(cell);
      expect(problems).toEqual([]);
      expect(trips[0]).not.toHaveProperty("tripEnd");
    }
  });

  it("is empty for the late-returned fixture trip of 2025-05-09", async () => {
    const { trips } = await importFixture("trips-2025.csv");
    const late = trips.find((t) => t.billedTime === 1141);
    expect(late?.end).toBe(parseLocal("09.05.2025 20:00"));
    expect(late?.tripEnd).toBeUndefined();
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

describe("row numbers", () => {
  const header =
    "Stadt;Wagenklasse;Buchungsbeginn;Buchungsende;Kilometer;Betrag Zeit;Betrag Kilometer;Tarif";
  const valid = "Aachen;S Kleinwagen;15.12.2025 17:15:00;15.12.2025 19:21:00;19;4,98;4,94;AKTIV";
  const invalid = valid.replace("AKTIV", "PREMIUM");

  it("reports the line number as seen in an editor", async () => {
    const text = ["Title", "", header, valid, "", invalid].join("\r\n");
    const table = await readTable(new File([text], "x.csv"));
    expect(table.rowNumbers).toEqual([4, 6]);
    const { trips, problems } = normalizeRows(
      table,
      detectColumns(table.headers).mapping,
      PRICE_DATA,
    );
    expect(trips).toHaveLength(1);
    expect(problems).toMatchObject([{ rowNumber: 6, reason: "unknown-tariff" }]);
  });

  it("rejects an unterminated quote as unreadable", async () => {
    const text = `${header}\n"Aachen;S Kleinwagen;15.12.2025 17:15:00\n`;
    await expect(readTable(new File([text], "x.csv"))).rejects.toMatchObject({
      code: "unreadable",
    });
  });
});

describe("number and time parsing", () => {
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
  const mapping = detectColumns(headers).mapping;
  const run = (changes: Record<number, unknown>) =>
    normalizeRows(
      {
        fileName: "t.csv",
        headers,
        rows: [good.map((v, i) => (i in changes ? changes[i] : v))],
        rowNumbers: [2],
      },
      mapping,
      PRICE_DATA,
    );

  it.each<[string, number]>([
    ["19", 19],
    [" 19 ", 19],
    ["-0", 0],
    ["19,5", 19.5],
    ["1.234", 1234], // German thousands point, never a decimal point with three digits
    ["1.234,5", 1234.5],
    ["1.234.567", 1234567],
    ["4.98", 4.98],
    ["4.9", 4.9],
    ["19 €", 19],
    ["19 EUR", 19],
    ["€ 19", 19],
  ])("accepts %j as km", (text, value) => {
    expect(run({ 4: text }).trips[0]?.km).toBe(value);
  });

  it.each(["1,234.56", "1.2,3", "4€98", "abc", "", "1.2345", "1,2,3", "12.", ".5", "1e3"])(
    "rejects %j as km",
    (text) => {
      const { trips, problems } = run({ 4: text });
      expect(trips).toEqual([]);
      expect(problems[0]).toMatchObject({ reason: "invalid-number" });
    },
  );

  it.each([4, 5, 6])("rejects a negative value in column %i with a detail", (column) => {
    for (const value of ["-1", -1]) {
      const { trips, problems } = run({ [column]: value });
      expect(trips).toEqual([]);
      expect(problems[0]).toMatchObject({ reason: "invalid-number" });
      expect(problems[0]?.detail).toMatch(/negative/);
    }
  });

  it("rejects non-finite numeric cells", () => {
    expect(run({ 4: Number.NaN }).problems[0]).toMatchObject({ reason: "invalid-number" });
    expect(run({ 5: Number.POSITIVE_INFINITY }).problems[0]).toMatchObject({
      reason: "invalid-number",
    });
  });

  it("truncates seconds to the minute in text and in Date cells", () => {
    const text = run({ 2: "15.12.2025 17:15:40", 3: "15.12.2025 19:21:59" }).trips[0];
    const date = run({
      2: new Date(Date.UTC(2025, 11, 15, 17, 15, 40)),
      3: new Date(Date.UTC(2025, 11, 15, 19, 21, 59)),
    }).trips[0];
    expect(text?.start).toBe(parseLocal("15.12.2025 17:15"));
    expect(text?.end).toBe(parseLocal("15.12.2025 19:21"));
    expect(date).toEqual(text);
  });

  it("tolerates a float error just below a full minute in Date cells", () => {
    const { trips } = run({
      2: new Date(Date.UTC(2025, 11, 15, 17, 14, 59, 999)),
      3: new Date(Date.UTC(2025, 11, 15, 19, 21)),
    });
    expect(trips[0]?.start).toBe(parseLocal("15.12.2025 17:15"));
  });
});
