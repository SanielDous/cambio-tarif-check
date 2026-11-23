import { describe, expect, it } from "vitest";
import { toLocalMinute } from "./local-time";
import { latestPrices, PRICE_DATA } from "./price-data";
import { roundHalfUp } from "./rounding";
import { chargesHolidays, hourPriceAt, overrunCost, timeCost } from "./time-cost";

const PRICES = latestPrices(PRICE_DATA);

const HOUR = 60;
const DAY = 24 * HOUR;
// 2027-03-02 is a Tuesday, 2027-03-05 a Friday, 2027-03-06 a Saturday.
const tue = (hh: number, mm = 0) => toLocalMinute(2027, 3, 2, hh, mm);

const aktivS = (start: number, end: number) =>
  timeCost(start, end, "AKTIV", "S", PRICES, undefined);
const basisS = (start: number, end: number) =>
  timeCost(start, end, "BASIS", "S", PRICES, undefined);

describe("timeCost (literal values from the research document)", () => {
  it("prices night hours at 0.50: AKTIV S 22:00–08:00 = 1140", () => {
    expect(aktivS(tue(22), tue(22) + 10 * HOUR)).toBe(1140);
  });

  it("caps 24-hour blocks from the start", () => {
    expect(aktivS(tue(6), tue(18))).toBe(2520);
    expect(aktivS(tue(6), tue(19))).toBe(2520);
    expect(aktivS(tue(6), tue(6) + 26 * HOUR)).toBe(2940);
    expect(aktivS(tue(6), tue(6) + 34 * HOUR)).toBe(4620);
    expect(aktivS(tue(6), tue(6) + 37 * HOUR)).toBe(5040);
  });

  it("caps 7-day blocks from the start", () => {
    expect(aktivS(tue(6), tue(6) + 6 * DAY)).toBe(15120);
    expect(aktivS(tue(6), tue(6) + 7 * DAY)).toBe(15120);
    expect(aktivS(tue(6), tue(6) + 8 * DAY)).toBe(17640);
    expect(aktivS(tue(6), tue(6) + 14 * DAY)).toBe(30240);
    expect(aktivS(tue(6), tue(6) + 5 * DAY + 10 * HOUR)).toBe(14700);
  });

  it("anchors blocks at the start: BASIS S Friday 06:00 to Saturday 12:00 = 6450", () => {
    expect(basisS(toLocalMinute(2027, 3, 5, 6), toLocalMinute(2027, 3, 6, 12))).toBe(6450);
  });

  it("caps at the weekday day price on weekends: BASIS S Saturday 06:00–16:00 = 3960", () => {
    expect(basisS(toLocalMinute(2027, 3, 6, 6), toLocalMinute(2027, 3, 6, 16))).toBe(3960);
  });

  it("uses the deviating BASIS L day cap (85.50) but the regular week cap (514.80)", () => {
    const basisL = (start: number, end: number) =>
      timeCost(start, end, "BASIS", "L", PRICES, undefined);
    expect(basisL(tue(6), tue(6) + 26 * HOUR)).toBe(9980);
    expect(basisL(tue(10), tue(10) + 8 * DAY)).toBe(60030);
  });

  it("is pro rata per minute and returns fractional cents", () => {
    expect(aktivS(tue(10), tue(10, 15))).toBeCloseTo(52.5, 9);
    expect(aktivS(tue(10), tue(10, 7))).toBeCloseTo(24.5, 9);
    expect(aktivS(tue(10), tue(10))).toBe(0);
    expect(aktivS(tue(11), tue(10))).toBe(0);
  });

  it("throws for a class the tariff does not have", () => {
    const data = {
      ...PRICES,
      tariffs: { ...PRICES.tariffs, AKTIV: { ...PRICES.tariffs.AKTIV, prices: {} } },
    };
    expect(() => timeCost(tue(10), tue(11), "AKTIV", "S", data, undefined)).toThrow(/AKTIV.*S/);
  });

  describe("does not charge a remainder of less than an hour after full days", () => {
    // Calculator: COMFORT M (28.20 per day, 2.35 per hour) from Friday 2027-01-22 17:00.
    const fri = toLocalMinute(2027, 1, 22, 17);
    const comfortM = (minutes: number) =>
      roundHalfUp(timeCost(fri, fri + minutes, "COMFORT", "M", PRICES, "Aachen"));

    it.each([
      [DAY + 15, 2820],
      [DAY + 30, 2820],
      [DAY + 45, 2820],
      [DAY + 59, 2820],
      [DAY + 60, 3055],
      [DAY + 75, 3114],
      [2 * DAY + 45, 5640],
      [3 * DAY + 45, 8460],
      [6 * DAY + 45, 16920],
    ])("COMFORT M, %i minutes from Friday 17:00 = %i", (minutes, cents) => {
      expect(comfortM(minutes)).toBe(cents);
    });

    it("also after a week, as invoiced: 8 days + 45 min = week + one day", () => {
      expect(comfortM(8 * DAY + 45)).toBe(19740);
      expect(comfortM(8 * DAY + 60)).toBe(19740 + 235);
    });

    it("class S from Tuesday 06:00: 45 and 1 minute free, 60 minutes charged", () => {
      const day = roundHalfUp(aktivS(tue(6), tue(6) + DAY));
      expect(roundHalfUp(aktivS(tue(6), tue(6) + DAY + 45))).toBe(day);
      expect(roundHalfUp(aktivS(tue(6), tue(6) + DAY + 1))).toBe(day);
      expect(roundHalfUp(aktivS(tue(6), tue(6) + DAY + 60))).toBe(day + 210);
      const comfortS = (minutes: number) =>
        roundHalfUp(timeCost(tue(6), tue(6) + minutes, "COMFORT", "S", PRICES, undefined));
      expect(comfortS(DAY + 45)).toBe(2220);
      expect(comfortS(DAY + 1)).toBe(2220);
      expect(comfortS(DAY + 60)).toBe(2220 + 185);
    });

    it("does not affect bookings shorter than 24 hours", () => {
      expect(aktivS(tue(10), tue(10, 45))).toBeCloseTo(157.5, 9);
      expect(aktivS(tue(6), tue(6, 59))).toBeCloseTo((59 * 210) / 60, 9);
    });
  });

  it("prices 10,000 bookings of 30 days within 2 seconds", () => {
    const start = tue(10, 15);
    const end = start + 30 * DAY + 7 * HOUR;
    const t0 = performance.now();
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      sum += timeCost(start, end + (i % 4) * 15, "BASIS", "M", PRICES, undefined);
    }
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(sum).toBeGreaterThan(0);
  });
});

describe("hourPriceAt", () => {
  const basis = (t: number) => hourPriceAt(t, "BASIS", "S", PRICES, undefined);
  const fri = (hh: number, mm = 0) => toLocalMinute(2027, 3, 5, hh, mm);
  const mon = (hh: number, mm = 0) => toLocalMinute(2027, 3, 8, hh, mm);

  it("uses the night price 00:00–06:00", () => {
    expect(basis(tue(0))).toBe(50);
    expect(basis(tue(5, 59))).toBe(50);
    expect(basis(tue(6))).toBe(330);
    expect(basis(toLocalMinute(2027, 3, 6, 3))).toBe(50);
    expect(hourPriceAt(tue(3), "COMFORT", "XL", PRICES, undefined)).toBe(50);
  });

  it("uses the weekend price from Friday 12:00 to Monday 06:00", () => {
    expect(basis(fri(11, 59))).toBe(330);
    expect(basis(fri(12))).toBe(415);
    expect(basis(toLocalMinute(2027, 3, 7, 23, 59))).toBe(415);
    expect(basis(mon(5, 59))).toBe(50);
    expect(basis(mon(6))).toBe(330);
  });

  const basisIn = (t: number, city: string | undefined) =>
    hourPriceAt(t, "BASIS", "S", PRICES, city);

  it("uses the weekend price on holidays, but the night price at night", () => {
    // Ascension Day 2027-05-06, a Thursday
    const aachen = (t: number) => basisIn(t, "Aachen");
    expect(aachen(toLocalMinute(2027, 5, 5, 23, 59))).toBe(330);
    expect(aachen(toLocalMinute(2027, 5, 6, 5, 59))).toBe(50);
    expect(aachen(toLocalMinute(2027, 5, 6, 6))).toBe(415);
    expect(aachen(toLocalMinute(2027, 5, 6, 23, 59))).toBe(415);
    expect(aachen(toLocalMinute(2027, 5, 7, 6))).toBe(330);
  });

  const easterMonday = toLocalMinute(2027, 3, 29, 10);
  it.each(["Aachen", "Köln", "Saarbrücken", " köln "])(
    "charges the weekend price on Easter Monday in %j",
    (city) => expect(basisIn(easterMonday, city)).toBe(415),
  );
  it.each(["Hamburg", "Bremen", "Berlin", "Oldenburg", "Wuppertal", undefined, "Atlantis"])(
    "charges the weekday price on Easter Monday in %j",
    (city) => expect(basisIn(easterMonday, city)).toBe(330),
  );

  it("treats All Saints as a holiday in Aachen only, not in Hamburg", () => {
    const allSaints = toLocalMinute(2027, 11, 1, 10);
    expect(basisIn(allSaints, "Aachen")).toBe(415);
    expect(basisIn(allSaints, "Hamburg")).toBe(330);
  });

  it("does not treat Corpus Christi as a holiday", () => {
    expect(basisIn(toLocalMinute(2027, 5, 27, 10), "Aachen")).toBe(330);
  });

  it("applies 3 October (a Tuesday in 2028) by city", () => {
    const unity = toLocalMinute(2028, 10, 3, 10);
    expect(basisIn(unity, "Aachen")).toBe(415);
    expect(basisIn(unity, "Hamburg")).toBe(330);
  });

  it("keeps the night price on a holiday", () => {
    expect(basisIn(toLocalMinute(2027, 3, 29, 0), "Aachen")).toBe(50);
    expect(basisIn(toLocalMinute(2027, 3, 29, 5, 59), "Aachen")).toBe(50);
  });

  it("does not depend on the city in AKTIV and COMFORT", () => {
    for (const tariff of ["AKTIV", "COMFORT"] as const) {
      const price = (city: string | undefined) =>
        hourPriceAt(easterMonday, tariff, "S", PRICES, city);
      expect(price("Aachen")).toBe(price("Hamburg"));
      expect(price("Aachen")).toBe(price(undefined));
    }
  });

  it("has no weekend price in AKTIV", () => {
    expect(hourPriceAt(toLocalMinute(2027, 3, 6, 10), "AKTIV", "S", PRICES, undefined)).toBe(210);
  });
});

describe("overrunCost", () => {
  it("charges every minute after the booked end at twice its hour price", () => {
    // AKTIV S: 13 min × 2.10 / 60 × 2 = 0.91.
    expect(overrunCost(tue(20), tue(20, 13), "AKTIV", "S", PRICES, undefined)).toBeCloseTo(91, 9);
    // COMFORT S: 13 min × 1.85 / 60 × 2 = 0.80166…
    expect(overrunCost(tue(20), tue(20, 13), "COMFORT", "S", PRICES, undefined)).toBeCloseTo(
      (13 * 185 * 2) / 60,
      9,
    );
  });

  it("uses the night and weekend prices of each minute, without caps", () => {
    // BASIS L 23:45–00:10: 15 min at 7.15 and 10 min at the night price 0.50, both doubled.
    const late = toLocalMinute(2027, 3, 2, 23, 45);
    expect(overrunCost(late, late + 25, "BASIS", "L", PRICES, undefined)).toBeCloseTo(
      (15 * 715 * 2 + 10 * 50 * 2) / 60,
      9,
    );
    // BASIS S on a Friday evening: the weekend price 4.15.
    const friday = toLocalMinute(2027, 3, 5, 20);
    expect(overrunCost(friday, friday + 13, "BASIS", "S", PRICES, undefined)).toBeCloseTo(
      (13 * 415 * 2) / 60,
      9,
    );
    expect(overrunCost(tue(20), tue(20), "BASIS", "S", PRICES, undefined)).toBe(0);
  });
});

describe("timeCost on a holiday", () => {
  const easterMonday = (hh: number) => toLocalMinute(2027, 3, 29, hh);
  it("depends on the city: BASIS S 10:00–12:00 on Easter Monday", () => {
    const cost = (city: string) =>
      timeCost(easterMonday(10), easterMonday(12), "BASIS", "S", PRICES, city);
    expect(cost("Aachen")).toBe(830);
    expect(cost("Hamburg")).toBe(660);
  });
});

describe("chargesHolidays", () => {
  it("ignores case, spaces and diacritics but does not map spelling variants", () => {
    expect(chargesHolidays("KOLN", PRICES)).toBe(true);
    expect(chargesHolidays("koln", PRICES)).toBe(true);
    expect(chargesHolidays("Koeln", PRICES)).toBe(false);
    expect(chargesHolidays(" SAARBRÜCKEN", PRICES)).toBe(true);
    expect(chargesHolidays(undefined, PRICES)).toBe(false);
  });
});
