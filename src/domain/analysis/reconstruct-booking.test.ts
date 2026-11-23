import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/import/fields";
import { toLocalMinute } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import type { LocalMinute, PriceClass, TariffId } from "@/domain/pricing/types";
import { bookingTimeCost, reconstructBooking } from "./reconstruct-booking";

interface TripInput {
  start: LocalMinute;
  end: LocalMinute;
  tariff: TariffId;
  priceClass: PriceClass;
  km: number;
  billedTime: number;
  billedKm: number;
}

function trip(input: TripInput): Trip {
  return { id: "t", city: "Aachen", vehicleClass: `${input.priceClass} Test`, ...input };
}

// 2025-12-15 is a Monday, 2025-12-17 a Wednesday, 2026-05-12 a Tuesday, 2025-03-08 a Saturday.
const mon = (hh: number, mm = 0) => toLocalMinute(2025, 12, 15, hh, mm);
const wed = (hh: number, mm = 0) => toLocalMinute(2025, 12, 17, hh, mm);
const tue2026 = (hh: number, mm = 0) => toLocalMinute(2026, 5, 12, hh, mm);
const sat = (hh: number, mm = 0) => toLocalMinute(2025, 3, 8, hh, mm);

describe("bookingTimeCost", () => {
  it("charges the used part in full and the unused booked part at 50 %, each rounded", () => {
    // 2.5 h × 7.15 = 17.875 → 17.88; 0.5 h × 7.15 × 50 % = 1.7875 → 1.79.
    expect(
      bookingTimeCost(tue2026(18), tue2026(20, 30), tue2026(21), 1, "BASIS", "L", PRICE_DATA),
    ).toBe(1967);
  });

  it("charges 50 % of the used part for a share of 0.5", () => {
    expect(bookingTimeCost(wed(13), wed(20), wed(20), 0.5, "AKTIV", "L", PRICE_DATA)).toBe(1785);
  });
});

describe("reconstructBooking", () => {
  it("finds the booked end of an early return (AKTIV S 17:15–19:21, billed 4.98)", () => {
    const r = reconstructBooking(
      trip({
        start: mon(17, 15),
        end: mon(19, 21),
        tariff: "AKTIV",
        priceClass: "S",
        km: 19,
        billedTime: 498,
        billedKm: 494,
      }),
      PRICE_DATA,
    );
    expect(["verified", "verified-rounding"]).toContain(r.kind);
    expect(r.chargedUntil).toBe(mon(19, 30));
    expect(r.bookedEnd).toBe(mon(19, 45));
    expect(Math.abs(r.timeDeviation)).toBeLessThanOrEqual(1);
    expect(r.share).toBe(1);
  });

  it("verifies BASIS L Tuesday 18:00–20:23, 13 km, billed 19.67 + 5.46", () => {
    const r = reconstructBooking(
      trip({
        start: tue2026(18),
        end: tue2026(20, 23),
        tariff: "BASIS",
        priceClass: "L",
        km: 13,
        billedTime: 1967,
        billedKm: 546,
      }),
      PRICE_DATA,
    );
    expect(r).toEqual({
      kind: "verified",
      chargedUntil: tue2026(20, 30),
      bookedEnd: tue2026(21),
      overrunMinutes: 0,
      share: 1,
      surchargeCents: 3,
      surchargeDerived: false,
      timeDeviation: 0,
      kmDeviation: 0,
    });
  });

  it("recognises a late cancellation (0 km, AKTIV L 13:00–20:00, billed 17.85)", () => {
    const r = reconstructBooking(
      trip({
        start: wed(13),
        end: wed(20),
        tariff: "AKTIV",
        priceClass: "L",
        km: 0,
        billedTime: 1785,
        billedKm: 0,
      }),
      PRICE_DATA,
    );
    expect(r.kind).toBe("cancelled");
    expect(r.share).toBe(0.5);
    expect(r.bookedEnd).toBe(wed(20));
    expect(r.timeDeviation).toBe(0);
  });

  it("recognises an unused booking (0 km, AKTIV XL 09:00–18:00, billed 55.08)", () => {
    const r = reconstructBooking(
      trip({
        start: wed(9),
        end: wed(18),
        tariff: "AKTIV",
        priceClass: "XL",
        km: 0,
        billedTime: 5508,
        billedKm: 0,
      }),
      PRICE_DATA,
    );
    expect(r.kind).toBe("unused");
    expect(r.share).toBe(1);
    expect(r.bookedEnd).toBe(wed(18));
    expect(r.timeDeviation).toBe(0);
  });

  it("reports a trip no booked end explains (AKTIV S 15:00–20:00, billed 11.41)", () => {
    const r = reconstructBooking(
      trip({
        start: wed(15),
        end: wed(20),
        tariff: "AKTIV",
        priceClass: "S",
        km: 0,
        billedTime: 1141,
        billedKm: 0,
      }),
      PRICE_DATA,
    );
    expect(r.kind).toBe("not-reproducible");
    expect(r.bookedEnd).toBe(wed(20));
    expect(r.timeDeviation).toBe(-91);
  });

  it("accepts a 1-cent match as verified-rounding (AKTIV S 75 min, 2.625 billed as 2.62)", () => {
    const r = reconstructBooking(
      trip({
        start: wed(10),
        end: wed(11, 15),
        tariff: "AKTIV",
        priceClass: "S",
        km: 10,
        billedTime: 262,
        billedKm: 260,
      }),
      PRICE_DATA,
    );
    expect(r.kind).toBe("verified-rounding");
    expect(r.bookedEnd).toBe(wed(11, 15));
    expect(r.timeDeviation).toBe(1);
  });

  it("estimates when a cap makes booked ends indistinguishable that differ in another tariff", () => {
    // BASIS S Saturday 06:00–16:00: 10 h at 4.15 exceed the day cap 39.60, so every booked end
    // until Sunday 06:00 gives the same amount; in AKTIV they differ.
    const r = reconstructBooking(
      trip({
        start: sat(6),
        end: sat(16),
        tariff: "BASIS",
        priceClass: "S",
        km: 10,
        billedTime: 3960,
        billedKm: 290,
      }),
      PRICE_DATA,
    );
    expect(r.kind).toBe("estimated");
    expect(r.bookedEnd).toBe(sat(16));
    expect(r.timeDeviation).toBe(0);
  });

  it("verifies a capped trip when the indistinguishable booked ends cost the same everywhere", () => {
    // AKTIV S Wednesday 06:00–18:00 reaches the day cap 25.20 exactly; every tariff caps at
    // 12 weekday hours, so later booked ends until 06:00 cost the same in all tariffs.
    const r = reconstructBooking(
      trip({
        start: wed(6),
        end: wed(18),
        tariff: "AKTIV",
        priceClass: "S",
        km: 10,
        billedTime: 2520,
        billedKm: 260,
      }),
      PRICE_DATA,
    );
    expect(r.kind).toBe("verified");
    expect(r.bookedEnd).toBe(wed(18));
  });

  it("derives the surcharge from the billed km amount when the table does not match", () => {
    const r = reconstructBooking(
      trip({
        start: wed(10),
        end: wed(11),
        tariff: "AKTIV",
        priceClass: "S",
        km: 10,
        billedTime: 210,
        billedKm: 270,
      }),
      PRICE_DATA,
    );
    expect(r.surchargeCents).toBe(2);
    expect(r.surchargeDerived).toBe(true);
    expect(r.kmDeviation).toBe(0);
  });

  it("keeps the table surcharge and reports the km deviation when no surcharge matches", () => {
    const r = reconstructBooking(
      trip({
        start: wed(10),
        end: wed(11),
        tariff: "AKTIV",
        priceClass: "S",
        km: 10,
        billedTime: 210,
        billedKm: 263,
      }),
      PRICE_DATA,
    );
    expect(r.surchargeCents).toBe(1);
    expect(r.surchargeDerived).toBe(false);
    expect(r.kmDeviation).toBe(-3);
    expect(r.kind).toBe("not-reproducible");
  });

  it("makes a trip with an unexplained km amount not reproducible, keeping the booked end", () => {
    // AKTIV S, 10 km: (25 + 1) × 10 = 2.60; billed 7.60. Even 10 ct surcharge gives only 3.50.
    // The time amount 2.10 (1 h) matches exactly, so the booked end found is still the best guess.
    const kmOff = trip({
      start: wed(10),
      end: wed(11),
      tariff: "AKTIV",
      priceClass: "S",
      km: 10,
      billedTime: 210,
      billedKm: 760,
    });
    const r = reconstructBooking(kmOff, PRICE_DATA);
    expect(r.kind).toBe("not-reproducible");
    expect(r.bookedEnd).toBe(wed(11));
    expect(r.chargedUntil).toBe(wed(11));
    expect(r.timeDeviation).toBe(0);
    expect(r.kmDeviation).toBe(-500);

    const manual = reconstructBooking(kmOff, PRICE_DATA, wed(12));
    expect(manual.kind).toBe("manual");
    expect(manual.bookedEnd).toBe(wed(12));
    expect(manual.kmDeviation).toBe(-500);
  });

  describe("manual booked end", () => {
    const early = trip({
      start: mon(17, 15),
      end: mon(19, 21),
      tariff: "AKTIV",
      priceClass: "S",
      km: 19,
      billedTime: 498,
      billedKm: 494,
    });

    it("uses a valid manual booked end", () => {
      const r = reconstructBooking(early, PRICE_DATA, mon(20));
      expect(r.kind).toBe("manual");
      expect(r.bookedEnd).toBe(mon(20));
      // 135 min × 2.10 = 4.725 → 4.73; 0.5 × 30 min × 2.10 = 0.525 → 0.53.
      expect(r.timeDeviation).toBe(526 - 498);
    });

    it("ignores a manual booked end at or before the start or off the quarter hour", () => {
      expect(reconstructBooking(early, PRICE_DATA, mon(17, 15)).kind).not.toBe("manual");
      expect(reconstructBooking(early, PRICE_DATA, mon(17)).kind).not.toBe("manual");
      expect(reconstructBooking(early, PRICE_DATA, mon(20, 5)).kind).not.toBe("manual");
      expect(reconstructBooking(early, PRICE_DATA, mon(19, 10)).kind).not.toBe("manual");
    });

    it("computes a manual booked end before the return as an overrun from there", () => {
      const r = reconstructBooking(early, PRICE_DATA, mon(19));
      expect(r.kind).toBe("manual");
      expect(r.bookedEnd).toBe(mon(19));
      expect(r.chargedUntil).toBe(mon(19));
      expect(r.overrunMinutes).toBe(21);
      // 105 min × 2.10 = 3.675 → 3.68; 21 min × 2.10 / 60 × 2 = 1.47.
      expect(r.timeDeviation).toBe(368 + 147 - 498);
    });

    it("keeps the overrun of a valid manual end after the return at 0", () => {
      expect(reconstructBooking(early, PRICE_DATA, mon(20)).overrunMinutes).toBe(0);
    });
  });
});

describe("late return (overrun)", () => {
  // 2025-05-09 is a Friday; AKTIV and COMFORT S have no weekend price.
  const fri = (hh: number, mm = 0) => toLocalMinute(2025, 5, 9, hh, mm);
  // The invoice: booking 15:00–20:00, returned 20:13; 5 h × 2.10 = 10.50 and
  // 13 min × 2.10 / 60 × 2 = 0.91, billed time 11.41; 22 km at (0.25 + 0.01) = 5.72.
  const observed = trip({
    start: fri(15),
    end: fri(20, 13),
    tariff: "AKTIV",
    priceClass: "S",
    km: 22,
    billedTime: 1141,
    billedKm: 572,
  });

  it("recognises the observed overrun (AKTIV S 15:00–20:00, returned 20:13, billed 11.41)", () => {
    expect(reconstructBooking(observed, PRICE_DATA)).toEqual({
      kind: "overrun",
      chargedUntil: fri(20),
      bookedEnd: fri(20),
      overrunMinutes: 13,
      share: 1,
      surchargeCents: 1,
      surchargeDerived: false,
      timeDeviation: 0,
      kmDeviation: 0,
    });
  });

  it("recognises the overrun when the export holds the booked end instead of the return", () => {
    const r = reconstructBooking({ ...observed, end: fri(20) }, PRICE_DATA);
    expect(r.kind).toBe("overrun");
    expect(r.bookedEnd).toBe(fri(20));
    expect(r.chargedUntil).toBe(fri(20));
    expect(r.overrunMinutes).toBe(13);
    expect(r.timeDeviation).toBe(0);
  });

  // BASIS L Monday 20:00, booked until 23:45, returned Tuesday 00:10, 10 km at (0.39 + 0.01).
  // 3.75 h × 7.15 = 26.8125 → 26.81; overrun 15 min × 7.15 / 60 × 2 = 3.575 plus 10 min at the
  // night price 0.50 / 60 × 2 = 0.1667, together 3.7417 → 3.74; billed 30.55.
  const night = trip({
    start: mon(20),
    end: toLocalMinute(2025, 12, 16, 0, 10),
    tariff: "BASIS",
    priceClass: "L",
    km: 10,
    billedTime: 3055,
    billedKm: 400,
  });

  it("prices an overrun into the night with the night price, doubled", () => {
    const r = reconstructBooking(night, PRICE_DATA);
    expect(r.kind).toBe("overrun");
    expect(r.bookedEnd).toBe(mon(23, 45));
    expect(r.overrunMinutes).toBe(25);
    expect(r.timeDeviation).toBe(0);
    expect(bookingTimeCost(mon(20), mon(23, 45), mon(23, 45), 1, "BASIS", "L", PRICE_DATA)).toBe(
      2681,
    );
  });

  it("accepts an overrun within 1 cent", () => {
    const r = reconstructBooking({ ...night, billedTime: 3056 }, PRICE_DATA);
    expect(r.kind).toBe("overrun");
    expect(r.bookedEnd).toBe(mon(23, 45));
    expect(r.overrunMinutes).toBe(25);
    expect(r.timeDeviation).toBe(-1);
  });

  it("never classifies a trip the booked-end search explains as an overrun", () => {
    // Early return AKTIV S 17:15–19:21, billed 4.98: booked until 19:45.
    const r = reconstructBooking(
      trip({
        start: mon(17, 15),
        end: mon(19, 21),
        tariff: "AKTIV",
        priceClass: "S",
        km: 19,
        billedTime: 498,
        billedKm: 494,
      }),
      PRICE_DATA,
    );
    expect(r.kind).not.toBe("overrun");
    expect(r.overrunMinutes).toBe(0);
    expect(r.bookedEnd).toBe(mon(19, 45));
  });

  it("leaves a trip without km to the unused / cancelled rules", () => {
    const r = reconstructBooking({ ...observed, km: 0, billedKm: 0, end: fri(20) }, PRICE_DATA);
    expect(r.kind).toBe("not-reproducible");
    expect(r.overrunMinutes).toBe(0);
  });

  it("still makes an unexplained km amount not reproducible", () => {
    const kmOff = { ...observed, billedKm: 600 };
    const r = reconstructBooking(kmOff, PRICE_DATA);
    expect(r.kind).toBe("not-reproducible");
    expect(r.kmDeviation).toBe(-28);
    // The overrun found from the time amount is kept as the best estimate.
    expect(r.bookedEnd).toBe(fri(20));
    expect(r.overrunMinutes).toBe(13);
    expect(r.timeDeviation).toBe(0);
    expect(reconstructBooking(kmOff, PRICE_DATA, fri(20)).kind).toBe("manual");
  });
});
