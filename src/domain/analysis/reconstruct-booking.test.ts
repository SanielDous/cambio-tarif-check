import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/import/fields";
import { toLocalMinute } from "@/domain/pricing/local-time";
import { latestPrices, PRICE_DATA } from "@/domain/pricing/price-data";
import type { LocalMinute, PriceClass, PriceVersionView, TariffId } from "@/domain/pricing/types";
import { bookingTimeCost, reconstructBooking } from "./reconstruct-booking";

const PRICES = latestPrices(PRICE_DATA);

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
      bookingTimeCost(tue2026(18), tue2026(20, 30), tue2026(21), 1, "BASIS", "L", PRICES, "Aachen"),
    ).toBe(1967);
  });

  it("charges 50 % of the used part for a share of 0.5", () => {
    expect(bookingTimeCost(wed(13), wed(20), wed(20), 0.5, "AKTIV", "L", PRICES, "Aachen")).toBe(
      1785,
    );
  });

  // Invoice, COMFORT M (28.20 per day, 2.35 per hour), Friday 2025-01-24 17:00 to Saturday
  // 2025-02-01 17:45 at the full price (week + one day = 197.40, the 45 minutes free), then
  // 17:45–21:00 at 50 %: 3.25 h × 2.35 × 50 % = 3.81875 → 3.82.
  const long = {
    start: toLocalMinute(2025, 1, 24, 17),
    returned: toLocalMinute(2025, 2, 1, 17, 45),
  };

  it("prices the unused part as a span of its own, as invoiced for 8 days + 45 minutes", () => {
    const booked = toLocalMinute(2025, 2, 1, 21);
    expect(
      bookingTimeCost(long.start, long.returned, booked, 1, "COMFORT", "M", PRICES, "Aachen"),
    ).toBe(19740 + 382);
  });

  it("charges unused hours after the day cap was reached: 50 % of exactly those hours", () => {
    // BASIS S Monday 06:00–19:00 reaches the day cap (12 h × 3.30 = 39.60); booked until 21:00,
    // the unused 2 h cost 2 × 3.30 × 50 % = 3.30.
    expect(bookingTimeCost(mon(6), mon(19), mon(21), 1, "BASIS", "S", PRICES, "Aachen")).toBe(
      3960 + 330,
    );
  });

  it("anchors the caps of the unused part at the return", () => {
    // AKTIV S Monday 06:00–18:00 = 12 h × 2.10 = 25.20 (the day cap). Booked 26 h longer, until
    // Tuesday 20:00: the 24 h from Monday 18:00 are capped at 25.20, Tuesday 18:00–20:00 adds
    // 2 × 2.10, all at 50 % = 14.70. Caps anchored at the start would give only 12.60.
    const tue20 = mon(20) + 24 * 60;
    expect(bookingTimeCost(mon(6), mon(18), tue20, 1, "AKTIV", "S", PRICES, "Aachen")).toBe(
      2520 + (2520 + 2 * 210) / 2,
    );
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
      PRICES,
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
      PRICES,
    );
    expect(r).toEqual({
      kind: "verified",
      chargedUntil: tue2026(20, 30),
      bookedEnd: tue2026(21),
      overrunMinutes: 0,
      overrunInferred: false,
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
      PRICES,
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
      PRICES,
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
      PRICES,
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
      PRICES,
    );
    expect(r.kind).toBe("verified-rounding");
    expect(r.bookedEnd).toBe(wed(11, 15));
    expect(r.timeDeviation).toBe(1);
  });

  it("estimates when a cap makes booked ends indistinguishable that differ in another tariff", () => {
    // BASIS S Saturday 06:00–08:00 (2 × 4.15), booked longer: the unused time from 08:00 at 4.15
    // reaches its own day cap 39.60 at 17:45, so every booked end from 17:45 until Sunday 08:45
    // (the remainder after 24 h is free below an hour) gives 8.30 + 19.80; in AKTIV they differ.
    const r = reconstructBooking(
      trip({
        start: sat(6),
        end: sat(8),
        tariff: "BASIS",
        priceClass: "S",
        km: 10,
        billedTime: 830 + 1980,
        billedKm: 290,
      }),
      PRICES,
    );
    expect(r.kind).toBe("estimated");
    expect(r.bookedEnd).toBe(sat(17, 45));
    expect(r.timeDeviation).toBe(0);
  });

  it("verifies a capped trip when the indistinguishable booked ends cost the same everywhere", () => {
    // AKTIV S Wednesday 06:00–08:00 (2 × 2.10), booked until 20:00: the 12 unused weekday hours
    // reach the day cap 25.20 exactly, in every tariff, so later booked ends until Thursday 08:45
    // cost the same in all tariffs.
    const r = reconstructBooking(
      trip({
        start: wed(6),
        end: wed(8),
        tariff: "AKTIV",
        priceClass: "S",
        km: 10,
        billedTime: 420 + 1260,
        billedKm: 260,
      }),
      PRICES,
    );
    expect(r.kind).toBe("verified");
    expect(r.bookedEnd).toBe(wed(20));
  });

  it("reconstructs the invoiced 8-day trip: booked until 21:00 (COMFORT M, billed 201.22)", () => {
    const r = reconstructBooking(
      trip({
        start: toLocalMinute(2025, 1, 24, 17),
        end: toLocalMinute(2025, 2, 1, 17, 40),
        tariff: "COMFORT",
        priceClass: "M",
        km: 1495,
        billedTime: 20122,
        billedKm: 26115,
      }),
      PRICES,
    );
    expect(r.chargedUntil).toBe(toLocalMinute(2025, 2, 1, 17, 45));
    expect(r.bookedEnd).toBe(toLocalMinute(2025, 2, 1, 21));
    expect(r.timeDeviation).toBe(0);
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
      PRICES,
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
      PRICES,
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
    const r = reconstructBooking(kmOff, PRICES);
    expect(r.kind).toBe("not-reproducible");
    expect(r.bookedEnd).toBe(wed(11));
    expect(r.chargedUntil).toBe(wed(11));
    expect(r.timeDeviation).toBe(0);
    expect(r.kmDeviation).toBe(-500);

    const manual = reconstructBooking(kmOff, PRICES, wed(12));
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
      const r = reconstructBooking(early, PRICES, mon(20));
      expect(r.kind).toBe("manual");
      expect(r.bookedEnd).toBe(mon(20));
      // 135 min × 2.10 = 4.725 → 4.73; 0.5 × 30 min × 2.10 = 0.525 → 0.53.
      expect(r.timeDeviation).toBe(526 - 498);
    });

    it("ignores a manual booked end at or before the start or off the quarter hour", () => {
      expect(reconstructBooking(early, PRICES, mon(17, 15)).kind).not.toBe("manual");
      expect(reconstructBooking(early, PRICES, mon(17)).kind).not.toBe("manual");
      expect(reconstructBooking(early, PRICES, mon(20, 5)).kind).not.toBe("manual");
      expect(reconstructBooking(early, PRICES, mon(19, 10)).kind).not.toBe("manual");
    });

    it("computes a manual booked end before the return as an overrun from there", () => {
      const r = reconstructBooking(early, PRICES, mon(19));
      expect(r.kind).toBe("manual");
      expect(r.bookedEnd).toBe(mon(19));
      expect(r.chargedUntil).toBe(mon(19));
      expect(r.overrunMinutes).toBe(21);
      // 105 min × 2.10 = 3.675 → 3.68; 21 min × 2.10 / 60 × 2 = 1.47.
      expect(r.timeDeviation).toBe(368 + 147 - 498);
    });

    it("keeps the overrun of a valid manual end after the return at 0", () => {
      expect(reconstructBooking(early, PRICES, mon(20)).overrunMinutes).toBe(0);
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
    expect(reconstructBooking(observed, PRICES)).toEqual({
      kind: "overrun",
      chargedUntil: fri(20),
      bookedEnd: fri(20),
      overrunMinutes: 13,
      overrunInferred: false,
      share: 1,
      surchargeCents: 1,
      surchargeDerived: false,
      timeDeviation: 0,
      kmDeviation: 0,
    });
  });

  it("infers the overrun when the export holds only the booked end (no trip end)", () => {
    const r = reconstructBooking({ ...observed, end: fri(20) }, PRICES);
    expect(r.kind).toBe("overrun");
    expect(r.bookedEnd).toBe(fri(20));
    expect(r.chargedUntil).toBe(fri(20));
    expect(r.overrunMinutes).toBe(13);
    expect(r.overrunInferred).toBe(true);
    expect(r.timeDeviation).toBe(0);
  });

  describe("with the export's trip end (Fahrtende)", () => {
    const booked = { ...observed, end: fri(20) };

    it("confirms the overrun with the trip end's minutes", () => {
      const r = reconstructBooking({ ...booked, tripEnd: fri(20, 13) }, PRICES);
      expect(r.kind).toBe("overrun");
      expect(r.overrunMinutes).toBe(13);
      expect(r.overrunInferred).toBe(false);
    });

    it("allows one minute either way, as the export drops seconds", () => {
      for (const tripEnd of [fri(20, 12), fri(20, 14)]) {
        const r = reconstructBooking({ ...booked, tripEnd }, PRICES);
        expect(r.kind).toBe("overrun");
        expect(r.overrunMinutes).toBe(13);
        expect(r.overrunInferred).toBe(false);
      }
    });

    it("does not fit other minutes when the trip end contradicts the amount", () => {
      // 17 min (16 and 18 tried too) cost 1.19 (1.12, 1.26): none gives 11.41.
      const r = reconstructBooking({ ...booked, tripEnd: fri(20, 17) }, PRICES);
      expect(r.kind).toBe("not-reproducible");
      expect(r.overrunMinutes).toBe(0);
      expect(r.overrunInferred).toBe(false);
    });

    it("does not try a return after the export's end when the trip end is not later", () => {
      for (const tripEnd of [fri(20), fri(19, 58)]) {
        const r = reconstructBooking({ ...booked, tripEnd }, PRICES);
        expect(r.kind).toBe("not-reproducible");
        expect(r.overrunMinutes).toBe(0);
      }
    });
  });

  it("leaves a quarter-hour end that no minute count explains exactly not reproducible", () => {
    // 10.50 + 7 ct per minute never gives 11.44, and the booked-end search does not either.
    const r = reconstructBooking({ ...observed, end: fri(20), billedTime: 1144 }, PRICES);
    expect(r.kind).toBe("not-reproducible");
    expect(r.overrunMinutes).toBe(0);
  });

  it("finds an early return exactly at a quarter hour by the booked-end search", () => {
    // AKTIV S 15:00 returned at 19:30, booked until 20:00: 4.5 h × 2.10 = 9.45 and
    // 0.5 h × 2.10 × 50 % = 0.525 → 0.53; billed 9.98.
    const r = reconstructBooking({ ...observed, end: fri(19, 30), billedTime: 998 }, PRICES);
    expect(r.kind).toBe("verified");
    expect(r.bookedEnd).toBe(fri(20));
    expect(r.overrunMinutes).toBe(0);
    expect(r.overrunInferred).toBe(false);
  });

  describe("limit of 120 minutes", () => {
    // BASIS S Monday 19:00, booked until 21:45: 2.75 h × 3.30 = 9.075 → 9.08. Overrun at 3.30 until
    // midnight, doubled: 120 min = 13.20 → 22.28 billed; 121 min = 13.31 → 22.39.
    const base = trip({
      start: mon(19),
      end: mon(23, 45),
      tariff: "BASIS",
      priceClass: "S",
      km: 10,
      billedTime: 2228,
      billedKm: 290,
    });

    it("recognises an overrun of 120 minutes after a booked end before the return", () => {
      const r = reconstructBooking(base, PRICES);
      expect(r.kind).toBe("overrun");
      expect(r.bookedEnd).toBe(mon(21, 45));
      expect(r.overrunMinutes).toBe(120);
    });

    it("does not look 121 minutes back", () => {
      const r = reconstructBooking({ ...base, end: mon(23, 46), billedTime: 2239 }, PRICES);
      expect(r.kind).toBe("not-reproducible");
      expect(r.overrunMinutes).toBe(0);
    });

    it("fits at most 120 minutes after a booked end in the export", () => {
      const at = reconstructBooking({ ...base, end: mon(21, 45) }, PRICES);
      expect(at.kind).toBe("overrun");
      expect(at.overrunMinutes).toBe(120);
      expect(at.overrunInferred).toBe(true);
      const beyond = reconstructBooking({ ...base, end: mon(21, 45), billedTime: 2239 }, PRICES);
      expect(beyond.kind).toBe("not-reproducible");
    });
  });

  it("prefers an exact match at an earlier booked end over a 1-cent match at a later one", () => {
    // A class at 0.04 €/h on weekdays and 3.30 €/h at the weekend (from Friday 12:00): a quarter
    // hour moved from the booking into the overrun adds exactly 1 cent. Friday 07:00, returned
    // 12:01: booked end 12:00 gives 0.20 + 0.11 = 0.31, 11:45 gives 0.19 + 0.13 = 0.32 (billed),
    // 11:30 gives 0.18 + 0.15 = 0.33.
    const basis = PRICES.tariffs.BASIS!;
    const s = basis.prices.S;
    if (!s) throw new Error("no BASIS S");
    const data: PriceVersionView = {
      ...PRICES,
      tariffs: {
        ...PRICES.tariffs,
        BASIS: {
          ...basis,
          prices: { ...basis.prices, S: { ...s, hourWeekday: 4, hourWeekend: 330 } },
        },
      },
    };
    const friday = (hh: number, mm = 0) => toLocalMinute(2025, 12, 12, hh, mm);
    const r = reconstructBooking(
      trip({
        start: friday(7),
        end: friday(12, 1),
        tariff: "BASIS",
        priceClass: "S",
        km: 10,
        billedTime: 32,
        billedKm: 290,
      }),
      data,
    );
    expect(r.kind).toBe("overrun");
    expect(r.bookedEnd).toBe(friday(11, 45));
    expect(r.overrunMinutes).toBe(16);
    expect(r.timeDeviation).toBe(0);
    // The later booked end, 1 cent off here, is tried first: billed 0.31, it matches exactly.
    expect(
      reconstructBooking(
        {
          ...trip({
            start: friday(7),
            end: friday(12, 1),
            tariff: "BASIS",
            priceClass: "S",
            km: 10,
            billedTime: 31,
            billedKm: 290,
          }),
        },
        data,
      ).bookedEnd,
    ).toBe(friday(12));
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
    const r = reconstructBooking(night, PRICES);
    expect(r.kind).toBe("overrun");
    expect(r.bookedEnd).toBe(mon(23, 45));
    expect(r.overrunMinutes).toBe(25);
    expect(r.overrunInferred).toBe(false);
    expect(r.timeDeviation).toBe(0);
    expect(
      bookingTimeCost(mon(20), mon(23, 45), mon(23, 45), 1, "BASIS", "L", PRICES, "Aachen"),
    ).toBe(2681);
  });

  it("accepts an overrun within 1 cent", () => {
    const r = reconstructBooking({ ...night, billedTime: 3056 }, PRICES);
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
      PRICES,
    );
    expect(r.kind).not.toBe("overrun");
    expect(r.overrunMinutes).toBe(0);
    expect(r.bookedEnd).toBe(mon(19, 45));
  });

  it("never makes a trip without km an overrun, even with a quarter-hour end", () => {
    const r = reconstructBooking({ ...observed, km: 0, billedKm: 0, end: fri(20) }, PRICES);
    expect(r.kind).toBe("not-reproducible");
    expect(r.overrunMinutes).toBe(0);
  });

  it("prices a trip with an unexplained km amount as the plain booking, without an overrun", () => {
    const kmOff = { ...observed, billedKm: 600 };
    const r = reconstructBooking(kmOff, PRICES);
    expect(r.kind).toBe("not-reproducible");
    expect(r.kmDeviation).toBe(-28);
    expect(r.overrunMinutes).toBe(0);
    expect(r.overrunInferred).toBe(false);
    // Up to 20:15: 5.25 h × 2.10 = 11.025 → 11.03.
    expect(r.bookedEnd).toBe(fri(20, 15));
    expect(r.timeDeviation).toBe(1103 - 1141);
    expect(reconstructBooking({ ...kmOff, end: fri(20) }, PRICES).overrunMinutes).toBe(0);
    expect(reconstructBooking(kmOff, PRICES, fri(20)).kind).toBe("manual");
  });
});
