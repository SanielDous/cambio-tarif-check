import type { Trip } from "@/domain/import/fields";
import { kmCost } from "@/domain/pricing/km-cost";
import { surchargeAt } from "@/domain/pricing/price-data";
import { roundHalfUp } from "@/domain/pricing/rounding";
import { timeCost } from "@/domain/pricing/time-cost";
import type { LocalMinute, PriceClass, PriceData, TariffId } from "@/domain/pricing/types";

export type ReconstructionKind =
  | "verified"
  | "verified-rounding"
  | "estimated"
  | "manual"
  | "cancelled"
  | "unused"
  | "not-reproducible";

export interface Reconstruction {
  kind: ReconstructionKind;
  /** Return rounded up to the quarter hour; up to here the full time price applies. */
  chargedUntil: LocalMinute;
  bookedEnd: LocalMinute;
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
/** Surcharges tried when the table surcharge does not reproduce the billed km amount. */
const MAX_DERIVED_SURCHARGE = 10;

/**
 * Time cost of a booking [start, bookedEnd) returned at `chargedUntil`, in integer cents:
 * `share` of the price up to `chargedUntil`, plus 50 % of the remaining booked time. Both parts
 * are capped as one booking from `start` and rounded half-up separately.
 */
export function bookingTimeCost(
  start: LocalMinute,
  chargedUntil: LocalMinute,
  bookedEnd: LocalMinute,
  share: 1 | 0.5,
  tariff: TariffId,
  cls: PriceClass,
  data: PriceData,
): number {
  const used = timeCost(start, chargedUntil, tariff, cls, data);
  const unused =
    bookedEnd > chargedUntil ? timeCost(start, bookedEnd, tariff, cls, data) - used : 0;
  return roundHalfUp(share * used) + roundHalfUp(0.5 * unused);
}

function kmCheck(
  trip: Trip,
  data: PriceData,
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
  data: PriceData,
) {
  const [first, ...rest] = ends;
  if (first === undefined) return true;
  return (Object.keys(data.tariffs) as TariffId[]).every((tariff) => {
    if (!data.tariffs[tariff].prices[trip.priceClass]) return true;
    const cost = (end: LocalMinute) =>
      bookingTimeCost(trip.start, chargedUntil, end, 1, tariff, trip.priceClass, data);
    const reference = cost(first);
    return rest.every((end) => cost(end) === reference);
  });
}

/**
 * Reconstructs the booking behind a billed trip. The export only holds the actual return, so the
 * booked end is searched: the earliest quarter hour whose booking cost matches the billed amount.
 */
export function reconstructBooking(
  trip: Trip,
  data: PriceData,
  manualBookedEnd?: LocalMinute,
): Reconstruction {
  const { start, tariff, priceClass: cls } = trip;
  const chargedUntil = Math.ceil(trip.end / QUARTER) * QUARTER;
  const km = kmCheck(trip, data);
  const result = (
    kind: ReconstructionKind,
    bookedEnd: LocalMinute,
    share: 1 | 0.5 = 1,
  ): Reconstruction => ({
    // A km amount that no surcharge explains makes the whole trip unreproducible; the booked end
    // found from the time amount is kept as the best estimate. A manual booked end still wins.
    kind: km.kmDeviation !== 0 && kind !== "manual" ? "not-reproducible" : kind,
    chargedUntil,
    bookedEnd,
    share,
    ...km,
    timeDeviation:
      bookingTimeCost(start, chargedUntil, bookedEnd, share, tariff, cls, data) - trip.billedTime,
  });

  if (trip.km === 0) {
    const full = timeCost(start, chargedUntil, tariff, cls, data);
    if (Math.abs(roundHalfUp(full) - trip.billedTime) <= 1) return result("unused", chargedUntil);
    if (Math.abs(roundHalfUp(0.5 * full) - trip.billedTime) <= 1) {
      return result("cancelled", chargedUntil, 0.5);
    }
  }

  if (
    manualBookedEnd !== undefined &&
    manualBookedEnd >= chargedUntil &&
    manualBookedEnd % QUARTER === 0
  ) {
    return result("manual", manualBookedEnd);
  }

  const exact: LocalMinute[] = [];
  let firstNearMatch: LocalMinute | undefined;
  for (let end = chargedUntil; end <= start + MAX_BOOKING_MINUTES; end += QUARTER) {
    const deviation =
      bookingTimeCost(start, chargedUntil, end, 1, tariff, cls, data) - trip.billedTime;
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
  return result("not-reproducible", chargedUntil);
}
