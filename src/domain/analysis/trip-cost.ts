import type { Trip } from "@/domain/import/fields";
import { kmCost } from "@/domain/pricing/km-cost";
import type { PriceData, TariffId } from "@/domain/pricing/types";
import { bookingTimeCost, type Reconstruction } from "./reconstruct-booking";

/**
 * Cost of a reconstructed trip in any tariff, in integer cents: the same booking (charged and
 * booked end, share) and the same km surcharge as billed. Null if the tariff has no price for
 * the trip's class.
 */
export function tripCostInTariff(
  trip: Trip,
  r: Reconstruction,
  tariff: TariffId,
  data: PriceData,
): { time: number; km: number } | null {
  if (!data.tariffs[tariff].prices[trip.priceClass]) return null;
  return {
    time: bookingTimeCost(
      trip.start,
      r.chargedUntil,
      r.bookedEnd,
      r.share,
      tariff,
      trip.priceClass,
      data,
    ),
    km: kmCost(trip.km, tariff, trip.priceClass, data, r.surchargeCents),
  };
}
