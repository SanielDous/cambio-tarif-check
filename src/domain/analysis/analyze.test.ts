import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/import/fields";
import { toLocalMinute } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import type { PriceData, TariffId } from "@/domain/pricing/types";
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

  it("breaks a month with a switch and additional drivers into parts that add up", () => {
    const settings = { ...SETTINGS, additionalDrivers: 2 };
    const a = analyze(
      [
        trip(2025, 1, 10, "BASIS"),
        trip(2025, 2, 10, "AKTIV"),
        trip(2025, 2, 12, "AKTIV", { km: 30 }),
      ],
      settings,
      PRICE_DATA,
    );
    const feb = a?.months[1];
    expect(feb?.actualBreakdown).toEqual({
      billedTime: 2000,
      billedKm: 1200,
      fee: fee("AKTIV"),
      driverFee: 600,
      switchFee: 500,
    });
    expect(feb?.actualCost).toBe(2000 + 1200 + fee("AKTIV") + 600 + 500);
    expect(feb?.tripCount).toBe(2);
    expect(feb?.km).toBe(50);
    // Both trips run 10:00 to 12:00; the charged end is the return rounded to the quarter hour.
    expect(feb?.chargedMinutes).toBe(240);
    for (const t of a?.tariffs ?? []) {
      const b = feb?.breakdown[t];
      expect(b?.fee).toBe(fee(t));
      expect(b?.driverFee).toBe(2 * (PRICE_DATA.tariffs[t].additionalDriverFee ?? 0));
      expect((b?.time ?? 0) + (b?.km ?? 0) + (b?.fee ?? 0) + (b?.driverFee ?? 0)).toBe(
        feb?.costs[t],
      );
    }
    expect(a?.months[0]?.actualBreakdown.switchFee).toBe(0);
    expect(a?.months[0]?.chargedMinutes).toBe(120);
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
    expect(Object.keys(a?.verification ?? {})).toHaveLength(8);
    expect(a?.verification.overrun).toBe(0);
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

describe("analyze: trips after the price date", () => {
  const [y, m, d] = PRICE_DATA.pricesAsOf.split("-").map(Number) as [number, number, number];

  it("counts only trips returned after the day of pricesAsOf", () => {
    const sameDay = trip(y, m, d, "AKTIV", { end: toLocalMinute(y, m, d, 23, 59) });
    const nextDay = trip(y, m, d + 1, "AKTIV", { end: toLocalMinute(y, m, d + 1, 0, 30) });
    const later = trip(y + 1, 3, 3);
    const earlier = trip(2025, 1, 10);
    expect(analyze([earlier], SETTINGS, PRICE_DATA)?.tripsAfterPricesAsOf).toBe(0);
    expect(analyze([earlier, sameDay], SETTINGS, PRICE_DATA)?.tripsAfterPricesAsOf).toBe(0);
    expect(
      analyze([earlier, sameDay, nextDay, later], SETTINGS, PRICE_DATA)?.tripsAfterPricesAsOf,
    ).toBe(2);
  });
});

describe("analyze: period", () => {
  const period = (from: string, to: string): Settings => ({ ...SETTINGS, period: { from, to } });
  const months = (a: ReturnType<typeof analyze>) => a?.months.map((m) => m.month);

  it("keeps the selected edge months without trips and their fees", () => {
    const trips = [trip(2025, 1, 10), trip(2025, 4, 10, "BASIS"), trip(2025, 6, 10)];
    const a = analyze(trips, period("2025-02", "2025-05"), PRICE_DATA);
    expect(months(a)).toEqual(["2025-02", "2025-03", "2025-04", "2025-05"]);
    expect(a?.months.map((m) => m.actualTariff)).toEqual(["AKTIV", "AKTIV", "BASIS", "BASIS"]);
    expect(a?.months.map((m) => m.actualTariffSource)).toEqual([
      "inherited",
      "inherited",
      "trips",
      "inherited",
    ]);
    expect(a?.months.map((m) => m.switched)).toEqual([false, false, true, false]);
    // Two AKTIV fees, the Basis trip as billed plus the switching fee, one Basis month without.
    expect(a?.actualTotal).toBe(2 * fee("AKTIV") + 1600 + 500);
    expect(a?.trips).toHaveLength(1);
    expect(a?.months[0]?.costs.AKTIV).toBe(fee("AKTIV"));
  });

  it("covers a period that lies entirely in a gap with fees only", () => {
    const a = analyze(
      [trip(2025, 1, 10), trip(2025, 4, 10)],
      period("2025-02", "2025-03"),
      PRICE_DATA,
    );
    expect(months(a)).toEqual(["2025-02", "2025-03"]);
    expect(a?.trips).toEqual([]);
    expect(a?.months.map((m) => m.actualTariff)).toEqual(["AKTIV", "AKTIV"]);
    expect(a?.months.map((m) => m.switched)).toEqual([false, false]);
    expect(a?.actualTotal).toBe(2 * fee("AKTIV"));
    expect(a?.totals).toEqual({ BASIS: 0, AKTIV: 2 * fee("AKTIV"), COMFORT: 2 * fee("COMFORT") });
    expect(a?.bestSingle).toEqual({ tariff: "BASIS", total: 0, saving: 2 * fee("AKTIV") });
    expect(a?.recomputationDeviation).toBe(0);
  });

  it("clips a period that reaches beyond the data to the months with data", () => {
    const trips = [trip(2025, 1, 10), trip(2025, 2, 10), trip(2025, 3, 10), trip(2025, 4, 10)];
    expect(months(analyze(trips, period("2024-11", "2025-02"), PRICE_DATA))).toEqual([
      "2025-01",
      "2025-02",
    ]);
    expect(months(analyze(trips, period("2025-03", "2025-12"), PRICE_DATA))).toEqual([
      "2025-03",
      "2025-04",
    ]);
    expect(analyze(trips, period("2025-05", "2025-12"), PRICE_DATA)).toBeNull();
  });

  it("carries an override before the period into it", () => {
    const a = analyze(
      [trip(2025, 1, 10), trip(2025, 4, 10)],
      { ...period("2025-03", "2025-04"), actualTariffOverrides: { "2025-02": "COMFORT" } },
      PRICE_DATA,
    );
    expect(a?.months.map((m) => m.actualTariff)).toEqual(["COMFORT", "AKTIV"]);
    expect(a?.months.map((m) => m.actualTariffSource)).toEqual(["inherited", "trips"]);
    expect(a?.months.map((m) => m.switched)).toEqual([false, true]);
    expect(a?.months[0]?.actualCost).toBe(fee("COMFORT"));
  });

  it("never counts a switch in the first month of the period", () => {
    const a = analyze(
      [trip(2025, 1, 10, "AKTIV"), trip(2025, 2, 10, "BASIS")],
      period("2025-02", "2025-02"),
      PRICE_DATA,
    );
    expect(a?.months[0]?.switched).toBe(false);
    expect(a?.actualTotal).toBe(1600);
  });
});

describe("analyze: incomplete and partial months", () => {
  it("marks the months of not yet billed rows inside the range as incomplete", () => {
    const trips = [trip(2025, 1, 2), trip(2025, 3, 28)];
    const a = analyze(trips, SETTINGS, PRICE_DATA, {
      unbilledMonths: ["2025-02", "2025-02", "2024-12", "2025-04"],
    });
    expect(a?.months.map((m) => m.incomplete)).toEqual([false, true, false]);
    expect(analyze(trips, SETTINGS, PRICE_DATA)?.months.some((m) => m.incomplete)).toBe(false);
  });

  it("marks the first month partial if the first trip starts after the 3rd", () => {
    const flags = (first: number) =>
      analyze(
        [trip(2025, 1, first), trip(2025, 2, 10), trip(2025, 3, 28)],
        SETTINGS,
        PRICE_DATA,
      )?.months.map((m) => m.partial);
    expect(flags(3)).toEqual([false, false, false]);
    expect(flags(4)).toEqual([true, false, false]);
  });

  it("marks the last month partial if the last trip ends before the 26th", () => {
    const flags = (last: number) =>
      analyze(
        [trip(2025, 1, 1), trip(2025, 2, 10), trip(2025, 3, last)],
        SETTINGS,
        PRICE_DATA,
      )?.months.map((m) => m.partial);
    expect(flags(26)).toEqual([false, false, false]);
    expect(flags(25)).toEqual([false, false, true]);
  });

  it("judges the first month by a trip that started in the month before", () => {
    const spanning = trip(2025, 1, 31, "AKTIV", { end: toLocalMinute(2025, 2, 1, 1, 0) });
    const a = analyze([spanning, trip(2025, 2, 27)], SETTINGS, PRICE_DATA);
    expect(a?.months.map((m) => m.month)).toEqual(["2025-02"]);
    expect(a?.months[0]?.partial).toBe(false);
  });

  it("flags only the edges of the data, not the edges of a period", () => {
    const trips = [trip(2025, 1, 10), trip(2025, 2, 10), trip(2025, 3, 10)];
    const a = analyze(
      trips,
      { ...SETTINGS, period: { from: "2025-02", to: "2025-02" } },
      PRICE_DATA,
    );
    expect(a?.months[0]?.partial).toBe(false);
    const all = analyze(trips, SETTINGS, PRICE_DATA);
    expect(all?.months.map((m) => m.partial)).toEqual([true, false, true]);
  });
});

describe("analyze: actual tariff of a month", () => {
  it("breaks a tie of two trips returned at the same minute by trip id, not input order", () => {
    const a = trip(2025, 1, 10, "BASIS", { id: "a" });
    const b = trip(2025, 1, 10, "COMFORT", { id: "b" });
    const forward = analyze([a, b], SETTINGS, PRICE_DATA)?.months[0];
    const backward = analyze([b, a], SETTINGS, PRICE_DATA)?.months[0];
    expect(forward?.actualTariff).toBe("COMFORT");
    expect(backward?.actualTariff).toBe("COMFORT");
    expect(backward?.actualTariffMixed).toBe(true);
  });
});

describe("analyze: hand-derived figures", () => {
  // Wednesday 2025-01-15 10:00–11:00, AKTIV S, 10 km. Fuel surcharge 1 ct/km since 2024-07-01.
  // AKTIV: 1 h × 2.10 + 10 × (0.25 + 0.01) = 2.10 + 2.60, billed exactly like that.
  const wednesday = (month: number, extra: Partial<Trip> = {}): Trip =>
    trip(2025, month, 15, "AKTIV", {
      start: toLocalMinute(2025, month, 15, 10, 0),
      end: toLocalMinute(2025, month, 15, 11, 0),
      km: 10,
      billedTime: 210,
      billedKm: 260,
      ...extra,
    });

  it("prices a month as its trips in the tariff plus the fee", () => {
    const a = analyze([wednesday(1)], SETTINGS, PRICE_DATA);
    expect(a?.trips[0]?.reconstruction.kind).toBe("verified");
    // BASIS S weekday 3.30/h, km 0.28 + 0.01; COMFORT S 1.85/h, km 0.22 + 0.01.
    expect(a?.months[0]?.costs).toEqual({
      BASIS: 330 + 290,
      AKTIV: 210 + 260 + 1100,
      COMFORT: 185 + 230 + 2700,
    });
    expect(a?.months[0]?.cheapest).toBe("BASIS");
    expect(a?.months[0]?.actualCost).toBe(210 + 260 + 1100);
  });

  it("signs the recomputation deviation as model minus billed, within the period only", () => {
    // January billed 3 ct more km than the model (2.63), March 5 ct less (2.55).
    const trips = [wednesday(1, { billedKm: 263 }), wednesday(3, { billedKm: 255 })];
    expect(analyze(trips, SETTINGS, PRICE_DATA)?.recomputationDeviation).toBe(-3 + 5);
    const march = { ...SETTINGS, period: { from: "2025-02", to: "2025-03" } };
    expect(analyze(trips, march, PRICE_DATA)?.recomputationDeviation).toBe(5);
    const january = { ...SETTINGS, period: { from: "2025-01", to: "2025-01" } };
    expect(analyze(trips, january, PRICE_DATA)?.recomputationDeviation).toBe(-3);
  });

  it("drops a compared tariff that has no price for a trip's class", () => {
    const data: PriceData = structuredClone(PRICE_DATA);
    delete data.tariffs.COMFORT.prices.S;
    const a = analyze([wednesday(1)], SETTINGS, data);
    expect(a?.tariffs).toEqual(["BASIS", "AKTIV"]);
    expect(a?.months[0]?.costs).not.toHaveProperty("COMFORT");
  });

  it("prefers the lower fee when two tariffs cost the same in total", () => {
    // Trips: BASIS 6.20, AKTIV 4.70. An AKTIV fee of 1.50 makes both 6.20.
    const tie: PriceData = structuredClone(PRICE_DATA);
    tie.tariffs.AKTIV.monthlyFee = 150;
    const a = analyze([wednesday(1)], SETTINGS, tie);
    expect(a?.totals.BASIS).toBe(620);
    expect(a?.totals.AKTIV).toBe(620);
    expect(a?.bestSingle.tariff).toBe("BASIS");
    expect(a?.months[0]?.cheapest).toBe("BASIS");
    tie.tariffs.AKTIV.monthlyFee = 149;
    expect(analyze([wednesday(1)], SETTINGS, tie)?.bestSingle).toMatchObject({
      tariff: "AKTIV",
      total: 619,
    });
  });

  it("does not change its inputs", () => {
    const trips = [wednesday(1), wednesday(3, { billedKm: 255, driver: "A" })];
    const settings: Settings = {
      ...SETTINGS,
      period: { from: "2025-01", to: "2025-03" },
      manualBookedEnds: { [trips[1]?.id ?? ""]: toLocalMinute(2025, 3, 15, 12, 0) },
      actualTariffOverrides: { "2025-02": "COMFORT" },
    };
    const context = { unbilledMonths: ["2025-02"] };
    const before = structuredClone({ trips, settings, data: PRICE_DATA, context });
    analyze(trips, settings, PRICE_DATA, context);
    expect({ trips, settings, data: PRICE_DATA, context }).toEqual(before);
  });
});
