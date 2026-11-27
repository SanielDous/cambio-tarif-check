import { describe, expect, it } from "vitest";
import { analyze, type Settings } from "@/domain/analysis/analyze";
import { monthlyFee } from "@/domain/analysis/months";
import { optimalPath } from "@/domain/analysis/switching-path";
import type { Trip } from "@/domain/import/fields";
import { kmCost } from "./km-cost";
import { toLocalMinute } from "./local-time";
import { latestPrices, parseIsoDate, PRICE_DATA, pricesAt, surchargeAt } from "./price-data";
import { roundHalfUp } from "./rounding";
import { timeCost } from "./time-cost";
import type { PriceData, PriceVersion, PriceVersionView, TariffId } from "./types";

const V2_FROM = "2026-03-15";

/** The real price list plus a synthetic second one from `V2_FROM`. */
function twoVersions(): PriceData {
  const [v1] = PRICE_DATA.versions as [PriceVersion];
  const v2: PriceVersion = structuredClone({ ...v1, from: V2_FROM });
  const s = v2.tariffs.AKTIV!.prices.S!;
  v2.tariffs.AKTIV!.prices.S = {
    ...s,
    hourWeekday: s.hourWeekday + 100,
    hourWeekend: s.hourWeekend + 100,
    kmTier1: s.kmTier1 + 5,
  };
  v2.tariffs.AKTIV!.monthlyFee += 300;
  v2.tariffs.COMFORT!.monthlyFee += 400;
  v2.switchingFee = 900;
  return { ...PRICE_DATA, versions: [v1, v2] };
}

const DATA = twoVersions();
const V1 = pricesAt(DATA, parseIsoDate(V2_FROM) - 1);
const V2 = pricesAt(DATA, parseIsoDate(V2_FROM));

const SETTINGS: Settings = {
  additionalDrivers: 0,
  under26: false,
  period: null,
  manualBookedEnds: {},
  actualTariffOverrides: {},
};

let nextId = 0;
/** An AKTIV S trip in Berlin, billed with the prices of `billedWith`. */
function trip(
  start: number,
  end: number,
  billedWith: PriceVersionView,
  tariff: TariffId = "AKTIV",
): Trip {
  const km = 40;
  return {
    id: `t${nextId++}`,
    city: "Berlin",
    vehicleClass: "S Kleinwagen",
    priceClass: "S",
    start,
    end,
    km,
    billedTime: roundHalfUp(timeCost(start, end, tariff, "S", billedWith, "Berlin")),
    billedKm: kmCost(km, tariff, "S", billedWith, surchargeAt(DATA, end)),
    tariff,
  };
}

describe("pricesAt", () => {
  it("resolves the version valid at the given minute", () => {
    expect(V1.from).toBe(PRICE_DATA.validFrom);
    expect(V2.from).toBe(V2_FROM);
    expect(pricesAt(DATA, toLocalMinute(2026, 3, 14, 23, 59)).from).toBe(PRICE_DATA.validFrom);
    expect(pricesAt(DATA, toLocalMinute(2026, 3, 15)).from).toBe(V2_FROM);
    expect(pricesAt(DATA, toLocalMinute(2030, 1, 1)).from).toBe(V2_FROM);
  });

  it("resolves a time before the first version to the first version", () => {
    expect(pricesAt(DATA, toLocalMinute(2020, 1, 1)).from).toBe(PRICE_DATA.validFrom);
  });

  it("carries the rules and the prices of the version", () => {
    expect(V2.switchingFee).toBe(900);
    expect(V1.switchingFee).toBe(PRICE_DATA.versions[0]?.switchingFee);
    expect(V2.dayCapHours).toBe(PRICE_DATA.dayCapHours);
    expect(V2.holidayCities).toBe(PRICE_DATA.holidayCities);
  });

  it("returns the same object for every minute of a version", () => {
    expect(pricesAt(DATA, toLocalMinute(2025, 1, 1))).toBe(V1);
    expect(pricesAt(DATA, toLocalMinute(2026, 6, 1))).toBe(V2);
  });

  it("gives the last version as the latest prices", () => {
    expect(latestPrices(DATA)).toBe(V2);
    expect(latestPrices(PRICE_DATA)).toBe(pricesAt(PRICE_DATA, toLocalMinute(2030, 1, 1)));
  });
});

describe("prices that change between versions", () => {
  const before = trip(toLocalMinute(2026, 3, 14, 10), toLocalMinute(2026, 3, 14, 14), V1);
  // Starts under version 1, returned under version 2: version 2 applies to the whole trip.
  const across = trip(toLocalMinute(2026, 3, 14, 22), toLocalMinute(2026, 3, 15, 2), V2);
  const april = trip(toLocalMinute(2026, 4, 2, 10), toLocalMinute(2026, 4, 2, 14), V2, "COMFORT");

  const analysis = analyze([before, across, april], SETTINGS, DATA);
  const result = (t: Trip) => analysis?.trips.find((r) => r.trip.id === t.id);

  it("prices a trip returned before the change with version 1", () => {
    const r = result(before);
    expect(r?.reconstruction.kind).toBe("verified");
    expect(r?.costs.AKTIV).toEqual({ time: before.billedTime, km: before.billedKm });
    expect(before.billedTime).not.toBe(
      roundHalfUp(timeCost(before.start, before.end, "AKTIV", "S", V2, "Berlin")),
    );
  });

  it("prices a trip returned on or after the change with version 2, even if it started before", () => {
    const r = result(across);
    expect(r?.reconstruction.kind).toBe("verified");
    expect(r?.costs.AKTIV).toEqual({ time: across.billedTime, km: across.billedKm });
    expect(across.billedTime).toBe(
      roundHalfUp(timeCost(across.start, across.end, "AKTIV", "S", V2, "Berlin")),
    );
    expect(across.billedTime).not.toBe(
      roundHalfUp(timeCost(across.start, across.end, "AKTIV", "S", V1, "Berlin")),
    );
    expect(across.billedKm).not.toBe(kmCost(40, "AKTIV", "S", V1, surchargeAt(DATA, across.end)));
  });

  it("charges the fees of a month with the version valid on its first day", () => {
    const [march, aprilRow] = analysis?.months ?? [];
    expect(march?.month).toBe("2026-03");
    expect(march?.breakdown.AKTIV?.fee).toBe(V1.tariffs.AKTIV!.monthlyFee);
    expect(march?.breakdown.COMFORT?.fee).toBe(V1.tariffs.COMFORT!.monthlyFee);
    expect(march?.actualBreakdown.fee).toBe(V1.tariffs.AKTIV!.monthlyFee);
    expect(aprilRow?.month).toBe("2026-04");
    expect(aprilRow?.breakdown.AKTIV?.fee).toBe(V2.tariffs.AKTIV!.monthlyFee);
    expect(aprilRow?.breakdown.COMFORT?.fee).toBe(V2.tariffs.COMFORT!.monthlyFee);
    expect(aprilRow?.actualBreakdown.fee).toBe(V2.tariffs.COMFORT!.monthlyFee);
  });

  it("charges the switching fee of the month switched into", () => {
    const aprilRow = analysis?.months[1];
    expect(aprilRow?.switched).toBe(true);
    expect(aprilRow?.actualBreakdown.switchFee).toBe(900);
  });

  it("charges the optimal path the switching fee of each month", () => {
    const months = analysis?.months ?? [];
    const tariffs = analysis?.tariffs ?? [];
    const fees = months.map((m) => pricesAt(DATA, parseIsoDate(`${m.month}-01`)).switchingFee);
    const expected = optimalPath(
      months.map((m) => tariffs.map((t) => m.costs[t] ?? 0)),
      fees,
    );
    expect(analysis?.optimalPath.total).toBe(expected.total);
  });

  it("keeps the monthly fee helper per version", () => {
    expect(monthlyFee("AKTIV", 0, V2)).toBe(V1.tariffs.AKTIV!.monthlyFee + 300);
  });
});

describe("a price version without a tariff", () => {
  // Synthetic: a first version without START, the latest version (with START) from `V2_FROM`.
  const latest = PRICE_DATA.versions.at(-1) as PriceVersion;
  const withoutStart = structuredClone(latest.tariffs);
  delete withoutStart.START;
  const data: PriceData = {
    ...PRICE_DATA,
    validFrom: "2024-05-02",
    versions: [
      { ...structuredClone(latest), from: "2024-05-02", tariffs: withoutStart },
      { ...structuredClone(latest), from: V2_FROM },
    ],
  };
  const old = pricesAt(data, parseIsoDate(V2_FROM) - 1);
  const current = pricesAt(data, parseIsoDate(V2_FROM));

  /** A Berlin S trip billed with `billedWith`. */
  const berlin = (start: number, tariff: TariffId, billedWith: PriceVersionView): Trip => ({
    id: `b${nextId++}`,
    city: "Berlin",
    vehicleClass: "S Kleinwagen",
    priceClass: "S",
    start,
    end: start + 120,
    km: 10,
    billedTime: roundHalfUp(timeCost(start, start + 120, tariff, "S", billedWith, "Berlin")),
    billedKm: kmCost(10, tariff, "S", billedWith, surchargeAt(data, start + 120)),
    tariff,
  });

  it("does not compare the tariff while a trip falls into a version without it", () => {
    const basis = berlin(toLocalMinute(2026, 3, 2, 10), "BASIS", old);
    const start = berlin(toLocalMinute(2026, 3, 20, 10), "START", current);
    const a = analyze([basis, start], SETTINGS, data);
    expect(a?.trips.find((r) => r.trip.id === basis.id)?.costs.START).toBeUndefined();
    expect(a?.trips.find((r) => r.trip.id === start.id)?.costs.START).toBeDefined();
    expect(a?.tariffs).toEqual(["BASIS", "AKTIV", "COMFORT"]);
  });

  it("charges the fee of a tariff missing on a month's first day from the version that adds it", () => {
    // March starts under the old version, which has no START; the trip is priced with the new one.
    const start = berlin(toLocalMinute(2026, 3, 20, 10), "START", current);
    const a = analyze([start], SETTINGS, data);
    expect(a?.tariffs).toContain("START");
    expect(a?.trips[0]?.reconstruction.kind).toBe("verified");
    const [march] = a?.months ?? [];
    expect(march?.breakdown.START?.fee).toBe(current.tariffs.START?.monthlyFee);
    expect(march?.actualBreakdown.fee).toBe(current.tariffs.START?.monthlyFee);
    expect(a?.breakEven.length).toBeGreaterThan(0);
  });
});

describe("optimalPath with a switching fee per month", () => {
  it("charges a switch into month m the fee of month m", () => {
    const costs = [
      [0, 10],
      [10, 0],
    ];
    expect(optimalPath(costs, [999, 5]).total).toBe(5);
    expect(optimalPath(costs, [0, 20]).total).toBe(10);
    expect(optimalPath(costs, 5)).toEqual(optimalPath(costs, [5, 5]));
  });
});
