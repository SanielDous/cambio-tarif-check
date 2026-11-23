import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/import/fields";
import { toLocalMinute } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import type { PriceData } from "@/domain/pricing/types";
import { reconstructBooking } from "./reconstruct-booking";
import { tripCostInTariff } from "./trip-cost";

const wed = (hh: number, mm = 0) => toLocalMinute(2025, 12, 17, hh, mm);
const tue2026 = (hh: number, mm = 0) => toLocalMinute(2026, 5, 12, hh, mm);

const cancelled: Trip = {
  id: "c",
  city: "Aachen",
  vehicleClass: "L Transporter L",
  priceClass: "L",
  start: wed(13),
  end: wed(20),
  km: 0,
  billedTime: 1785,
  billedKm: 0,
  tariff: "AKTIV",
};

const earlyReturn: Trip = {
  id: "e",
  city: "Aachen",
  vehicleClass: "L Transporter L",
  priceClass: "L",
  start: tue2026(18),
  end: tue2026(20, 23),
  km: 13,
  billedTime: 1967,
  billedKm: 546,
  tariff: "BASIS",
};

describe("tripCostInTariff", () => {
  it("reproduces the billed amounts in the actual tariff", () => {
    const r = reconstructBooking(earlyReturn, PRICE_DATA);
    expect(tripCostInTariff(earlyReturn, r, "BASIS", PRICE_DATA)).toEqual({ time: 1967, km: 546 });
  });

  it("charges a cancelled trip 50 % of the other tariff's time cost", () => {
    const r = reconstructBooking(cancelled, PRICE_DATA);
    // COMFORT L: 7 h × 4.15 = 29.05; 50 % = 14.525 → 14.53.
    expect(tripCostInTariff(cancelled, r, "COMFORT", PRICE_DATA)).toEqual({ time: 1453, km: 0 });
  });

  it("keeps the charged and booked end of an early return in another tariff", () => {
    const r = reconstructBooking(earlyReturn, PRICE_DATA);
    // AKTIV L: 2.5 h × 5.10 = 12.75; 0.5 h × 5.10 × 50 % = 1.275 → 1.28. Km 13 × (0.36 + 0.03).
    expect(tripCostInTariff(earlyReturn, r, "AKTIV", PRICE_DATA)).toEqual({ time: 1403, km: 507 });
  });

  it("prices an overrun in another tariff as the same booking plus the same doubled minutes", () => {
    // Friday 2025-05-09, AKTIV S 15:00–20:00, returned 20:13, billed 10.50 + 0.91.
    const fri = (hh: number, mm = 0) => toLocalMinute(2025, 5, 9, hh, mm);
    const late: Trip = {
      id: "o",
      city: "Aachen",
      vehicleClass: "S Kleinwagen",
      priceClass: "S",
      start: fri(15),
      end: fri(20, 13),
      km: 22,
      billedTime: 1141,
      billedKm: 572,
      tariff: "AKTIV",
    };
    const r = reconstructBooking(late, PRICE_DATA);
    expect(r.kind).toBe("overrun");
    expect(tripCostInTariff(late, r, "AKTIV", PRICE_DATA)?.time).toBe(1141);
    // COMFORT S: 5 h × 1.85 = 9.25; 13 min × 1.85 / 60 × 2 = 0.8017 → 0.80.
    expect(tripCostInTariff(late, r, "COMFORT", PRICE_DATA)?.time).toBe(1005);
    // BASIS S on a Friday after 12:00 has the weekend price 4.15: 5 h = 20.75;
    // 13 min × 4.15 / 60 × 2 = 1.7983 → 1.80.
    expect(tripCostInTariff(late, r, "BASIS", PRICE_DATA)?.time).toBe(2255);
  });

  it("returns null when the tariff has no price for the class", () => {
    const data: PriceData = {
      ...PRICE_DATA,
      tariffs: {
        ...PRICE_DATA.tariffs,
        START: { ...PRICE_DATA.tariffs.START, prices: {} },
      },
    };
    const r = reconstructBooking(earlyReturn, data);
    expect(tripCostInTariff(earlyReturn, r, "START", data)).toBeNull();
  });
});
