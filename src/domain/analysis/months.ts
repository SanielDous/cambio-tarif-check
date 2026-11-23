import type { Trip } from "@/domain/import/fields";
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

/**
 * One row per month between the first and last trip month. `compared` must already be free of
 * tariffs that cannot price some trip.
 */
export function buildMonths(
  results: TripResult[],
  compared: TariffId[],
  settings: Settings,
  data: PriceData,
): MonthRow[] {
  const byMonth = new Map<string, TripResult[]>();
  for (const r of results) {
    const list = byMonth.get(r.month);
    if (list) list.push(r);
    else byMonth.set(r.month, [r]);
  }
  const keys = [...byMonth.keys()].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return [];

  const rows: MonthRow[] = [];
  let previous: TariffId | null = null;
  for (const month of monthRange(first, last)) {
    const list = byMonth.get(month) ?? [];
    const override = settings.actualTariffOverrides[month];
    let actualTariff: TariffId;
    let source: MonthRow["actualTariffSource"];
    let mixed = false;
    if (override !== undefined && Object.hasOwn(data.tariffs, override)) {
      actualTariff = override;
      source = "override";
    } else if (list.length === 0) {
      actualTariff = previous ?? "BASIS"; // the first month always has trips
      source = "inherited";
    } else {
      let latest = list[0] as TripResult;
      for (const r of list) if (r.trip.end >= latest.trip.end) latest = r;
      actualTariff = latest.trip.tariff;
      source = "trips";
      mixed = list.some((r) => r.trip.tariff !== actualTariff);
    }
    const switched = previous !== null && previous !== actualTariff;
    const billed = list.reduce((s, r) => s + r.trip.billedTime + r.trip.billedKm, 0);
    const actualCost =
      billed +
      monthlyFee(actualTariff, settings.additionalDrivers, data) +
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
    rows.push({
      month,
      tripIds: list.map((r) => r.trip.id),
      actualTariff,
      actualTariffMixed: mixed,
      actualTariffSource: source,
      switched,
      actualCost,
      costs,
      cheapest,
      incomplete: false,
    });
    previous = actualTariff;
  }
  return rows;
}
