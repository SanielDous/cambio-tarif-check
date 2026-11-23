import type { Trip } from "@/domain/import/fields";
import { monthKey } from "@/domain/pricing/local-time";
import type { LocalMinute, PriceData, TariffId } from "@/domain/pricing/types";
import { breakEven } from "./break-even";
import { buildMonths, comparedTariffs, monthlyFee } from "./months";
import {
  reconstructBooking,
  type Reconstruction,
  type ReconstructionKind,
} from "./reconstruct-booking";
import { optimalPath } from "./switching-path";
import { tripCostInTariff } from "./trip-cost";

export { comparedTariffs } from "./months";
export { optimalPath } from "./switching-path";

export interface Settings {
  additionalDrivers: number;
  under26: boolean;
  /** Month keys ("YYYY-MM"), inclusive. */
  period: { from: string; to: string } | null;
  /** Manually entered booked end, by trip id. */
  manualBookedEnds: Record<string, LocalMinute>;
}

export interface TripResult {
  trip: Trip;
  reconstruction: Reconstruction;
  month: string;
  costs: Partial<Record<TariffId, { time: number; km: number }>>;
}

export interface MonthRow {
  month: string;
  tripIds: string[];
  actualTariff: TariffId;
  actualTariffMixed: boolean;
  switched: boolean;
  /** Billed time and km + fees of the actual tariff + switching fee. */
  actualCost: number;
  /** Model cost per compared tariff incl. fees. */
  costs: Partial<Record<TariffId, number>>;
  cheapest: TariffId;
  /** Reserved for months with unbilled rows; always false for now. */
  incomplete: boolean;
}

export interface Analysis {
  tariffs: TariffId[];
  trips: TripResult[];
  months: MonthRow[];
  totals: Partial<Record<TariffId, number>>;
  actualTotal: number;
  bestSingle: { tariff: TariffId; total: number; saving: number };
  optimalPath: { tariffs: TariffId[]; total: number; switches: number };
  /** Σ model cost in the trip's own tariff − Σ billed time and km. */
  recomputationDeviation: number;
  verification: Record<ReconstructionKind, number>;
  breakEven: { lower: TariffId; higher: TariffId; monthlyTripCost: number | null }[];
  suggestedAdditionalDrivers: number;
  surchargeDerivedTrips: number;
}

const KINDS: ReconstructionKind[] = [
  "verified",
  "verified-rounding",
  "estimated",
  "manual",
  "cancelled",
  "unused",
  "not-reproducible",
];

/** All tariffs, to price every trip once. */
const ALL_TARIFFS: TariffId[] = ["CAMPUS", "BASIS", "START", "AKTIV", "COMFORT"];

/**
 * Everything the result page shows. Null if no trip (within the period) exists, or if no
 * compared tariff can price all trips.
 */
export function analyze(trips: Trip[], settings: Settings, data: PriceData): Analysis | null {
  const { period } = settings;
  const inPeriod = trips.filter((trip) => {
    if (!period) return true;
    const m = monthKey(trip.end);
    return m >= period.from && m <= period.to;
  });
  if (inPeriod.length === 0) return null;

  const results: TripResult[] = inPeriod.map((trip) => {
    const reconstruction = reconstructBooking(trip, data, settings.manualBookedEnds[trip.id]);
    const costs: TripResult["costs"] = {};
    for (const t of ALL_TARIFFS) {
      const c = tripCostInTariff(trip, reconstruction, t, data);
      if (c) costs[t] = c;
    }
    return { trip, reconstruction, month: monthKey(trip.end), costs };
  });

  const tariffs = comparedTariffs(inPeriod, settings, data).filter((t) =>
    results.every((r) => r.costs[t] !== undefined),
  );
  if (tariffs.length === 0) return null;

  const months = buildMonths(results, tariffs, settings, data);

  const totals: Partial<Record<TariffId, number>> = {};
  for (const t of tariffs) totals[t] = months.reduce((s, m) => s + (m.costs[t] ?? 0), 0);
  const actualTotal = months.reduce((s, m) => s + m.actualCost, 0);

  // `tariffs` is ordered by fee, so the first minimum wins ties in favour of the lower fee.
  const bestTariff = tariffs.reduce((best, t) =>
    (totals[t] ?? 0) < (totals[best] ?? 0) ? t : best,
  );
  const bestTotal = totals[bestTariff] ?? 0;

  const path = optimalPath(
    months.map((m) => tariffs.map((t) => m.costs[t] ?? 0)),
    data.switchingFee,
  );
  const pathTariffs = path.path.map((i) => tariffs[i] as TariffId);
  const switches = pathTariffs.filter((t, i) => i > 0 && t !== pathTariffs[i - 1]).length;

  const recomputationDeviation = results.reduce((s, r) => {
    const own = r.costs[r.trip.tariff];
    return own ? s + own.time + own.km - r.trip.billedTime - r.trip.billedKm : s;
  }, 0);

  const verification = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<
    ReconstructionKind,
    number
  >;
  for (const r of results) verification[r.reconstruction.kind]++;

  const tripsCost: Partial<Record<TariffId, number>> = {};
  const fees: Partial<Record<TariffId, number>> = {};
  for (const t of tariffs) {
    tripsCost[t] = results.reduce((s, r) => s + (r.costs[t]?.time ?? 0) + (r.costs[t]?.km ?? 0), 0);
    fees[t] = monthlyFee(t, settings.additionalDrivers, data);
  }

  const drivers = new Set(inPeriod.map((t) => t.driver?.trim() ?? "").filter((d) => d !== ""));

  return {
    tariffs,
    trips: results,
    months,
    totals,
    actualTotal,
    bestSingle: { tariff: bestTariff, total: bestTotal, saving: actualTotal - bestTotal },
    optimalPath: { tariffs: pathTariffs, total: path.total, switches },
    recomputationDeviation,
    verification,
    breakEven: breakEven(tariffs, tripsCost, fees),
    suggestedAdditionalDrivers: Math.max(0, drivers.size - 1),
    surchargeDerivedTrips: results.filter((r) => r.reconstruction.surchargeDerived).length,
  };
}
