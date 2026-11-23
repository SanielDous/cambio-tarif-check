import { describe, expect, it } from "vitest";
import { toLocalMinute } from "./local-time";
import { PRICE_DATA, surchargeAt } from "./price-data";
import type { PriceClass, TariffId } from "./types";

/** Day and week prices in cents, literally from the research price table. */
const DAY_WEEK: Record<TariffId, Record<PriceClass, [day: number, week: number]>> = {
  CAMPUS: {
    XS: [2880, 17280],
    S: [3300, 19800],
    M: [4620, 27720],
    L: [8460, 50760],
    XL: [10152, 60912],
  },
  BASIS: {
    XS: [3000, 18000],
    S: [3960, 23760],
    M: [5160, 30960],
    L: [8580, 51480],
    XL: [10296, 61776],
  },
  AKTIV: {
    XS: [1980, 11880],
    S: [2520, 15120],
    M: [3120, 18720],
    L: [6120, 36720],
    XL: [7344, 44064],
  },
  COMFORT: {
    XS: [1800, 10800],
    S: [2220, 13320],
    M: [2820, 16920],
    L: [4980, 29880],
    XL: [5976, 35856],
  },
  START: {
    XS: [2220, 13320],
    S: [2820, 16920],
    M: [4140, 24840],
    L: [6780, 40680],
    XL: [8136, 48816],
  },
};

describe("PRICE_DATA", () => {
  for (const [tariff, classes] of Object.entries(DAY_WEEK)) {
    for (const [cls, [day, week]] of Object.entries(classes)) {
      it(`${tariff} ${cls}: day ${day}, week ${week}`, () => {
        const price = PRICE_DATA.tariffs[tariff as TariffId].prices[cls as PriceClass];
        expect(price).toBeDefined();
        expect(12 * price!.hourWeekday).toBe(day);
        expect(72 * price!.hourWeekday).toBe(week);
      });
    }
  }

  it("has literal AKTIV and BASIS rows", () => {
    expect(PRICE_DATA.tariffs.AKTIV.prices).toEqual({
      XS: { hourWeekday: 165, hourWeekend: 165, kmTier1: 24, kmTier2: 19 },
      S: { hourWeekday: 210, hourWeekend: 210, kmTier1: 25, kmTier2: 19 },
      M: { hourWeekday: 260, hourWeekend: 260, kmTier1: 26, kmTier2: 19 },
      L: { hourWeekday: 510, hourWeekend: 510, kmTier1: 36, kmTier2: 22 },
      XL: { hourWeekday: 612, hourWeekend: 612, kmTier1: 39, kmTier2: 23 },
    });
    expect(PRICE_DATA.tariffs.BASIS.prices).toEqual({
      XS: { hourWeekday: 250, hourWeekend: 325, kmTier1: 28, kmTier2: 21 },
      S: { hourWeekday: 330, hourWeekend: 415, kmTier1: 28, kmTier2: 21 },
      M: { hourWeekday: 430, hourWeekend: 520, kmTier1: 29, kmTier2: 21 },
      L: { hourWeekday: 715, hourWeekend: 820, kmTier1: 39, kmTier2: 23 },
      XL: { hourWeekday: 858, hourWeekend: 1066, kmTier1: 42, kmTier2: 24 },
    });
    expect(12 * PRICE_DATA.tariffs.AKTIV.prices.S!.hourWeekday).toBe(2520);
    expect(72 * PRICE_DATA.tariffs.AKTIV.prices.S!.hourWeekday).toBe(15120);
  });

  it("has the tariff fees and availability", () => {
    const { CAMPUS, BASIS, START, AKTIV, COMFORT } = PRICE_DATA.tariffs;
    expect([CAMPUS, BASIS, START, AKTIV, COMFORT].map((t) => t.monthlyFee)).toEqual([
      0, 0, 350, 1100, 2700,
    ]);
    expect(CAMPUS.additionalDriverFee).toBeNull();
    expect(BASIS.additionalDriverFee).toBe(0);
    expect(START.additionalDriverFee).toBe(300);
    expect(START.cities).toEqual(["Berlin", "Bielefeld", "Hamburg", "Dortmund"]);
    expect(AKTIV.cities).toBeNull();
    expect(START.prices.XS).toEqual({
      hourWeekday: 185,
      hourWeekend: 185,
      kmTier1: 29,
      kmTier2: 22,
    });
    expect(START.prices.XL).toEqual({
      hourWeekday: 678,
      hourWeekend: 678,
      kmTier1: 45,
      kmTier2: 27,
    });
  });

  it("has ascending surcharge periods starting at 2024-05-02 with 2 ct", () => {
    const froms = PRICE_DATA.fuelSurcharges.map((s) => s.from);
    expect(froms).toEqual([...froms].sort());
    expect(PRICE_DATA.fuelSurcharges[0]).toEqual({ from: "2024-05-02", cents: 2 });
  });
});

describe("surchargeAt", () => {
  const cases: [string, number][] = [
    ["2024-06-01", 2],
    ["2025-06-15", 1],
    ["2026-04-10", 4],
    ["2026-05-12", 3],
    ["2026-08-01", 4],
    ["2026-09-20", 5],
    ["2026-10-15", 4],
    ["2026-11-10", 3],
  ];
  for (const [date, cents] of cases) {
    it(`is ${cents} ct on ${date}`, () => {
      const [y, m, d] = date.split("-").map(Number) as [number, number, number];
      expect(surchargeAt(PRICE_DATA, toLocalMinute(y, m, d, 12))).toBe(cents);
    });
  }

  it("switches at midnight of the start date", () => {
    expect(surchargeAt(PRICE_DATA, toLocalMinute(2026, 9, 16, 23, 59))).toBe(4);
    expect(surchargeAt(PRICE_DATA, toLocalMinute(2026, 9, 17, 0, 0))).toBe(5);
  });
});
