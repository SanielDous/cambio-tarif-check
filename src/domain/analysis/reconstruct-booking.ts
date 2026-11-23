import type { Trip } from "@/domain/import/fields";
import { kmCost } from "@/domain/pricing/km-cost";
import { surchargeAt } from "@/domain/pricing/price-data";
import { roundHalfUp } from "@/domain/pricing/rounding";
import { overrunCost, timeCost } from "@/domain/pricing/time-cost";
import type { LocalMinute, PriceClass, PriceVersionView, TariffId } from "@/domain/pricing/types";

export type ReconstructionKind =
  | "verified"
  | "verified-rounding"
  | "estimated"
  | "manual"
  | "cancelled"
  | "unused"
  | "overrun"
  | "not-reproducible";

export interface Reconstruction {
  kind: ReconstructionKind;
  /**
   * Return rounded up to the quarter hour; up to here the full time price applies. For a late
   * return (`overrunMinutes` > 0) the booked end.
   */
  chargedUntil: LocalMinute;
  bookedEnd: LocalMinute;
  /** Minutes the car was returned after the booked end, charged at twice the time price; else 0. */
  overrunMinutes: number;
  /**
   * True if the export holds only the booked end and the overrun minutes were fitted to the billed
   * amount, with no return time to confirm them. Such a trip is not reproduced to the cent.
   */
  overrunInferred: boolean;
  /** 0.5 only for "cancelled". */
  share: 1 | 0.5;
  /** Fuel surcharge per km: from the table, or derived from the billed km amount. */
  surchargeCents: number;
  surchargeDerived: boolean;
  /** Model − billed, cents, in the actual tariff. */
  timeDeviation: number;
  kmDeviation: number;
}

const QUARTER = 15;
const DAY = 24 * 60;
/** The longest booking: 30 days after the start. The booked-end search ends here. */
export const MAX_BOOKING_MINUTES = 30 * DAY;
/** The longest overrun searched for when the booked-end search finds nothing. */
export const MAX_OVERRUN_MINUTES = 120;
/** Surcharges tried when the table surcharge does not reproduce the billed km amount. */
const MAX_DERIVED_SURCHARGE = 10;

/**
 * The unused booked time [chargedUntil, bookedEnd) in integer cents: 50 % of the price of exactly
 * those hours, priced like a booking of its own (night, weekend and holiday prices of those hours,
 * caps anchored at `chargedUntil`) and rounded half-up as a line item of its own. An invoice shows
 * this: after 8 days + 45 minutes at the full price, 3.25 unused hours cost 3.25 × 2.35 × 50 %.
 */
export function unusedTimeCost(
  chargedUntil: LocalMinute,
  bookedEnd: LocalMinute,
  tariff: TariffId,
  cls: PriceClass,
  data: PriceVersionView,
  city: string | undefined,
): number {
  if (bookedEnd <= chargedUntil) return 0;
  return roundHalfUp(0.5 * timeCost(chargedUntil, bookedEnd, tariff, cls, data, city));
}

/**
 * Time cost of a booking [start, bookedEnd) returned at `chargedUntil`, in integer cents:
 * `share` of the price up to `chargedUntil` (capped from `start`, rounded half-up), plus the unused
 * booked time (`unusedTimeCost`).
 */
export function bookingTimeCost(
  start: LocalMinute,
  chargedUntil: LocalMinute,
  bookedEnd: LocalMinute,
  share: 1 | 0.5,
  tariff: TariffId,
  cls: PriceClass,
  data: PriceVersionView,
  city: string | undefined,
): number {
  const used = timeCost(start, chargedUntil, tariff, cls, data, city);
  return (
    roundHalfUp(share * used) + unusedTimeCost(chargedUntil, bookedEnd, tariff, cls, data, city)
  );
}

/**
 * Time cost of a reconstructed booking in any tariff, in integer cents: `bookingTimeCost`, plus
 * for a late return the overrun minutes at twice the time price, rounded as a line item of its own.
 */
export function reconstructedTimeCost(
  trip: Trip,
  r: Pick<Reconstruction, "chargedUntil" | "bookedEnd" | "share" | "overrunMinutes">,
  tariff: TariffId,
  data: PriceVersionView,
): number {
  const cls = trip.priceClass;
  const booking = bookingTimeCost(
    trip.start,
    r.chargedUntil,
    r.bookedEnd,
    r.share,
    tariff,
    cls,
    data,
    trip.city,
  );
  if (r.overrunMinutes === 0) return booking;
  const returned = r.bookedEnd + r.overrunMinutes;
  return booking + roundHalfUp(overrunCost(r.bookedEnd, returned, tariff, cls, data, trip.city));
}

interface Overrun {
  bookedEnd: LocalMinute;
  minutes: number;
  inferred: boolean;
}

/**
 * The late return that explains the billed time amount, if any. Two readings of the export are
 * tried, each with booked ends on the quarter-hour grid:
 * 1. The export's end is the return, and the booking ended at a quarter hour before it (latest
 *    first, up to `MAX_OVERRUN_MINUTES` before). An exact match wins over one within 1 cent.
 * 2. The export's end is the booked end itself (as observed on an invoice). With a trip end
 *    (`tripEnd`) after it, only its minutes (±1, the export drops seconds) are tried and a match is
 *    confirmed; a trip end not after it rules this reading out. Without a trip end the return is
 *    fitted, 1 to `MAX_OVERRUN_MINUTES` minutes later, and the result is only inferred. Matches
 *    count only exactly here, since a free minute count fits almost any amount within 1 cent.
 */
function findOverrun(trip: Trip, data: PriceVersionView): Overrun | undefined {
  const { start, end, tariff, priceClass: cls } = trip;
  const deviation = (bookedEnd: LocalMinute, minutes: number) =>
    roundHalfUp(timeCost(start, bookedEnd, tariff, cls, data, trip.city)) +
    roundHalfUp(overrunCost(bookedEnd, bookedEnd + minutes, tariff, cls, data, trip.city)) -
    trip.billedTime;

  let near: Overrun | undefined;
  const latestBefore = Math.floor((end - 1) / QUARTER) * QUARTER;
  for (let b = latestBefore; b > start && end - b <= MAX_OVERRUN_MINUTES; b -= QUARTER) {
    const d = deviation(b, end - b);
    if (d === 0) return { bookedEnd: b, minutes: end - b, inferred: false };
    if (Math.abs(d) === 1) near ??= { bookedEnd: b, minutes: end - b, inferred: false };
  }
  if (end % QUARTER === 0 && end > start) {
    const { tripEnd } = trip;
    if (tripEnd === undefined) {
      for (let minutes = 1; minutes <= MAX_OVERRUN_MINUTES; minutes++) {
        if (deviation(end, minutes) === 0) return { bookedEnd: end, minutes, inferred: true };
      }
    } else if (tripEnd > end) {
      const measured = tripEnd - end;
      for (const minutes of [measured, measured - 1, measured + 1]) {
        if (minutes > 0 && deviation(end, minutes) === 0) {
          return { bookedEnd: end, minutes, inferred: false };
        }
      }
    }
  }
  return near;
}

function kmCheck(
  trip: Trip,
  data: PriceVersionView,
): Pick<Reconstruction, "surchargeCents" | "surchargeDerived" | "kmDeviation"> {
  const cost = (surcharge: number) =>
    kmCost(trip.km, trip.tariff, trip.priceClass, data, surcharge);
  // The price list valid at the time of return applies (research document, billing rules).
  const table = surchargeAt(data, trip.end);
  const deviation = cost(table) - trip.billedKm;
  if (deviation === 0) return { surchargeCents: table, surchargeDerived: false, kmDeviation: 0 };
  for (let surcharge = 0; surcharge <= MAX_DERIVED_SURCHARGE; surcharge++) {
    if (cost(surcharge) === trip.billedKm) {
      return { surchargeCents: surcharge, surchargeDerived: true, kmDeviation: 0 };
    }
  }
  return { surchargeCents: table, surchargeDerived: false, kmDeviation: deviation };
}

/**
 * True if every booked end in `ends` costs the same as `ends[0]` in every tariff that offers
 * the class, so the choice among them does not change any comparison.
 */
function sameInAllTariffs(
  trip: Trip,
  chargedUntil: LocalMinute,
  ends: LocalMinute[],
  data: PriceVersionView,
) {
  const [first, ...rest] = ends;
  if (first === undefined) return true;
  return (Object.keys(data.tariffs) as TariffId[]).every((tariff) => {
    if (!data.tariffs[tariff].prices[trip.priceClass]) return true;
    const cost = (end: LocalMinute) =>
      bookingTimeCost(trip.start, chargedUntil, end, 1, tariff, trip.priceClass, data, trip.city);
    const reference = cost(first);
    return rest.every((end) => cost(end) === reference);
  });
}

/**
 * Reconstructs the booking behind a billed trip. The export only holds the actual return, so the
 * booked end is searched: the earliest quarter hour whose booking cost matches the billed amount.
 * `data` is the price list valid at the trip's return, `pricesAt(priceData, trip.end)`: it prices
 * the whole trip.
 */
export function reconstructBooking(
  trip: Trip,
  data: PriceVersionView,
  manualBookedEnd?: LocalMinute,
): Reconstruction {
  const { start, tariff, priceClass: cls } = trip;
  const chargedUntil = Math.ceil(trip.end / QUARTER) * QUARTER;
  const km = kmCheck(trip, data);
  const result = (
    kind: ReconstructionKind,
    bookedEnd: LocalMinute,
    share: 1 | 0.5 = 1,
    overrunMinutes = 0,
    overrunInferred = false,
  ): Reconstruction => {
    const booking = {
      chargedUntil: overrunMinutes > 0 ? bookedEnd : chargedUntil,
      bookedEnd,
      overrunMinutes,
      overrunInferred,
      share,
    };
    return {
      // A km amount that no surcharge explains makes the whole trip unreproducible; the booked end
      // found from the time amount is kept as the best estimate. A manual booked end still wins.
      kind: km.kmDeviation !== 0 && kind !== "manual" ? "not-reproducible" : kind,
      ...booking,
      ...km,
      timeDeviation: reconstructedTimeCost(trip, booking, tariff, data) - trip.billedTime,
    };
  };

  if (trip.km === 0) {
    const full = timeCost(start, chargedUntil, tariff, cls, data, trip.city);
    if (Math.abs(roundHalfUp(full) - trip.billedTime) <= 1) return result("unused", chargedUntil);
    if (Math.abs(roundHalfUp(0.5 * full) - trip.billedTime) <= 1) {
      return result("cancelled", chargedUntil, 0.5);
    }
  }

  if (manualBookedEnd !== undefined && manualBookedEnd % QUARTER === 0) {
    if (manualBookedEnd >= chargedUntil) return result("manual", manualBookedEnd);
    // A booked end before the return: the time after it was an overrun.
    if (manualBookedEnd > start && manualBookedEnd < trip.end) {
      return result("manual", manualBookedEnd, 1, trip.end - manualBookedEnd);
    }
  }

  const exact: LocalMinute[] = [];
  let firstNearMatch: LocalMinute | undefined;
  for (let end = chargedUntil; end <= start + MAX_BOOKING_MINUTES; end += QUARTER) {
    const deviation =
      bookingTimeCost(start, chargedUntil, end, 1, tariff, cls, data, trip.city) - trip.billedTime;
    // The cost never falls with a later booked end, so nothing later can match.
    if (deviation > 1) break;
    if (deviation === 0) exact.push(end);
    else if (Math.abs(deviation) === 1) firstNearMatch ??= end;
  }

  const [earliest] = exact;
  if (earliest !== undefined) {
    const within24h = exact.filter((end) => end <= earliest + DAY);
    const verified = sameInAllTariffs(trip, chargedUntil, within24h, data);
    return result(verified ? "verified" : "estimated", earliest);
  }
  if (firstNearMatch !== undefined) return result("verified-rounding", firstNearMatch);

  // Only what the booked-end search cannot explain may be a late return.
  // With an unexplained km amount the trip is priced as the plain booking, without an overrun.
  const overrun = trip.km > 0 && km.kmDeviation === 0 ? findOverrun(trip, data) : undefined;
  if (overrun) {
    return result("overrun", overrun.bookedEnd, 1, overrun.minutes, overrun.inferred);
  }
  return result("not-reproducible", chargedUntil);
}
