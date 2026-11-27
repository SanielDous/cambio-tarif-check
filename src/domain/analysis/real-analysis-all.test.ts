import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns } from "@/domain/import/detect-columns";
import { dedupeTrips } from "@/domain/import/dedupe";
import type { Trip } from "@/domain/import/fields";
import { normalizeRows } from "@/domain/import/normalize-rows";
import { readTable } from "@/domain/import/read-table";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import { analyze, countAdditionalDrivers, type Settings } from "./analyze";

/**
 * The analysis of the full export (`trips-all.csv`) with the settings the app picks for it: the
 * number of additional drivers it suggests, nothing else changed.
 */

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");

async function readTrips(name: string): Promise<Trip[]> {
  const file = new File([readFileSync(resolve(FIXTURES, name))], name);
  const table = await readTable(file);
  return normalizeRows(table, detectColumns(table.headers).mapping, PRICE_DATA).trips;
}

const all = dedupeTrips(await readTrips("trips-all.csv")).trips;
const older = dedupeTrips([
  ...(await readTrips("trips-2025.csv")),
  ...(await readTrips("trips-2026.csv")),
]).trips;

const SETTINGS: Settings = {
  additionalDrivers: countAdditionalDrivers(all),
  under26: false,
  period: null,
  manualBookedEnds: {},
  actualTariffOverrides: {},
};

describe("analysis of the full export", () => {
  const a = analyze(all, SETTINGS, PRICE_DATA);
  if (!a) throw new Error("no analysis");

  it("uses the settings the app would pick: one additional driver", () => {
    expect(all).toHaveLength(154);
    expect(SETTINGS.additionalDrivers).toBe(1);
    expect(a.suggestedAdditionalDrivers).toBe(1);
  });

  it("spans 32 months from October 2023 and compares Basis, Aktiv and Comfort", () => {
    expect(a.months).toHaveLength(32);
    expect([a.months[0]?.month, a.months.at(-1)?.month]).toEqual(["2023-10", "2026-05"]);
    expect(a.months.filter((m) => m.partial).map((m) => m.month)).toEqual(["2026-05"]);
    expect(a.tariffs).toEqual(["BASIS", "AKTIV", "COMFORT"]);
    expect(a.months[0]?.actualTariff).toBe("BASIS");
    expect(a.months.filter((m) => m.switched).map((m) => m.month)).toEqual([
      "2023-11",
      "2025-01",
      "2025-03",
      "2025-07",
      "2025-08",
      "2025-11",
      "2025-12",
      "2026-05",
    ]);
    expect(a.verification).toEqual({
      verified: 125,
      "verified-rounding": 25,
      estimated: 0,
      manual: 0,
      cancelled: 2,
      unused: 1,
      overrun: 1,
      "not-reproducible": 0,
    });
  });

  it("reproduces the recorded figures", () => {
    expect(a.totals).toEqual({ BASIS: 454336, AKTIV: 356016, COMFORT: 368478 });
    expect(a.actualTotal).toBe(348457);
    expect(a.bestSingle).toEqual({ tariff: "AKTIV", total: 356016, saving: -7559 });
    expect(a.optimalPath.total).toBe(339553);
    expect(a.optimalPath.switches).toBe(6);
    expect(a.optimalPath.tariffs).toEqual([
      ...Array<string>(16).fill("AKTIV"),
      "COMFORT",
      ...Array<string>(4).fill("AKTIV"),
      "COMFORT",
      "COMFORT",
      "AKTIV",
      "AKTIV",
      "COMFORT",
      "COMFORT",
      ...Array<string>(5).fill("BASIS"),
    ]);
    // One cent too much in each of the 25 trips verified within the rounding tolerance.
    expect(a.recomputationDeviation).toBe(25);
    expect(a.breakEven.map((b) => [b.lower, b.higher, b.monthlyTripCost])).toEqual([
      ["BASIS", "AKTIV", 4444],
      ["AKTIV", "COMFORT", 12854],
    ]);
  });

  it("matches the older fixtures month by month from 2024-12 on", () => {
    const b = analyze(older, SETTINGS, PRICE_DATA);
    if (!b) throw new Error("no analysis of the older fixtures");
    expect(b.tariffs).toEqual(a.tariffs);
    const later = a.months.filter((m) => m.month >= "2024-12");
    expect(later.map((m) => m.month)).toEqual(b.months.map((m) => m.month));
    const [december, ...rest] = later;
    for (const [i, m] of rest.entries()) {
      const o = b.months[i + 1]!;
      expect(m.costs, m.month).toEqual(o.costs);
      expect(m.breakdown, m.month).toEqual(o.breakdown);
      expect([m.actualTariff, m.switched, m.actualCost], m.month).toEqual([
        o.actualTariff,
        o.switched,
        o.actualCost,
      ]);
    }

    // December 2024: the older fixtures hold only its last trip (returned on the 31st), the full
    // export all of the month's trips. Every trip in both costs the same, and the month differs
    // by exactly the trips that only the full export has.
    const [oldDecember] = b.months;
    if (!december || !oldDecember) throw new Error("no December 2024");
    const shared = new Set(oldDecember.tripIds);
    expect(december.tripIds.filter((id) => shared.has(id))).toEqual(oldDecember.tripIds);
    const costOf = (analysis: typeof a, id: string) =>
      analysis.trips.find((r) => r.trip.id === id)?.costs;
    for (const id of oldDecember.tripIds) expect(costOf(a, id)).toEqual(costOf(b, id));
    const extra = december.tripIds.filter((id) => !shared.has(id));
    for (const t of a.tariffs) {
      const extraCost = extra.reduce((sum, id) => {
        const c = costOf(a, id)?.[t];
        return sum + (c?.time ?? 0) + (c?.km ?? 0);
      }, 0);
      expect((december.costs[t] ?? 0) - (oldDecember.costs[t] ?? 0), t).toBe(extraCost);
    }
    console.info(
      `2024-12: ${december.tripCount} trips in the full export, ${oldDecember.tripCount} in the ` +
        `older fixtures; actual ${december.actualTariff} (switched ${december.switched}) vs ` +
        `${oldDecember.actualTariff} (switched ${oldDecember.switched})`,
    );
  });
});
