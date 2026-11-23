import { describe, expect, it } from "vitest";
import { toLocalMinute } from "./local-time";
import { PRICE_DATA } from "./price-data";
import { hourPriceAt, timeCost } from "./time-cost";

const HOUR = 60;
const DAY = 24 * HOUR;
// 2027-03-02 is a Tuesday, 2027-03-05 a Friday, 2027-03-06 a Saturday.
const tue = (hh: number, mm = 0) => toLocalMinute(2027, 3, 2, hh, mm);

const aktivS = (start: number, end: number) => timeCost(start, end, "AKTIV", "S", PRICE_DATA);
const basisS = (start: number, end: number) => timeCost(start, end, "BASIS", "S", PRICE_DATA);

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
    const basisL = (start: number, end: number) => timeCost(start, end, "BASIS", "L", PRICE_DATA);
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
      ...PRICE_DATA,
      tariffs: { ...PRICE_DATA.tariffs, AKTIV: { ...PRICE_DATA.tariffs.AKTIV, prices: {} } },
    };
    expect(() => timeCost(tue(10), tue(11), "AKTIV", "S", data)).toThrow(/AKTIV.*S/);
  });

  it("prices 10,000 bookings of 30 days within 2 seconds", () => {
    const start = tue(10, 15);
    const end = start + 30 * DAY + 7 * HOUR;
    const t0 = performance.now();
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      sum += timeCost(start, end + (i % 4) * 15, "BASIS", "M", PRICE_DATA);
    }
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(sum).toBeGreaterThan(0);
  });
});

describe("hourPriceAt", () => {
  const basis = (t: number) => hourPriceAt(t, "BASIS", "S", PRICE_DATA);
  const fri = (hh: number, mm = 0) => toLocalMinute(2027, 3, 5, hh, mm);
  const mon = (hh: number, mm = 0) => toLocalMinute(2027, 3, 8, hh, mm);

  it("uses the night price 00:00–06:00", () => {
    expect(basis(tue(0))).toBe(50);
    expect(basis(tue(5, 59))).toBe(50);
    expect(basis(tue(6))).toBe(330);
    expect(basis(toLocalMinute(2027, 3, 6, 3))).toBe(50);
    expect(hourPriceAt(tue(3), "COMFORT", "XL", PRICE_DATA)).toBe(50);
  });

  it("uses the weekend price from Friday 12:00 to Monday 06:00", () => {
    expect(basis(fri(11, 59))).toBe(330);
    expect(basis(fri(12))).toBe(415);
    expect(basis(toLocalMinute(2027, 3, 7, 23, 59))).toBe(415);
    expect(basis(mon(5, 59))).toBe(50);
    expect(basis(mon(6))).toBe(330);
  });

  it("uses the weekend price on holidays, but the night price at night", () => {
    // Ascension Day 2027-05-06, a Thursday
    expect(basis(toLocalMinute(2027, 5, 5, 23, 59))).toBe(330);
    expect(basis(toLocalMinute(2027, 5, 6, 5, 59))).toBe(50);
    expect(basis(toLocalMinute(2027, 5, 6, 6))).toBe(415);
    expect(basis(toLocalMinute(2027, 5, 6, 23, 59))).toBe(415);
    expect(basis(toLocalMinute(2027, 5, 7, 6))).toBe(330);
  });

  it("has no weekend price in AKTIV", () => {
    expect(hourPriceAt(toLocalMinute(2027, 3, 6, 10), "AKTIV", "S", PRICE_DATA)).toBe(210);
  });
});
