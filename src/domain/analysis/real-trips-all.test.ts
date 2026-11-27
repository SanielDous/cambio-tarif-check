import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns } from "@/domain/import/detect-columns";
import type { Trip } from "@/domain/import/fields";
import { normalizeRows } from "@/domain/import/normalize-rows";
import { readTable } from "@/domain/import/read-table";
import { dateParts, toLocalMinute } from "@/domain/pricing/local-time";
import { PRICE_DATA, pricesAt } from "@/domain/pricing/price-data";
import { timeCost } from "@/domain/pricing/time-cost";
import {
  reconstructBooking,
  type Reconstruction,
  type ReconstructionKind,
} from "./reconstruct-booking";

/**
 * Every trip of the full anonymised export (`trips-all.csv`, 154 trips from 2023-10-03 to
 * 2026-05-12), reconstructed with the price list valid at its return. The 27 trips returned before
 * 2024-05-02 are priced with the list of 2023-06-01; reproducing their km amounts with the table
 * surcharge proves the surcharge periods of 2023 and early 2024.
 */

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");

async function importFixture(name: string) {
  const file = new File([readFileSync(resolve(FIXTURES, name))], name);
  const table = await readTable(file);
  return normalizeRows(table, detectColumns(table.headers).mapping, PRICE_DATA);
}

const { trips, problems } = await importFixture("trips-all.csv");
const results: { trip: Trip; r: Reconstruction }[] = trips.map((trip) => ({
  trip,
  r: reconstructBooking(trip, pricesAt(PRICE_DATA, trip.end)),
}));

const NEW_PRICES = toLocalMinute(2024, 5, 2);
const FIRST_OLD_FIXTURE_DAY = toLocalMinute(2024, 12, 31);

const GROUPS = {
  "returned before 2024-05-02": results.filter(({ trip }) => trip.end < NEW_PRICES),
  "returned 2024-05-02 to 2024-12-30": results.filter(
    ({ trip }) => trip.end >= NEW_PRICES && trip.end < FIRST_OLD_FIXTURE_DAY,
  ),
  all: results,
};

const fmt = (t: number) => {
  const p = dateParts(t);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}`;
};

function kinds(list: typeof results): Partial<Record<ReconstructionKind, number>> {
  const counts: Partial<Record<ReconstructionKind, number>> = {};
  for (const { r } of list) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}

describe("reconstruction of all exported trips", () => {
  it("imports all 154 trips without a problem", () => {
    expect(problems).toEqual([]);
    expect(trips).toHaveLength(154);
    expect(GROUPS["returned before 2024-05-02"]).toHaveLength(27);
    expect(GROUPS["returned 2024-05-02 to 2024-12-30"]).toHaveLength(42);
  });

  it("contains every trip of the two older fixtures", async () => {
    const ids = new Set(trips.map((t) => t.id));
    const older = [
      ...(await importFixture("trips-2025.csv")).trips,
      ...(await importFixture("trips-2026.csv")).trips,
    ];
    expect(older).toHaveLength(85);
    expect(older.filter((t) => !ids.has(t.id))).toEqual([]);
    expect(trips.filter((t) => t.end >= FIRST_OLD_FIXTURE_DAY)).toHaveLength(85);
  });

  it("reproduces every km amount exactly with the table surcharge, without deriving one", () => {
    const misses = results.filter(({ r }) => r.kmDeviation !== 0 || r.surchargeDerived);
    expect(misses.map(({ trip }) => fmt(trip.start))).toEqual([]);
  });

  it("charges the surcharge periods of 2023 and 2024 as the table says", () => {
    const surcharges = GROUPS["returned before 2024-05-02"].map(({ trip, r }) => [
      fmt(trip.end).slice(0, 10),
      r.surchargeCents,
    ]);
    // +2 ct from 2023-08-15 (all trips of 2023), +1 ct from 2023-12-15.
    expect(surcharges.filter(([day]) => (day as string) < "2023-12-15").map(([, c]) => c)).toEqual(
      Array<number>(9).fill(2),
    );
    expect(surcharges.filter(([day]) => (day as string) >= "2023-12-15").map(([, c]) => c)).toEqual(
      Array<number>(18).fill(1),
    );
  });

  it("explains every time amount to within 1 cent", () => {
    const misses = results.filter(({ r }) => Math.abs(r.timeDeviation) > 1);
    expect(misses.map(({ trip }) => fmt(trip.start))).toEqual([]);
  });

  it("classifies the trips of each period", () => {
    for (const [name, list] of Object.entries(GROUPS)) {
      console.info(`Reconstruction kinds, ${name} (${list.length}):`, kinds(list));
    }
    for (const { trip, r } of GROUPS["returned before 2024-05-02"].filter(
      ({ r }) => r.kind !== "verified",
    )) {
      console.info(
        `${r.kind.padEnd(17)} ${trip.tariff} ${trip.priceClass} ${fmt(trip.start)} → ` +
          `${fmt(trip.end)}, ${trip.km} km, billed ${trip.billedTime}, booked end ` +
          `${fmt(r.bookedEnd)}, deviation ${r.timeDeviation}`,
      );
    }
    expect(kinds(GROUPS["returned before 2024-05-02"])).toEqual({
      verified: 16,
      "verified-rounding": 10,
      cancelled: 1,
    });
    expect(kinds(GROUPS["returned 2024-05-02 to 2024-12-30"])).toEqual({
      verified: 36,
      "verified-rounding": 6,
    });
    expect(kinds(GROUPS.all)).toEqual({
      verified: 125,
      "verified-rounding": 25,
      cancelled: 2,
      unused: 1,
      overrun: 1,
    });
  });

  it("prices the trip on 3 October 2023, a holiday in Aachen, at the BASIS weekend price", () => {
    const holiday = results.filter(({ trip }) => fmt(trip.start).startsWith("2023-10-03"));
    expect(holiday.map(({ trip }) => [trip.tariff, trip.priceClass, trip.city])).toEqual([
      ["BASIS", "S", "Aachen"],
    ]);
    const [{ trip, r }] = holiday as [(typeof results)[number]];
    // 17:15 to 22:15, five hours at 3.95 instead of 3.35.
    expect([fmt(r.bookedEnd), trip.billedTime, r.kind]).toEqual([
      "2023-10-03 22:15",
      5 * 395,
      "verified",
    ]);
  });

  it("has no trip before 2024-05-02 that reaches a day cap", () => {
    // The flat day and week prices of the 2023 list are therefore not tested by a real trip. The
    // longest booking (2023-12-02, AKTIV S, 10:00 to 22:00) costs 12 × 1.90 = 22.80 uncapped,
    // below the flat day price of 23.00.
    const old = GROUPS["returned before 2024-05-02"];
    const longest = Math.max(...old.map(({ r, trip }) => r.bookedEnd - trip.start));
    expect(longest).toBe(12 * 60);
    const uncapped = structuredClone(pricesAt(PRICE_DATA, NEW_PRICES - 1));
    for (const tariff of Object.values(uncapped.tariffs)) {
      for (const price of Object.values(tariff.prices)) {
        price.dayCap = 1e9;
        price.weekCap = 1e9;
      }
    }
    for (const { trip, r } of old) {
      const prices = pricesAt(PRICE_DATA, trip.end);
      const cost = (data: typeof prices) =>
        timeCost(trip.start, r.bookedEnd, trip.tariff, trip.priceClass, data, trip.city);
      expect(cost(uncapped), fmt(trip.start)).toBe(cost(prices));
    }
  });
});
