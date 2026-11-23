import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/import/fields";
import { toLocalMinute } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import type { TariffId } from "@/domain/pricing/types";
import { analyze, comparedTariffs, type Settings } from "./analyze";
import { breakEven } from "./break-even";

const SETTINGS: Settings = {
  additionalDrivers: 0,
  under26: false,
  period: null,
  manualBookedEnds: {},
  actualTariffOverrides: {},
};

let counter = 0;
function trip(
  y: number,
  m: number,
  d: number,
  tariff: TariffId = "AKTIV",
  extra: Partial<Trip> = {},
): Trip {
  counter++;
  return {
    id: `t${counter}`,
    city: "Nowhere",
    vehicleClass: "Kleinwagen",
    priceClass: "S",
    start: toLocalMinute(y, m, d, 10, 0),
    end: toLocalMinute(y, m, d, 12, 0),
    km: 20,
    billedTime: 1000,
    billedKm: 600,
    tariff,
    ...extra,
  };
}

const fee = (t: TariffId) => PRICE_DATA.tariffs[t].monthlyFee;

describe("analyze", () => {
  it("returns null without trips", () => {
    expect(analyze([], SETTINGS, PRICE_DATA)).toBeNull();
  });

  it("books a trip returned in the next month into that month", () => {
    const t = trip(2025, 1, 31, "AKTIV", { end: toLocalMinute(2025, 2, 1, 1, 0) });
    const a = analyze([t], SETTINGS, PRICE_DATA);
    expect(a?.months.map((m) => m.month)).toEqual(["2025-02"]);
  });

  it("lets a gap month inherit the tariff and cost only the fee", () => {
    const a = analyze([trip(2025, 1, 10), trip(2025, 3, 10)], SETTINGS, PRICE_DATA);
    const feb = a?.months[1];
    expect(feb?.month).toBe("2025-02");
    expect(feb?.tripIds).toEqual([]);
    expect(feb?.actualTariff).toBe("AKTIV");
    expect(feb?.switched).toBe(false);
    expect(feb?.actualCost).toBe(fee("AKTIV"));
    expect(feb?.costs.BASIS).toBe(fee("BASIS"));
    expect(feb?.costs.COMFORT).toBe(fee("COMFORT"));
  });

  it("adds the switching fee to the month of a tariff change", () => {
    const a = analyze(
      [trip(2025, 1, 10, "BASIS"), trip(2025, 2, 10, "AKTIV")],
      SETTINGS,
      PRICE_DATA,
    );
    const [jan, feb] = a?.months ?? [];
    expect(jan?.switched).toBe(false);
    expect(feb?.switched).toBe(true);
    expect(feb?.actualCost).toBe(1600 + fee("AKTIV") + 500);
    expect(jan?.actualCost).toBe(1600 + fee("BASIS"));
  });

  it("uses the last trip of a month and flags mixed tariffs", () => {
    const early = trip(2025, 1, 5, "BASIS");
    const late = trip(2025, 1, 20, "AKTIV");
    const a = analyze([late, early], SETTINGS, PRICE_DATA);
    expect(a?.months[0]?.actualTariff).toBe("AKTIV");
    expect(a?.months[0]?.actualTariffMixed).toBe(true);
    expect(a?.months[0]?.actualCost).toBe(3200 + fee("AKTIV"));
  });

  it("adds additional-driver fees per month", () => {
    const trips = [trip(2025, 1, 10, "AKTIV")];
    const base = analyze(trips, SETTINGS, PRICE_DATA)?.months[0];
    const two = analyze(trips, { ...SETTINGS, additionalDrivers: 2 }, PRICE_DATA)?.months[0];
    expect((two?.costs.AKTIV ?? 0) - (base?.costs.AKTIV ?? 0)).toBe(600);
    expect((two?.costs.COMFORT ?? 0) - (base?.costs.COMFORT ?? 0)).toBe(600);
    expect(two?.costs.BASIS).toBe(base?.costs.BASIS);
    expect((two?.actualCost ?? 0) - (base?.actualCost ?? 0)).toBe(600);
    const basis = analyze(
      [trip(2025, 1, 10, "BASIS")],
      { ...SETTINGS, additionalDrivers: 2 },
      PRICE_DATA,
    );
    expect(basis?.months[0]?.actualCost).toBe(1600);
  });

  it("handles one single trip with finite figures", () => {
    const a = analyze([trip(2025, 6, 1)], SETTINGS, PRICE_DATA);
    expect(a?.months).toHaveLength(1);
    expect(a?.optimalPath.switches).toBe(0);
    const numbers = [
      a?.actualTotal,
      a?.bestSingle.total,
      a?.bestSingle.saving,
      a?.optimalPath.total,
      a?.recomputationDeviation,
      ...Object.values(a?.totals ?? {}),
      ...(a?.breakEven.map((b) => b.monthlyTripCost ?? 0) ?? []),
    ];
    for (const n of numbers) expect(Number.isInteger(n)).toBe(true);
  });

  it("restricts to the period and returns null for an empty one", () => {
    const trips = [trip(2025, 1, 10), trip(2025, 2, 10), trip(2025, 3, 10), trip(2025, 4, 10)];
    const a = analyze(
      trips,
      { ...SETTINGS, period: { from: "2025-02", to: "2025-03" } },
      PRICE_DATA,
    );
    expect(a?.months.map((m) => m.month)).toEqual(["2025-02", "2025-03"]);
    expect(a?.trips).toHaveLength(2);
    expect(Object.values(a?.verification ?? {}).reduce((s, n) => s + n, 0)).toBe(2);
    expect(a?.months[0]?.switched).toBe(false);
    expect(
      analyze(trips, { ...SETTINGS, period: { from: "2024-01", to: "2024-02" } }, PRICE_DATA),
    ).toBeNull();
  });

  it("counts distinct drivers and fills all verification keys", () => {
    const a = analyze(
      [
        trip(2025, 1, 1, "AKTIV", { driver: "A" }),
        trip(2025, 1, 2, "AKTIV", { driver: " B " }),
        trip(2025, 1, 3, "AKTIV", { driver: "A" }),
        trip(2025, 1, 4),
      ],
      SETTINGS,
      PRICE_DATA,
    );
    expect(a?.suggestedAdditionalDrivers).toBe(1);
    expect(Object.keys(a?.verification ?? {})).toHaveLength(7);
    expect(analyze([trip(2025, 1, 1)], SETTINGS, PRICE_DATA)?.suggestedAdditionalDrivers).toBe(0);
  });

  it("derives the total, best tariff and saving consistently", () => {
    const a = analyze([trip(2025, 1, 1), trip(2025, 2, 1)], SETTINGS, PRICE_DATA);
    expect(a).not.toBeNull();
    if (!a) return;
    for (const t of a.tariffs) {
      expect(a.totals[t]).toBe(a.months.reduce((s, m) => s + (m.costs[t] ?? 0), 0));
    }
    expect(a.bestSingle.total).toBe(Math.min(...a.tariffs.map((t) => a.totals[t] ?? 0)));
    expect(a.bestSingle.saving).toBe(a.actualTotal - a.bestSingle.total);
  });
});

describe("comparedTariffs", () => {
  const t = trip(2025, 1, 1);
  it("always has Basis, Aktiv and Comfort ordered by fee", () => {
    expect(comparedTariffs([t], SETTINGS, PRICE_DATA)).toEqual(["BASIS", "AKTIV", "COMFORT"]);
  });
  it("adds Start only for a trip in one of its cities", () => {
    const city = trip(2025, 1, 1, "AKTIV", { city: "  hamburg " });
    expect(comparedTariffs([city], SETTINGS, PRICE_DATA)).toEqual([
      "BASIS",
      "START",
      "AKTIV",
      "COMFORT",
    ]);
  });
  it("adds Campus for under 26 or Campus trips, never with additional drivers", () => {
    const under = { ...SETTINGS, under26: true };
    expect(comparedTariffs([t], under, PRICE_DATA)).toEqual([
      "CAMPUS",
      "BASIS",
      "AKTIV",
      "COMFORT",
    ]);
    const campusTrip = trip(2025, 1, 1, "CAMPUS");
    expect(comparedTariffs([campusTrip], SETTINGS, PRICE_DATA)[0]).toBe("CAMPUS");
    const withDrivers = { ...under, additionalDrivers: 1 };
    expect(comparedTariffs([campusTrip], withDrivers, PRICE_DATA)).not.toContain("CAMPUS");
  });
  it("still analyses Campus trips when Campus is not compared", () => {
    const a = analyze(
      [trip(2025, 1, 1, "CAMPUS")],
      { ...SETTINGS, additionalDrivers: 1 },
      PRICE_DATA,
    );
    expect(a?.tariffs).not.toContain("CAMPUS");
    expect(a?.months[0]?.actualTariff).toBe("CAMPUS");
    expect(a?.months[0]?.actualCost).toBe(1600);
  });
});

describe("breakEven", () => {
  it("computes the monthly trip cost and skips equal fees", () => {
    expect(
      breakEven(
        ["BASIS", "START", "AKTIV"],
        { BASIS: 10000, START: 8000, AKTIV: 9000 },
        { BASIS: 0, START: 0, AKTIV: 1100 },
      ),
    ).toEqual([
      { lower: "START", higher: "AKTIV", monthlyTripCost: null, monthsAbove: 0, months: [] },
    ]);
    expect(
      breakEven(["BASIS", "AKTIV"], { BASIS: 10000, AKTIV: 8000 }, { BASIS: 0, AKTIV: 1100 }),
    ).toEqual([
      { lower: "BASIS", higher: "AKTIV", monthlyTripCost: 5500, monthsAbove: 0, months: [] },
    ]);
  });
  it("counts the months above the threshold in the lower tariff", () => {
    const [r] = breakEven(
      ["BASIS", "AKTIV"],
      { BASIS: 10000, AKTIV: 8000 },
      { BASIS: 0, AKTIV: 1100 },
      [
        { month: "2025-01", tripsCost: { BASIS: 5500, AKTIV: 4400 } },
        { month: "2025-02", tripsCost: { BASIS: 5501, AKTIV: 4401 } },
        { month: "2025-03", tripsCost: { BASIS: 0, AKTIV: 0 } },
      ],
    );
    expect(r?.monthsAbove).toBe(1);
    expect(r?.months).toEqual([
      { month: "2025-01", above: false },
      { month: "2025-02", above: true },
      { month: "2025-03", above: false },
    ]);
  });
  it("puts no month above a threshold that is never reached", () => {
    const [r] = breakEven(["BASIS", "AKTIV"], { BASIS: 0, AKTIV: 0 }, { BASIS: 0, AKTIV: 1100 }, [
      { month: "2025-01", tripsCost: { BASIS: 0, AKTIV: 0 } },
    ]);
    expect(r).toMatchObject({ monthlyTripCost: null, monthsAbove: 0 });
    expect(r?.months).toEqual([{ month: "2025-01", above: false }]);
  });
  it("lists every month of the analysis, also months without trips", () => {
    const a = analyze([trip(2025, 1, 10), trip(2025, 3, 10)], SETTINGS, PRICE_DATA);
    expect(a?.breakEven[0]?.months.map((m) => m.month)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(a?.breakEven[0]?.months[1]?.above).toBe(false);
  });
  it("is null without trip cost", () => {
    const r = breakEven(["BASIS", "AKTIV"], { BASIS: 0, AKTIV: 0 }, { BASIS: 0, AKTIV: 1100 });
    expect(r[0]?.monthlyTripCost).toBeNull();
  });
});

describe("actual tariff overrides", () => {
  const withOverrides = (o: Settings["actualTariffOverrides"]): Settings => ({
    ...SETTINGS,
    actualTariffOverrides: o,
  });

  it("uses the override of a gap month for its fee", () => {
    const a = analyze(
      [trip(2025, 1, 10), trip(2025, 3, 10)],
      withOverrides({ "2025-02": "COMFORT" }),
      PRICE_DATA,
    );
    const feb = a?.months[1];
    expect(feb?.actualTariff).toBe("COMFORT");
    expect(feb?.actualTariffSource).toBe("override");
    expect(feb?.actualTariffMixed).toBe(false);
    expect(feb?.switched).toBe(true);
    expect(feb?.actualCost).toBe(fee("COMFORT") + 500);
    expect(a?.months[0]?.actualTariffSource).toBe("trips");
  });

  it("propagates through following gap months but not past a month with trips", () => {
    const a = analyze(
      [trip(2025, 1, 10), trip(2025, 4, 10)],
      withOverrides({ "2025-02": "COMFORT" }),
      PRICE_DATA,
    );
    const rows = a?.months ?? [];
    expect(rows.map((m) => m.actualTariff)).toEqual(["AKTIV", "COMFORT", "COMFORT", "AKTIV"]);
    expect(rows.map((m) => m.actualTariffSource)).toEqual([
      "trips",
      "override",
      "inherited",
      "trips",
    ]);
    expect(rows[2]?.switched).toBe(false);
    expect(rows[3]?.switched).toBe(true);
  });

  it("removes the switch when overriding to the previous tariff", () => {
    const trips = [trip(2025, 1, 10, "BASIS"), trip(2025, 2, 10, "AKTIV")];
    const a = analyze(trips, withOverrides({ "2025-02": "BASIS" }), PRICE_DATA);
    const feb = a?.months[1];
    expect(feb?.switched).toBe(false);
    expect(feb?.actualCost).toBe(1600 + fee("BASIS"));
  });

  it("keeps billed amounts but changes fee and switch for a month with trips", () => {
    const a = analyze(
      [trip(2025, 1, 10, "AKTIV"), trip(2025, 2, 10, "AKTIV")],
      withOverrides({ "2025-02": "COMFORT" }),
      PRICE_DATA,
    );
    const feb = a?.months[1];
    expect(feb?.actualTariffMixed).toBe(false);
    expect(feb?.actualCost).toBe(1600 + fee("COMFORT") + 500);
  });

  it("ignores an unknown tariff", () => {
    const bad = { "2025-02": "NOPE" } as unknown as Settings["actualTariffOverrides"];
    const a = analyze([trip(2025, 1, 10), trip(2025, 3, 10)], withOverrides(bad), PRICE_DATA);
    expect(a?.months[1]?.actualTariffSource).toBe("inherited");
    expect(a?.months[1]?.actualTariff).toBe("AKTIV");
  });
});
