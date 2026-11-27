import type { Trip } from "@/domain/import/fields";
import { dateParts, monthKey } from "@/domain/pricing/local-time";
import {
  latestPrices,
  parseIsoDate,
  pricesAt,
  pricesOfMonth,
  tariffIntroduction,
  tariffsOfMonth,
} from "@/domain/pricing/price-data";
import {
  TARIFF_IDS,
  type LocalMinute,
  type PriceData,
  type TariffId,
} from "@/domain/pricing/types";
import { breakEven, type BreakEven } from "./break-even";
import { buildMonths, comparedTariffs, monthlyFee, monthRange } from "./months";
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
  /** Actual tariff by month key; wins over the export and over inheritance. */
  actualTariffOverrides: Record<string, TariffId>;
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
  /** Where the actual tariff comes from. */
  actualTariffSource: "trips" | "inherited" | "override";
  switched: boolean;
  /** Billed time and km + fees of the actual tariff + switching fee. */
  actualCost: number;
  /** Model cost per compared tariff incl. fees. */
  costs: Partial<Record<TariffId, number>>;
  /** What `costs` is made of per compared tariff, in cents; the parts add up to `costs`. */
  breakdown: Partial<
    Record<TariffId, { time: number; km: number; fee: number; driverFee: number }>
  >;
  /** What `actualCost` is made of, in cents; the parts add up to `actualCost`. */
  actualBreakdown: {
    billedTime: number;
    billedKm: number;
    fee: number;
    driverFee: number;
    switchFee: number;
  };
  /** Trips of the month. */
  tripCount: number;
  /** Driven kilometres of the month's trips. */
  km: number;
  /** Σ minutes from booking start to the charged-until time of the month's trips. */
  chargedMinutes: number;
  cheapest: TariffId;
  /** The export has rows of this month that are not billed yet. */
  incomplete: boolean;
  /**
   * First or last month of the data that the export probably covers only in part: the first trip
   * starts after the 3rd, or the last trip ends before the 26th of the month.
   */
  partial: boolean;
}

/** What the import knows beyond the trips. */
export interface AnalysisContext {
  /** Month keys of rows that are not billed yet (duplicates allowed). */
  unbilledMonths: string[];
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
  breakEven: BreakEven[];
  suggestedAdditionalDrivers: number;
  surchargeDerivedTrips: number;
  /** Trips returned after the day of `pricesAsOf`; they are priced with the latest known prices. */
  tripsAfterPricesAsOf: number;
  /**
   * Tariffs that would be compared for these trips and settings but are not, only because they
   * did not exist yet in part of the period: in a month of it or at the return of one of its
   * trips. `since` is the first day of the tariff, `availableFrom` its month: a period starting
   * there compares it. Tariffs left out for any other reason are not listed.
   */
  unavailableTariffs: UnavailableTariff[];
}

export interface UnavailableTariff {
  tariff: TariffId;
  /** Month key of the first month in which the tariff exists. */
  availableFrom: string;
  /** First day of the tariff ("YYYY-MM-DD"). */
  since: string;
}

const KINDS: ReconstructionKind[] = [
  "verified",
  "verified-rounding",
  "estimated",
  "manual",
  "cancelled",
  "unused",
  "overrun",
  "not-reproducible",
];

/** Days of the month up to which the first trip may start for the month to count as complete. */
const FIRST_DAYS = 3;
/** Day of the month from which the last trip may end for the month to count as complete. */
const LAST_DAY = 26;

/** The month after `month`. */
function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

/** Number of distinct drivers in the trips minus one; the number of additional drivers. */
export function countAdditionalDrivers(trips: Trip[]): number {
  const drivers = new Set(trips.map((t) => t.driver?.trim() ?? "").filter((d) => d !== ""));
  return Math.max(0, drivers.size - 1);
}

/**
 * Everything the result page shows. The months run from the first to the last trip month, or the
 * part of the chosen period that lies within them; months without trips in between cost the fees.
 * Null without trips, for a period outside the data, or if no compared tariff can price all trips.
 */
export function analyze(
  trips: Trip[],
  settings: Settings,
  data: PriceData,
  context?: AnalysisContext,
): Analysis | null {
  const [head, ...rest] = trips;
  if (head === undefined) return null;
  let earliest = head;
  let latest = head;
  for (const trip of rest) {
    if (trip.start < earliest.start) earliest = trip;
    if (trip.end > latest.end) latest = trip;
  }
  const firstMonth = [...trips].map((trip) => monthKey(trip.end)).sort()[0] as string;
  const lastMonth = monthKey(latest.end);
  const { period } = settings;
  const from = period && period.from > firstMonth ? period.from : firstMonth;
  const to = period && period.to < lastMonth ? period.to : lastMonth;
  if (from > to) return null;
  // A first trip that started in an earlier month means the first month is covered from its 1st.
  const partialFirst =
    from === firstMonth &&
    monthKey(earliest.start) === firstMonth &&
    dateParts(earliest.start).day > FIRST_DAYS;
  const partialLast = to === lastMonth && dateParts(latest.end).day < LAST_DAY;

  const inPeriod = trips.filter((trip) => {
    const m = monthKey(trip.end);
    return m >= from && m <= to;
  });

  const results: TripResult[] = inPeriod.map((trip) => {
    // The price list valid at the return prices the whole trip, in every tariff.
    const prices = pricesAt(data, trip.end);
    const reconstruction = reconstructBooking(trip, prices, settings.manualBookedEnds[trip.id]);
    const costs: TripResult["costs"] = {};
    for (const t of TARIFF_IDS) {
      const c = tripCostInTariff(trip, reconstruction, t, prices);
      if (c) costs[t] = c;
    }
    return { trip, reconstruction, month: monthKey(trip.end), costs };
  });

  // Which tariffs to compare, their order and the break-even fees: the tariffs of the last month.
  const rangePrices = { tariffs: tariffsOfMonth(data, to) };
  // A tariff is compared only if it exists in every month of the range and prices every trip.
  const monthTariffs = monthRange(from, to).map((month) => tariffsOfMonth(data, month));
  const exists = (t: TariffId) => monthTariffs.every((tariffs) => tariffs[t] !== undefined);
  const prices = (t: TariffId) => results.every((r) => r.costs[t] !== undefined);
  const tariffs = comparedTariffs(inPeriod, settings, rangePrices).filter(
    (t) => exists(t) && prices(t),
  );
  // Tariffs that would be compared but did not exist yet in part of the period, and only that.
  const unavailableTariffs = comparedTariffs(inPeriod, settings, latestPrices(data)).flatMap(
    (t): UnavailableTariff[] => {
      const introduced = tariffIntroduction(data, t);
      if (tariffs.includes(t) || !introduced) return [];
      // A trip of the month of introduction returned before it moves the start a month later.
      const sinceMinute = parseIsoDate(introduced.since);
      const tooEarlyInMonth = results.some(
        (r) => monthKey(r.trip.end) === introduced.month && r.trip.end < sinceMinute,
      );
      const availableFrom = tooEarlyInMonth ? nextMonth(introduced.month) : introduced.month;
      if (availableFrom <= from || availableFrom > to) return [];
      const unpriced = results.filter((r) => r.costs[t] === undefined);
      const onlyTooEarly = unpriced.every((r) => !pricesAt(data, r.trip.end).tariffs[t]);
      return onlyTooEarly ? [{ tariff: t, availableFrom, since: introduced.since }] : [];
    },
  );
  if (tariffs.length === 0) return null;

  const months = buildMonths({
    trips,
    results,
    compared: tariffs,
    from,
    to,
    settings,
    data,
    unbilledMonths: new Set(context?.unbilledMonths),
    partialFirst,
    partialLast,
  });

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
    months.map((m) => pricesOfMonth(data, m.month).switchingFee),
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
    fees[t] = monthlyFee(t, settings.additionalDrivers, rangePrices);
  }

  const monthly = months.map((m) => {
    const cost: Partial<Record<TariffId, number>> = {};
    for (const t of tariffs) {
      cost[t] = results
        .filter((r) => r.month === m.month)
        .reduce((sum, r) => sum + (r.costs[t]?.time ?? 0) + (r.costs[t]?.km ?? 0), 0);
    }
    return { month: m.month, tripsCost: cost };
  });

  const afterPrices = parseIsoDate(data.pricesAsOf) + 24 * 60;

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
    breakEven: breakEven(tariffs, tripsCost, fees, monthly),
    suggestedAdditionalDrivers: countAdditionalDrivers(inPeriod),
    surchargeDerivedTrips: results.filter((r) => r.reconstruction.surchargeDerived).length,
    tripsAfterPricesAsOf: inPeriod.filter((trip) => trip.end >= afterPrices).length,
    unavailableTariffs,
  };
}
