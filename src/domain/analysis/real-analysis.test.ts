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
    expect(a.verification["not-reproducible"]).toBe(1);
    expect(a.optimalPath.tariffs).toHaveLength(18);
  });

  it("reproduces the recorded figures", () => {
    expect(a?.totals).toEqual({ BASIS: 317521, AKTIV: 240011, COMFORT: 240790 });
    expect(a?.actualTotal).toBe(231249);
    expect(a?.bestSingle).toEqual({ tariff: "AKTIV", total: 240011, saving: -8762 });
    expect(a?.optimalPath.total).toBe(224751);
    expect(a?.optimalPath.switches).toBe(7);
    expect(a?.recomputationDeviation).toBe(-82);
    expect(a?.breakEven).toEqual([
      { lower: "BASIS", higher: "AKTIV", monthlyTripCost: 3589 },
      { lower: "AKTIV", higher: "COMFORT", monthlyTripCost: 12574 },
    ]);
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
