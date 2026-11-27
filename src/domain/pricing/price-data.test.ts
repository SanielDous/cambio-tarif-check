import { describe, expect, it } from "vitest";
import { toLocalMinute } from "./local-time";
import { latestPrices, parseIsoDate, PRICE_DATA, pricesAt, surchargeAt } from "./price-data";
import { PRICE_CLASSES, TARIFF_IDS, type PriceClass, type TariffId } from "./types";

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

const PRICES = latestPrices(PRICE_DATA);

describe("PRICE_DATA", () => {
  it("holds the price lists of 2023-06-01 and 2024-05-02, the first from validFrom", () => {
    expect(PRICE_DATA.versions.map((v) => v.from)).toEqual(["2023-06-01", "2024-05-02"]);
    expect(PRICE_DATA.validFrom).toBe("2023-06-01");
    expect(PRICE_DATA.versions[0]?.from).toBe(PRICE_DATA.validFrom);
    expect(PRICES.from).toBe("2024-05-02");
    expect(PRICES.nightHourPrice).toBe(50);
    expect(PRICES.switchingFee).toBe(500);
  });

  it("keeps its versions ascending", () => {
    const starts = PRICE_DATA.versions.map((v) => parseIsoDate(v.from));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  for (const [tariff, classes] of Object.entries(DAY_WEEK)) {
    for (const [cls, [day, week]] of Object.entries(classes)) {
      it(`${tariff} ${cls}: day ${day}, week ${week}`, () => {
        const price = PRICES.tariffs[tariff as TariffId]!.prices[cls as PriceClass];
        expect(price).toBeDefined();
        expect(12 * price!.hourWeekday).toBe(day);
        expect(72 * price!.hourWeekday).toBe(week);
      });
    }
  }

  it("has literal AKTIV and BASIS rows", () => {
    expect(PRICES.tariffs.AKTIV!.prices).toEqual({
      XS: { hourWeekday: 165, hourWeekend: 165, kmTier1: 24, kmTier2: 19 },
      S: { hourWeekday: 210, hourWeekend: 210, kmTier1: 25, kmTier2: 19 },
      M: { hourWeekday: 260, hourWeekend: 260, kmTier1: 26, kmTier2: 19 },
      L: { hourWeekday: 510, hourWeekend: 510, kmTier1: 36, kmTier2: 22 },
      XL: { hourWeekday: 612, hourWeekend: 612, kmTier1: 39, kmTier2: 23 },
    });
    expect(PRICES.tariffs.BASIS!.prices).toEqual({
      XS: { hourWeekday: 250, hourWeekend: 325, kmTier1: 28, kmTier2: 21 },
      S: { hourWeekday: 330, hourWeekend: 415, kmTier1: 28, kmTier2: 21 },
      M: { hourWeekday: 430, hourWeekend: 520, kmTier1: 29, kmTier2: 21 },
      L: { hourWeekday: 715, hourWeekend: 820, kmTier1: 39, kmTier2: 23, dayCap: 8550 },
      XL: { hourWeekday: 858, hourWeekend: 1066, kmTier1: 42, kmTier2: 24 },
    });
    expect(12 * PRICES.tariffs.AKTIV!.prices.S!.hourWeekday).toBe(2520);
    expect(72 * PRICES.tariffs.AKTIV!.prices.S!.hourWeekday).toBe(15120);
  });

  it("has the tariff fees and availability", () => {
    const { CAMPUS, BASIS, START, AKTIV, COMFORT } = PRICES.tariffs as Required<
      typeof PRICES.tariffs
    >;
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

  it("has ascending surcharge periods starting at validFrom with 1 ct", () => {
    const froms = PRICE_DATA.fuelSurcharges.map((s) => s.from);
    expect(froms).toEqual([...froms].sort());
    expect(PRICE_DATA.fuelSurcharges.slice(0, 4)).toEqual([
      { from: "2023-06-01", cents: 1 },
      { from: "2023-08-15", cents: 2 },
      { from: "2023-12-15", cents: 1 },
      { from: "2024-05-02", cents: 2 },
    ]);
    expect(PRICE_DATA.fuelSurcharges[0]?.from).toBe(PRICE_DATA.validFrom);
  });
});

describe("surchargeAt", () => {
  const cases: [string, number][] = [
    ["2023-06-01", 1],
    ["2023-08-14", 1],
    ["2023-08-15", 2],
    ["2023-10-03", 2],
    ["2023-12-14", 2],
    ["2023-12-15", 1],
    ["2024-05-01", 1],
    ["2024-05-02", 2],
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

/**
 * The price list valid from 2023-06-01, literally from the research document's table: hour price
 * weekday / weekend, day / week price (flat amounts, not 12 × the hour price), km 1–100 / from
 * 101, in cents.
 */
const LIST_2023: Record<
  Exclude<TariffId, "START">,
  Record<
    Exclude<PriceClass, "XL">,
    [hour: [number, number], dayWeek: [number, number], km: [number, number]]
  >
> = {
  CAMPUS: {
    XS: [
      [225, 265],
      [3100, 18600],
      [26, 20],
    ],
    S: [
      [275, 315],
      [3100, 18600],
      [26, 20],
    ],
    M: [
      [385, 415],
      [4000, 24000],
      [27, 20],
    ],
    L: [
      [725, 755],
      [6900, 41400],
      [37, 20],
    ],
  },
  BASIS: {
    XS: [
      [235, 295],
      [3200, 19200],
      [28, 21],
    ],
    S: [
      [335, 395],
      [3200, 19200],
      [28, 21],
    ],
    M: [
      [435, 495],
      [4100, 24600],
      [29, 21],
    ],
    L: [
      [725, 785],
      [7000, 42000],
      [39, 24],
    ],
  },
  AKTIV: {
    XS: [
      [135, 135],
      [2200, 13200],
      [24, 18],
    ],
    S: [
      [190, 190],
      [2300, 13800],
      [25, 18],
    ],
    M: [
      [240, 240],
      [3000, 18000],
      [26, 18],
    ],
    L: [
      [510, 510],
      [5000, 30000],
      [36, 23],
    ],
  },
  COMFORT: {
    XS: [
      [125, 125],
      [2000, 12000],
      [21, 15],
    ],
    S: [
      [170, 170],
      [2100, 12600],
      [22, 15],
    ],
    M: [
      [215, 215],
      [2800, 16800],
      [23, 15],
    ],
    L: [
      [415, 415],
      [4100, 24600],
      [31, 21],
    ],
  },
};

describe("price list valid from 2023-06-01", () => {
  const V2023 = pricesAt(PRICE_DATA, toLocalMinute(2023, 10, 3, 12));

  it("applies from 2023-06-01 until 2024-05-01", () => {
    expect(V2023.from).toBe("2023-06-01");
    expect(pricesAt(PRICE_DATA, toLocalMinute(2024, 5, 1, 23, 59)).from).toBe("2023-06-01");
    expect(pricesAt(PRICE_DATA, toLocalMinute(2024, 5, 2)).from).toBe("2024-05-02");
  });

  it("has the four tariffs without START, each with the classes XS to L", () => {
    expect(Object.keys(V2023.tariffs).sort()).toEqual(["AKTIV", "BASIS", "CAMPUS", "COMFORT"]);
    for (const tariff of Object.values(V2023.tariffs)) {
      expect(Object.keys(tariff.prices)).toEqual(["XS", "S", "M", "L"]);
    }
  });

  for (const [tariff, classes] of Object.entries(LIST_2023)) {
    for (const [cls, [[weekday, weekend], [day, week], [km1, km2]]] of Object.entries(classes)) {
      it(`${tariff} ${cls}: ${weekday}/${weekend} per hour, ${day}/${week}, km ${km1}/${km2}`, () => {
        const offered = V2023.tariffs[tariff as TariffId];
        expect(offered?.id).toBe(tariff);
        expect(offered?.prices[cls as PriceClass]).toEqual({
          hourWeekday: weekday,
          hourWeekend: weekend,
          dayCap: day,
          weekCap: week,
          kmTier1: km1,
          kmTier2: km2,
        });
        expect(week).toBe(PRICE_DATA.weekCapDays * day);
      });
    }
  }

  it("has the fees, the night price and the switching fee", () => {
    const { CAMPUS, BASIS, AKTIV, COMFORT } = V2023.tariffs;
    expect([CAMPUS, BASIS, AKTIV, COMFORT].map((t) => t?.monthlyFee)).toEqual([0, 0, 1100, 2700]);
    expect([CAMPUS, BASIS, AKTIV, COMFORT].map((t) => t?.additionalDriverFee)).toEqual([
      null,
      0,
      300,
      300,
    ]);
    expect([CAMPUS, BASIS, AKTIV, COMFORT].map((t) => t?.cities)).toEqual([null, null, null, null]);
    expect(V2023.nightHourPrice).toBe(50);
    expect(V2023.switchingFee).toBe(500);
  });
});

describe("tariff and class lists", () => {
  it("list every tariff of the price data once, ordered by monthly fee", () => {
    expect([...TARIFF_IDS].sort()).toEqual(Object.keys(PRICES.tariffs).sort());
    const fees = TARIFF_IDS.map((id) => PRICES.tariffs[id]!.monthlyFee);
    expect(fees).toEqual([...fees].sort((a, b) => a - b));
  });

  it("list every price class a tariff offers", () => {
    for (const id of TARIFF_IDS) {
      for (const cls of Object.keys(PRICES.tariffs[id]!.prices)) {
        expect(PRICE_CLASSES).toContain(cls);
      }
    }
  });
});

describe("holidayCities", () => {
  it("lists the 22 cities that charge holidays at the weekend price", () => {
    expect(PRICE_DATA.holidayCities).toHaveLength(22);
    expect(new Set(PRICE_DATA.holidayCities).size).toBe(22);
    for (const city of ["Aachen", "Köln", "Saarbrücken"]) {
      expect(PRICE_DATA.holidayCities).toContain(city);
    }
    for (const city of ["Hamburg", "Bremen", "Berlin", "Wuppertal", "Dortmund"]) {
      expect(PRICE_DATA.holidayCities).not.toContain(city);
    }
  });
});
