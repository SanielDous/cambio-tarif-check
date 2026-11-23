import type { Trip } from "@/domain/import/fields";
import { monthKey } from "@/domain/pricing/local-time";
import { TARIFF_IDS, type PriceData, type TariffId } from "@/domain/pricing/types";
import type { MonthRow, Settings, TripResult } from "./analyze";

const normCity = (city: string) => city.trim().toLowerCase();

/** Monthly fee of a tariff including the additional drivers, in cents. */
export function monthlyFee(tariff: TariffId, additionalDrivers: number, data: PriceData): number {
  const t = data.tariffs[tariff];
  return t.monthlyFee + additionalDrivers * (t.additionalDriverFee ?? 0);
}

/**
 * Tariffs worth comparing, ordered by monthly fee. Basis, Aktiv and Comfort always; Start if a
 * trip is in one of its cities; Campus for under-26 users or Campus trips, never with additional
 * drivers.
 */
export function comparedTariffs(trips: Trip[], settings: Settings, data: PriceData): TariffId[] {
  const result: TariffId[] = ["BASIS", "AKTIV", "COMFORT"];
  const startCities = data.tariffs.START.cities;
  if (startCities) {
    const cities = new Set(startCities.map(normCity));
    if (trips.some((t) => cities.has(normCity(t.city)))) result.push("START");
  }
  const campus =
    (settings.under26 || trips.some((t) => t.tariff === "CAMPUS")) &&
    settings.additionalDrivers === 0;
  if (campus) result.push("CAMPUS");
  return result.sort(
    (a, b) =>
      data.tariffs[a].monthlyFee - data.tariffs[b].monthlyFee ||
      TARIFF_IDS.indexOf(a) - TARIFF_IDS.indexOf(b),
  );
}

/** Month keys from `first` to `last`, inclusive. */
export function monthRange(first: string, last: string): string[] {
  const months: string[] = [];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last) break;
    months.push(key);
    if (++month > 12) {
      month = 1;
      year++;
    }
  }
  return months;
}

/** The month before `month`. */
export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

/** Groups items by the month key `key` gives them. */
function groupByMonth<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const byMonth = new Map<string, T[]>();
  for (const item of items) {
    const month = key(item);
    const list = byMonth.get(month);
    if (list) list.push(item);
    else byMonth.set(month, [item]);
  }
  return byMonth;
}

/**
 * The actual tariff of a month: an override wins; else the tariff of the month's last trip
 * (returned last; at the same minute the larger trip id, so the result never depends on the
 * order of the input); a month without trips inherits `previous`.
 */
function actualTariffOf(
  month: string,
  trips: Trip[],
  previous: TariffId | null,
  settings: Settings,
  data: PriceData,
): { tariff: TariffId; source: MonthRow["actualTariffSource"]; mixed: boolean } {
  const override = settings.actualTariffOverrides[month];
  if (override !== undefined && Object.hasOwn(data.tariffs, override)) {
    return { tariff: override, source: "override", mixed: false };
  }
  const [head, ...rest] = trips;
  if (head === undefined) return { tariff: previous ?? "BASIS", source: "inherited", mixed: false };
  let latest = head;
  for (const trip of rest) {
    if (trip.end > latest.end || (trip.end === latest.end && trip.id > latest.id)) latest = trip;
  }
  const tariff = latest.tariff;
  return { tariff, source: "trips", mixed: trips.some((trip) => trip.tariff !== tariff) };
}

export interface MonthInput {
  /** All imported trips; the months before `from` give the tariff the range starts with. */
  trips: Trip[];
  /** The priced trips inside the range. */
  results: TripResult[];
  /** Compared tariffs, already free of tariffs that cannot price some trip. */
  compared: TariffId[];
  /** First and last month of the range, inclusive. */
  from: string;
  to: string;
  settings: Settings;
  data: PriceData;
  /** Months with rows that are not billed yet. */
  unbilledMonths?: ReadonlySet<string>;
  /** The first / last month of the range is only partly contained in the export. */
  partialFirst?: boolean;
  partialLast?: boolean;
}

/**
 * One row per month from `from` to `to`. The actual tariff runs through all months since the
 * first trip, so inheritance and overrides before the range carry into it; the first month of
 * the range never counts a switch.
 */
export function buildMonths(input: MonthInput): MonthRow[] {
  const { trips, results, compared, from, to, settings, data } = input;
  const tripsByMonth = groupByMonth(trips, (trip) => monthKey(trip.end));
  const resultsByMonth = groupByMonth(results, (r) => r.month);

  let previous: TariffId | null = null;
  const first = [...tripsByMonth.keys()].sort()[0];
  if (first !== undefined && first < from) {
    for (const month of monthRange(first, previousMonth(from))) {
      previous = actualTariffOf(
        month,
        tripsByMonth.get(month) ?? [],
        previous,
        settings,
        data,
      ).tariff;
    }
  }

  const keys = monthRange(from, to);
  return keys.map((month, index) => {
    const list = resultsByMonth.get(month) ?? [];
    const actual = actualTariffOf(month, tripsByMonth.get(month) ?? [], previous, settings, data);
    const switched = index > 0 && previous !== actual.tariff;
    previous = actual.tariff;
    const billed = list.reduce((s, r) => s + r.trip.billedTime + r.trip.billedKm, 0);
    const actualCost =
      billed +
      monthlyFee(actual.tariff, settings.additionalDrivers, data) +
      (switched ? data.switchingFee : 0);

    const costs: Partial<Record<TariffId, number>> = {};
    for (const t of compared) {
      let sum = monthlyFee(t, settings.additionalDrivers, data);
      for (const r of list) {
        const c = r.costs[t];
        if (c) sum += c.time + c.km;
      }
      costs[t] = sum;
    }
    const cheapest = compared.reduce((best, t) =>
      (costs[t] ?? 0) < (costs[best] ?? 0) ? t : best,
    );
    return {
      month,
      tripIds: list.map((r) => r.trip.id),
      actualTariff: actual.tariff,
      actualTariffMixed: actual.mixed,
      actualTariffSource: actual.source,
      switched,
      actualCost,
      costs,
      cheapest,
      incomplete: input.unbilledMonths?.has(month) ?? false,
      partial:
        (index === 0 && input.partialFirst === true) ||
        (index === keys.length - 1 && input.partialLast === true),
    };
  });
}
