import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/import/fields";
import { dateParts, parseLocal } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import type { PriceClass, TariffId } from "@/domain/pricing/types";
import {
  reconstructBooking,
  type Reconstruction,
  type ReconstructionKind,
} from "./reconstruct-booking";

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");

/** Minimal reader for the anonymised portal CSV (no quoted fields in the fixtures). */
function readTrips(name: string): Trip[] {
  const text = readFileSync(resolve(FIXTURES, name), "utf8").replace(/^\uFEFF/, "");
  const [header = "", ...lines] = text.split("\r\n").filter((line) => line !== "");
  const columns = header.split(";");
  const column = (fields: string[], name: string): string => {
    const value = fields[columns.indexOf(name)];
    if (value === undefined) throw new Error(`Missing column ${name}`);
    return value;
  };
  const time = (text: string) => {
    const t = parseLocal(text);
    if (t === null) throw new Error(`Bad time ${text}`);
    return t;
  };
  const cents = (text: string) => Math.round(Number(text.replace(",", ".")) * 100);
  return lines.map((line, index) => {
    const fields = line.split(";");
    const vehicleClass = column(fields, "Wagenklasse");
    return {
      id: `${name}#${index + 1}`,
      city: column(fields, "Stadt"),
      vehicleClass,
      priceClass: vehicleClass.split(" ")[0] as PriceClass,
      start: time(column(fields, "Buchungsbeginn")),
      end: time(column(fields, "Buchungsende")),
      km: Number(column(fields, "Kilometer")),
      billedTime: cents(column(fields, "Betrag Zeit")),
      billedKm: cents(column(fields, "Betrag Kilometer")),
      tariff: column(fields, "Tarif") as TariffId,
    };
  });
}

const trips = [...readTrips("trips-2025.csv"), ...readTrips("trips-2026.csv")];
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

  it("explains every time amount but one to within 1 cent", () => {
    const misses = results.filter(({ r }) => Math.abs(r.timeDeviation) > 1);
    expect(misses).toHaveLength(1);
  });

  it("classifies the trips (one not reproducible, one cancelled, one unused)", () => {
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
    expect(counts["not-reproducible"]).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.unused).toBe(1);
  });
});
