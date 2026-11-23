/** All tariffs, ordered by monthly fee; tariffs with equal fee keep this order. */
export const TARIFF_IDS = ["CAMPUS", "BASIS", "START", "AKTIV", "COMFORT"] as const;
export type TariffId = (typeof TARIFF_IDS)[number];

/** All price classes, from the smallest to the largest vehicle. */
export const PRICE_CLASSES = ["XS", "S", "M", "L", "XL"] as const;
export type PriceClass = (typeof PRICE_CLASSES)[number];

/** Minutes since 1970-01-01 00:00 local wall-clock time (naive, no time zone). */
export type LocalMinute = number;

/** Prices of one class in one tariff, in cents. */
export interface ClassPrice {
  hourWeekday: number;
  hourWeekend: number;
  kmTier1: number;
  kmTier2: number;
  /** Day cap, only where the calculator deviates from `dayCapHours × hourWeekday`. */
  dayCap?: number;
}

export interface Tariff {
  id: TariffId;
  /** Cents per month. */
  monthlyFee: number;
  /** Cents per month and additional driver; null = additional drivers not allowed. */
  additionalDriverFee: number | null;
  /** null = available everywhere. */
  cities: string[] | null;
  prices: Partial<Record<PriceClass, ClassPrice>>;
}

export interface PriceData {
  /** First day the time and base km prices are valid ("YYYY-MM-DD"). */
  validFrom: string;
  /** Date of the research the prices were taken from ("YYYY-MM-DD"). */
  pricesAsOf: string;
  tariffs: Record<TariffId, Tariff>;
  nightHourPrice: 50;
  nightStartHour: 0;
  nightEndHour: 6;
  weekendStart: { weekday: 5; hour: 12 };
  weekendEnd: { weekday: 1; hour: 6 };
  kmTierBoundary: 100;
  switchingFee: 500;
  dayCapHours: 12;
  weekCapDays: 6;
  /** Fuel surcharge in cents per km, by start date ("YYYY-MM-DD"), ascending. */
  fuelSurcharges: { from: string; cents: number }[];
}
