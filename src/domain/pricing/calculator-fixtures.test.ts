import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { kmCost } from "./km-cost";
import { parseLocal } from "./local-time";
import { PRICE_DATA } from "./price-data";
import { roundCalculator, roundHalfUp } from "./rounding";
import { timeCost } from "./time-cost";
import type { PriceClass, TariffId } from "./types";

interface Fixture {
  group: string;
  /** cambio's numeric city id in the recorded calculator requests. */
  city: number;
  priceClass: PriceClass;
  start: string;
  end: string;
  km: number;
  surchargeCents: number;
  costs: Record<string, { time: number; km: number; total: number }>;
}

const fixtures = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../tests/fixtures/calculator-fixtures.json"),
    "utf8",
  ),
) as Fixture[];

/**
 * Rounding rules compared against the recorded time costs. `netVatRoundTrip` (net = gross / 1.19
 * rounded, gross = net × 1.19 rounded) was the initial hypothesis; it is kept here only to show
 * that it fits worse than plain half-up rounding.
 */
const ROUNDINGS: Record<string, (cents: number) => number> = {
  roundHalfUp,
  roundCalculator,
  netVatRoundTrip: (cents) => roundHalfUp(roundHalfUp(cents / 1.19) * 1.19),
};

/**
 * The calculator answered these nationwide holidays with weekday prices: cambio's holiday
 * calendar is evidently not maintained that far ahead (2028). Our calendar treats them as
 * holidays, so BASIS and CAMPUS time costs are not compared for them.
 */
const UNMAINTAINED_HOLIDAYS = ["01.05.2028", "03.10.2028", "25.12.2028", "26.12.2028"];
const isUnmaintainedHoliday = (f: Fixture, tariff: TariffId) =>
  f.group === "holiday" &&
  (tariff === "BASIS" || tariff === "CAMPUS") &&
  UNMAINTAINED_HOLIDAYS.includes(f.start.slice(0, 10));

const DAY = 24 * 60;
/**
 * A final partial 24-hour block of less than an hour is free (see `timeCost`). The calculator
 * agrees up to 6 days, but from 7 days on it charges such a remainder again (7 days + 45 min =
 * 170.96 in COMFORT M). A real invoice shows the opposite for billing: 8 days + 45 minutes was
 * billed as week price + one day price, the 45 minutes free. The app follows the invoice, so the
 * calculator's answers for these bookings are not compared. All tariffs of such a fixture differ.
 */
const isLongShortRemainder = (f: Fixture) => {
  const minutes = parseLocal(f.end)! - parseLocal(f.start)!;
  const remainder = minutes % DAY;
  return minutes >= 7 * DAY && remainder >= 1 && remainder < 60;
};

const isExcluded = (f: Fixture, tariff: TariffId) =>
  isUnmaintainedHoliday(f, tariff) || isLongShortRemainder(f);

const CITY_NAMES: Record<number, string> = { 1: "Aachen", 21: "Köln", 16: "Hamburg" };
const cityOf = (f: Fixture) => {
  const name = CITY_NAMES[f.city];
  if (name === undefined) throw new Error(`Unknown fixture city ${f.city}`);
  return name;
};

const toCents = (euros: number) => Math.round(euros * 100);
const tariffsOf = (f: Fixture) =>
  Object.keys(f.costs).filter((t): t is TariffId => t in PRICE_DATA.tariffs);

const exactMatches: Record<string, number> = {};
let compared = 0;

describe("calculator fixtures", () => {
  it("has 197 fixtures", () => expect(fixtures).toHaveLength(197));

  it("excludes exactly the 7 short remainders after 7 days or more", () => {
    const excluded = fixtures.filter(isLongShortRemainder);
    expect(excluded.map((f) => `${f.priceClass} ${f.start} – ${f.end}`)).toEqual([
      "M 22.01.2027 17:00 – 29.01.2027 17:45",
      "M 22.01.2027 17:00 – 30.01.2027 17:15",
      "M 22.01.2027 17:00 – 30.01.2027 17:45",
      "M 22.01.2027 17:00 – 05.02.2027 17:45",
      "M 22.01.2027 17:00 – 06.02.2027 17:45",
      "S 02.03.2027 06:00 – 09.03.2027 06:30",
      "S 02.03.2027 06:00 – 10.03.2027 06:30",
    ]);
  });

  for (const f of fixtures) {
    describe(`${f.group} ${f.priceClass} ${f.start} – ${f.end}, ${f.km} km`, () => {
      const start = parseLocal(f.start)!;
      const end = parseLocal(f.end)!;

      it("km cost matches exactly", () => {
        for (const tariff of tariffsOf(f)) {
          const km = kmCost(f.km, tariff, f.priceClass, PRICE_DATA, f.surchargeCents);
          expect(km, tariff).toBe(toCents(f.costs[tariff]!.km));
        }
      });

      it("time cost matches within 1 cent", () => {
        for (const tariff of tariffsOf(f)) {
          if (isExcluded(f, tariff)) continue;
          const expected = toCents(f.costs[tariff]!.time);
          const raw = timeCost(start, end, tariff, f.priceClass, PRICE_DATA, cityOf(f));
          compared++;
          for (const [name, round] of Object.entries(ROUNDINGS)) {
            if (round(raw) === expected) exactMatches[name] = (exactMatches[name] ?? 0) + 1;
          }
          const diff = Math.abs(roundCalculator(raw) - expected);
          expect(diff, `${tariff}: raw ${raw}, recorded ${expected}`).toBeLessThanOrEqual(1);
        }
      });
    });
  }

  // Runs last: tests in a file run in declaration order.
  it("reports exact time cost matches per rounding function", () => {
    // 197 fixtures × 4 tariffs, plus START in the Hamburg ones, minus the 4 × 2 unmaintained
    // holidays and the 7 × 4 short remainders after 7 days or more.
    expect(compared).toBe(761);
    console.log(
      `Exact time cost matches of ${compared}: ` +
        Object.keys(ROUNDINGS)
          .map((name) => `${name} ${exactMatches[name] ?? 0}`)
          .join(", "),
    );
  });
});
