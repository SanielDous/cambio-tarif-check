import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/import/fields";
import { detectColumns } from "@/domain/import/detect-columns";
import { normalizeRows } from "@/domain/import/normalize-rows";
import { readTable } from "@/domain/import/read-table";
import { dateParts } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import {
  reconstructBooking,
  type Reconstruction,
  type ReconstructionKind,
} from "./reconstruct-booking";

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");

async function readTrips(name: string): Promise<Trip[]> {
  const file = new File([readFileSync(resolve(FIXTURES, name))], name);
  const table = await readTable(file);
  const { trips, problems } = normalizeRows(
    table,
    detectColumns(table.headers).mapping,
    PRICE_DATA,
  );
  if (problems.length > 0) throw new Error(`Problems in ${name}: ${JSON.stringify(problems)}`);
  return trips;
}

const trips = [...(await readTrips("trips-2025.csv")), ...(await readTrips("trips-2026.csv"))];
const results: { trip: Trip; r: Reconstruction }[] = trips.map((trip) => ({
  trip,
  r: reconstructBooking(trip, PRICE_DATA),
}));

const fmt = (t: number) => {
  const p = dateParts(t);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}`;
};

describe("reconstruction of the real, anonymised trips", () => {
  it("reads all 85 trips", () => {
    expect(trips).toHaveLength(85);
  });

  it("reproduces all 85 km amounts exactly with the table surcharge", () => {
    const misses = results.filter(({ r }) => r.kmDeviation !== 0 || r.surchargeDerived);
    expect(misses.map(({ trip }) => trip.id)).toEqual([]);
  });

  it("explains every time amount to within 1 cent", () => {
    const misses = results.filter(({ r }) => Math.abs(r.timeDeviation) > 1);
    expect(misses).toHaveLength(0);
  });

  it("classifies the trips (one overrun, one cancelled, one unused, none not reproducible)", () => {
    const counts: Partial<Record<ReconstructionKind, number>> = {};
    for (const { r } of results) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    console.info("Reconstruction kinds of the 85 real trips:", counts);
    for (const { trip, r } of results.filter(({ r }) => r.kind !== "verified")) {
      console.info(
        `${r.kind.padEnd(17)} ${trip.tariff} ${trip.priceClass} ${fmt(trip.start)} → ` +
          `${fmt(trip.end)}, ${trip.km} km, billed ${trip.billedTime}, booked end ` +
          `${fmt(r.bookedEnd)}, deviation ${r.timeDeviation}`,
      );
    }
    expect(counts).toEqual({
      verified: 73,
      "verified-rounding": 9,
      cancelled: 1,
      unused: 1,
      overrun: 1,
    });
  });

  it("finds the late return of 2025-05-09: booked until 20:00, returned 13 minutes later", () => {
    const late = results.filter(({ r }) => r.kind === "overrun");
    expect(
      late.map(({ trip, r }) => [fmt(trip.start), fmt(r.bookedEnd), r.overrunMinutes]),
    ).toEqual([["2025-05-09 15:00", "2025-05-09 20:00", 13]]);
    expect(late[0]?.r.timeDeviation).toBe(0);
  });
});
