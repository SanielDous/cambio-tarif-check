import { toLocalMinute } from "./local-time";
import {
  TARIFF_IDS,
  type ClassPrice,
  type LocalMinute,
  type PriceData,
  type PriceRules,
  type PriceVersionView,
  type Tariff,
  type TariffId,
} from "./types";

// Source: research document "cambio pricing research", price table and fuel surcharge timeline.
// All amounts in cents including VAT. Km prices are base prices without fuel surcharge.

/** Class price for tariffs without a separate weekend price. */
const flat = (hour: number, kmTier1: number, kmTier2: number): ClassPrice => ({
  hourWeekday: hour,
  hourWeekend: hour,
  kmTier1,
  kmTier2,
});

const withWeekend = (
  hourWeekday: number,
  hourWeekend: number,
  kmTier1: number,
  kmTier2: number,
): ClassPrice => ({ hourWeekday, hourWeekend, kmTier1, kmTier2 });

/** Class price with the flat day and week price of the price list (lists before 2024-05-02). */
const listed = (
  hourWeekday: number,
  hourWeekend: number,
  dayCap: number,
  weekCap: number,
  kmTier1: number,
  kmTier2: number,
): ClassPrice => ({ hourWeekday, hourWeekend, dayCap, weekCap, kmTier1, kmTier2 });

export const PRICE_DATA: PriceData = {
  validFrom: "2023-06-01",
  pricesAsOf: "2026-11-23",
  // A later price list is added as a further version, from the day it applies.
  versions: [
    // Price list of 2023-06-01 (research document, "Price lists before 2024-05-02"): the day and
    // week prices are flat amounts per class (week = 6 × day), not 12 × the hour price. No tariff
    // START and no class XL yet. Older lists follow other rules and are not used.
    {
      from: "2023-06-01",
      tariffs: {
        CAMPUS: {
          id: "CAMPUS",
          monthlyFee: 0,
          additionalDriverFee: null,
          cities: null,
          prices: {
            XS: listed(225, 265, 3100, 18600, 26, 20),
            S: listed(275, 315, 3100, 18600, 26, 20),
            M: listed(385, 415, 4000, 24000, 27, 20),
            L: listed(725, 755, 6900, 41400, 37, 20),
          },
        },
        BASIS: {
          id: "BASIS",
          monthlyFee: 0,
          additionalDriverFee: 0,
          cities: null,
          prices: {
            XS: listed(235, 295, 3200, 19200, 28, 21),
            S: listed(335, 395, 3200, 19200, 28, 21),
            M: listed(435, 495, 4100, 24600, 29, 21),
            L: listed(725, 785, 7000, 42000, 39, 24),
          },
        },
        AKTIV: {
          id: "AKTIV",
          monthlyFee: 1100,
          additionalDriverFee: 300,
          cities: null,
          prices: {
            XS: listed(135, 135, 2200, 13200, 24, 18),
            S: listed(190, 190, 2300, 13800, 25, 18),
            M: listed(240, 240, 3000, 18000, 26, 18),
            L: listed(510, 510, 5000, 30000, 36, 23),
          },
        },
        COMFORT: {
          id: "COMFORT",
          monthlyFee: 2700,
          additionalDriverFee: 300,
          cities: null,
          prices: {
            XS: listed(125, 125, 2000, 12000, 21, 15),
            S: listed(170, 170, 2100, 12600, 22, 15),
            M: listed(215, 215, 2800, 16800, 23, 15),
            L: listed(415, 415, 4100, 24600, 31, 21),
          },
        },
      },
      nightHourPrice: 50,
      switchingFee: 500,
    },
    {
      from: "2024-05-02",
      tariffs: {
        CAMPUS: {
          id: "CAMPUS",
          monthlyFee: 0,
          additionalDriverFee: null,
          cities: null,
          prices: {
            XS: withWeekend(240, 295, 26, 20),
            S: withWeekend(275, 315, 26, 20),
            M: withWeekend(385, 415, 27, 20),
            L: withWeekend(705, 755, 37, 19),
            XL: withWeekend(846, 982, 40, 20),
          },
        },
        BASIS: {
          id: "BASIS",
          monthlyFee: 0,
          additionalDriverFee: 0,
          cities: null,
          prices: {
            XS: withWeekend(250, 325, 28, 21),
            S: withWeekend(330, 415, 28, 21),
            M: withWeekend(430, 520, 29, 21),
            // The calculator caps a BASIS L day at 85.50, not 12 × 7.15 = 85.80; the week cap is
            // still 6 × 85.80 = 514.80 (recorded calculator responses).
            L: { ...withWeekend(715, 820, 39, 23), dayCap: 8550 },
            XL: withWeekend(858, 1066, 42, 24),
          },
        },
        START: {
          id: "START",
          monthlyFee: 350,
          additionalDriverFee: 300,
          cities: ["Berlin", "Bielefeld", "Hamburg", "Dortmund"],
          prices: {
            // XS and XL appear only in the price list PDF, no city offers them on the web.
            XS: flat(185, 29, 22),
            S: flat(235, 33, 22),
            M: flat(345, 37, 22),
            L: flat(565, 42, 26),
            XL: flat(678, 45, 27),
          },
        },
        AKTIV: {
          id: "AKTIV",
          monthlyFee: 1100,
          additionalDriverFee: 300,
          cities: null,
          prices: {
            XS: flat(165, 24, 19),
            S: flat(210, 25, 19),
            M: flat(260, 26, 19),
            L: flat(510, 36, 22),
            XL: flat(612, 39, 23),
          },
        },
        COMFORT: {
          id: "COMFORT",
          monthlyFee: 2700,
          additionalDriverFee: 300,
          cities: null,
          prices: {
            XS: flat(150, 21, 16),
            S: flat(185, 22, 16),
            M: flat(235, 23, 16),
            L: flat(415, 31, 20),
            XL: flat(498, 34, 21),
          },
        },
      },
      nightHourPrice: 50,
      switchingFee: 500,
    },
  ],
  nightStartHour: 0,
  nightEndHour: 6,
  weekendStart: { weekday: 5, hour: 12 },
  weekendEnd: { weekday: 1, hour: 6 },
  kmTierBoundary: 100,
  dayCapHours: 12,
  weekCapDays: 6,
  // Verified with cambio's price calculator (all regional companies, holidays of 2027) and, for
  // Aachen, a real invoice. ASSUMED by neighbourhood, because the calculator offers no suitable
  // vehicle there: Eschweiler (like Aachen), Dormagen and Bergheim (like Köln).
  holidayCities: [
    "Aachen",
    "Düren",
    "Herzogenrath",
    "Jülich",
    "Würselen",
    "Bonn",
    "Brühl",
    "Düsseldorf",
    "Erftstadt",
    "Frechen",
    "Hürth",
    "Köln",
    "Sankt Augustin",
    "Siegburg",
    "Euskirchen",
    "Pulheim",
    "Troisdorf",
    "Kerpen",
    "Saarbrücken",
    "Eschweiler",
    "Dormagen",
    "Bergheim",
  ],
  fuelSurcharges: [
    // +1 ct since 2023-01-15, carried onto the price list of 2023-06-01.
    { from: "2023-06-01", cents: 1 },
    { from: "2023-08-15", cents: 2 },
    { from: "2023-12-15", cents: 1 },
    { from: "2024-05-02", cents: 2 },
    { from: "2024-07-01", cents: 1 },
    { from: "2026-01-15", cents: 1 },
    { from: "2026-03-07", cents: 3 },
    { from: "2026-04-02", cents: 4 },
    { from: "2026-04-23", cents: 3 },
    { from: "2026-07-21", cents: 4 },
    { from: "2026-09-17", cents: 5 },
    { from: "2026-10-01", cents: 4 },
    { from: "2026-11-06", cents: 3 },
  ],
};

export function parseIsoDate(date: string): LocalMinute {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return toLocalMinute(y, m, d);
}

/**
 * Fuel surcharge in cents per km valid at t. Before the first period the first value applies
 * (prices before `validFrom` are not modelled).
 */
export function surchargeAt(data: Pick<PriceRules, "fuelSurcharges">, at: LocalMinute): number {
  let cents = data.fuelSurcharges[0]?.cents ?? 0;
  for (const period of data.fuelSurcharges) {
    if (parseIsoDate(period.from) > at) break;
    cents = period.cents;
  }
  return cents;
}

interface ResolvedVersions {
  /** Start of each version, as `LocalMinute`, parallel to `views`. */
  starts: LocalMinute[];
  views: PriceVersionView[];
}

const resolved = new WeakMap<PriceData, ResolvedVersions>();

/** Every version joined with the rules, built once per price data. */
function resolveVersions(data: PriceData): ResolvedVersions {
  let entry = resolved.get(data);
  if (!entry) {
    if (data.versions.length === 0) throw new Error("Price data without a version");
    const { versions, ...rules } = data;
    entry = {
      starts: versions.map((version) => parseIsoDate(version.from)),
      views: versions.map((version) => ({ ...rules, ...version })),
    };
    resolved.set(data, entry);
  }
  return entry;
}

/**
 * The prices valid at `at`: the last version starting on or before it, joined with the rules. A
 * time before the first version resolves to the first version. The same object is returned for
 * every time in a version, so resolving inside a loop does not allocate.
 */
export function pricesAt(data: PriceData, at: LocalMinute): PriceVersionView {
  const { starts, views } = resolveVersions(data);
  let index = 0;
  while (index + 1 < starts.length && (starts[index + 1] as LocalMinute) <= at) index++;
  return views[index] as PriceVersionView;
}

/** The latest version: the prices shown as today's and used where no date applies. */
export function latestPrices(data: PriceData): PriceVersionView {
  const { views } = resolveVersions(data);
  return views[views.length - 1] as PriceVersionView;
}

/** The prices that apply to the fees of a month ("YYYY-MM"): those valid on its first day. */
export function pricesOfMonth(data: PriceData, month: string): PriceVersionView {
  return pricesAt(data, parseIsoDate(`${month}-01`));
}

/**
 * The tariffs that exist in a month and whose fees apply to it: each from the version valid on the
 * month's first day (`pricesOfMonth`), or, for a tariff that version does not have, from a version
 * that starts within the month and has it. So the month in which a tariff is introduced (START on
 * 2024-05-02) has it and charges its fee as introduced; an earlier month does not have it.
 */
export function tariffsOfMonth(data: PriceData, month: string): Partial<Record<TariffId, Tariff>> {
  const { starts, views } = resolveVersions(data);
  const first = pricesOfMonth(data, month);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const nextMonth = m === 12 ? toLocalMinute(y + 1, 1, 1) : toLocalMinute(y, m + 1, 1);
  const within = views.filter(
    (view, i) => view !== first && (starts[i] as LocalMinute) < nextMonth && view.from > first.from,
  );
  const tariffs: Partial<Record<TariffId, Tariff>> = {};
  for (const id of TARIFF_IDS) {
    const tariff = first.tariffs[id] ?? within.find((view) => view.tariffs[id])?.tariffs[id];
    if (tariff) tariffs[id] = tariff;
  }
  return tariffs;
}

/**
 * When a tariff first exists: the first day of the first version that has it ("YYYY-MM-DD"), and
 * the month of that day. Undefined for a tariff no version has.
 */
export function tariffIntroduction(
  data: PriceData,
  id: TariffId,
): { since: string; month: string } | undefined {
  const version = data.versions.find((v) => v.tariffs[id]);
  return version && { since: version.from, month: version.from.slice(0, 7) };
}
