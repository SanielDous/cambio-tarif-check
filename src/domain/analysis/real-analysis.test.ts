import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns } from "@/domain/import/detect-columns";
import { dedupeTrips } from "@/domain/import/dedupe";
import type { Trip } from "@/domain/import/fields";
import { normalizeRows } from "@/domain/import/normalize-rows";
import { readTable } from "@/domain/import/read-table";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import { analyze, type Settings } from "./analyze";

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");
const SETTINGS: Settings = {
  additionalDrivers: 0,
  under26: false,
  period: null,
  manualBookedEnds: {},
  actualTariffOverrides: {},
};

async function readTrips(name: string): Promise<Trip[]> {
  const file = new File([readFileSync(resolve(FIXTURES, name))], name);
  const table = await readTable(file);
  return normalizeRows(table, detectColumns(table.headers).mapping, PRICE_DATA).trips;
}

const trips = dedupeTrips([
  ...(await readTrips("trips-2025.csv")),
  ...(await readTrips("trips-2026.csv")),
]).trips;

describe("analysis of the fixtures", () => {
  const started = performance.now();
  const a = analyze(trips, SETTINGS, PRICE_DATA);
  const elapsed = performance.now() - started;

  it("runs fast enough to re-run on every settings change", () => {
    expect(trips).toHaveLength(85);
    expect(elapsed).toBeLessThan(1000);
  });

  it("spans the expected months", () => {
    expect(a?.months).toHaveLength(18);
    expect(a?.months[0]?.month).toBe("2024-12");
    expect(a?.months[17]?.month).toBe("2026-05");
    expect(a?.months[0]?.actualTariff).toBe("AKTIV");
    for (const m of a?.months.slice(13, 17) ?? []) {
      expect(m.tripIds).toEqual([]);
      expect(m.actualTariff).toBe("AKTIV");
    }
  });

  it("finds the switches and compared tariffs", () => {
    expect(a?.months.filter((m) => m.switched)).toHaveLength(7);
    expect(a?.tariffs).toEqual(["BASIS", "AKTIV", "COMFORT"]);
  });

  it("keeps all figures consistent", () => {
    if (!a) throw new Error("no analysis");
    const totals = a.tariffs.map((t) => a.totals[t] as number);
    for (const n of [a.actualTotal, a.optimalPath.total, ...totals]) {
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(a.optimalPath.total).toBeLessThanOrEqual(a.bestSingle.total);
    expect(a.bestSingle.total).toBeLessThanOrEqual(Math.max(...totals));
    expect(a.verification).toEqual({
      verified: 73,
      "verified-rounding": 9,
      estimated: 0,
      manual: 0,
      cancelled: 1,
      unused: 1,
      overrun: 1,
      "not-reproducible": 0,
    });
    expect(a.optimalPath.tariffs).toHaveLength(18);
  });

  it("reproduces the recorded figures", () => {
    // The overrun of 2025-05-09 adds its 13 doubled minutes in every tariff: AKTIV +91,
    // COMFORT +80, BASIS +180 (Friday evening, weekend price 4.15).
    // The unused booked time is priced as a span of its own (invoice of the 8-day trip). On four
    // weekend trips used and unused time together exceed the BASIS day cap (12 weekday hours,
    // less than 12 weekend hours), which no longer limits their sum: BASIS +3.02 (2025-10-11),
    // +3.25 (2025-11-08), +3.02 (2025-12-06), and +12.48 for 2025-07-19, whose booked end also
    // moves from Sunday 09:30 to Saturday 21:30, as invoiced. +21.77 in all over 317,701.
    // AKTIV and COMFORT have no weekend price and do not change.
    expect(a?.totals).toEqual({ BASIS: 319878, AKTIV: 240102, COMFORT: 240870 });
    expect(a?.actualTotal).toBe(231249);
    expect(a?.bestSingle).toEqual({ tariff: "AKTIV", total: 240102, saving: -8853 });
    // The path keeps Aktiv in May 2025, so it rises by the Aktiv change only: 224,751 + 91.
    expect(a?.optimalPath.total).toBe(224842);
    expect(a?.optimalPath.switches).toBe(7);
    expect(a?.recomputationDeviation).toBe(9);
    expect(a?.breakEven).toMatchObject([
      // 11.00 / (1 − 220,302 / 319,878) = 3,533.6
      { lower: "BASIS", higher: "AKTIV", monthlyTripCost: 3534 },
      { lower: "AKTIV", higher: "COMFORT", monthlyTripCost: 12574 },
    ]);
    for (const b of a?.breakEven ?? []) {
      expect(b.months).toHaveLength(18);
      expect(b.monthsAbove).toBe(b.months.filter((m) => m.above).length);
    }
  });
});

describe("override on the fixtures", () => {
  it("turns the empty months of 2026 into Basis", () => {
    const base = analyze(trips, SETTINGS, PRICE_DATA);
    const a = analyze(
      trips,
      { ...SETTINGS, actualTariffOverrides: { "2026-01": "BASIS" } },
      PRICE_DATA,
    );
    const rows = a?.months.slice(13, 18) ?? [];
    expect(rows.map((m) => m.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(rows.map((m) => m.actualTariff)).toEqual(Array(5).fill("BASIS"));
    expect(rows.slice(0, 4).map((m) => m.actualTariffSource)).toEqual([
      "override",
      "inherited",
      "inherited",
      "inherited",
    ]);
    expect(rows.map((m) => m.switched)).toEqual([true, false, false, false, false]);
    expect(a?.months.filter((m) => m.switched)).toHaveLength(7);
    expect((base?.actualTotal ?? 0) - (a?.actualTotal ?? 0)).toBe(4 * 1100);
  });
});

describe("period filter on the fixtures", () => {
  it("keeps the inherited Aktiv months of 2026 before the Basis trip in May", () => {
    const a = analyze(
      trips,
      { ...SETTINGS, period: { from: "2026-01", to: "2026-05" } },
      PRICE_DATA,
    );
    expect(a?.months.map((m) => m.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(a?.months.map((m) => m.actualTariff)).toEqual([
      "AKTIV",
      "AKTIV",
      "AKTIV",
      "AKTIV",
      "BASIS",
    ]);
    expect(a?.months.map((m) => m.switched)).toEqual([false, false, false, false, true]);
    // 4 × 11.00 Aktiv fee + 19.67 + 5.46 billed in May + 5.00 switching fee.
    expect(a?.actualTotal).toBe(4 * 1100 + 1967 + 546 + 500);
    expect(a?.bestSingle.tariff).toBe("BASIS");
    expect(a?.months.every((m) => m.actualTariff === a.bestSingle.tariff)).toBe(false);
  });
});

describe("partial months of the fixtures", () => {
  it("flags the first (trip on the 31st) and the last month (trip on the 12th)", () => {
    const a = analyze(trips, SETTINGS, PRICE_DATA);
    const partial = a?.months.filter((m) => m.partial).map((m) => m.month);
    expect(partial).toEqual(["2024-12", "2026-05"]);
    expect(a?.months.some((m) => m.incomplete)).toBe(false);
  });
});

describe("month breakdown of the fixtures", () => {
  const a = analyze(trips, SETTINGS, PRICE_DATA);

  it("adds up to the cost of every compared tariff and to the actual cost, in every month", () => {
    for (const m of a?.months ?? []) {
      for (const t of a?.tariffs ?? []) {
        const b = m.breakdown[t];
        expect(b, `${m.month} ${t}`).toBeDefined();
        expect((b?.time ?? 0) + (b?.km ?? 0) + (b?.fee ?? 0) + (b?.driverFee ?? 0)).toBe(
          m.costs[t],
        );
      }
      const x = m.actualBreakdown;
      expect(x.billedTime + x.billedKm + x.fee + x.driverFee + x.switchFee).toBe(m.actualCost);
    }
  });

  it("counts trips and kilometres per month and sums them to the totals", () => {
    const months = a?.months ?? [];
    expect(months.reduce((s, m) => s + m.tripCount, 0)).toBe(a?.trips.length);
    expect(months.reduce((s, m) => s + m.km, 0)).toBe(a?.trips.reduce((s, r) => s + r.trip.km, 0));
    expect(months.every((m) => m.tripCount === m.tripIds.length)).toBe(true);
  });

  it("charges every trip at least its booked time and sums the minutes per month", () => {
    const minutes = (a?.trips ?? []).map((r) => r.reconstruction.chargedUntil - r.trip.start);
    expect(minutes.every((x) => x > 0)).toBe(true);
    expect(a?.months.reduce((s, m) => s + m.chargedMinutes, 0)).toBe(
      minutes.reduce((s, x) => s + x, 0),
    );
    for (const m of a?.months ?? []) expect(m.chargedMinutes > 0).toBe(m.tripCount > 0);
  });
});
