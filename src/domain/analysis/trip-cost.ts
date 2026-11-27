import type { Trip } from "@/domain/import/fields";
import { kmCost } from "@/domain/pricing/km-cost";
import { hasClassPrice } from "@/domain/pricing/time-cost";
import type { PriceVersionView, TariffId } from "@/domain/pricing/types";
import { reconstructedTimeCost, type Reconstruction } from "./reconstruct-booking";

/**
 * Cost of a reconstructed trip in any tariff, in integer cents: the same booking (charged and
 * booked end, share, overrun minutes) and the same km surcharge as billed, with the price list
 * valid at the return (`pricesAt(priceData, trip.end)`). Null if that list does not have the
 * tariff or the tariff has no price for the trip's class.
 */
export function tripCostInTariff(
  trip: Trip,
  r: Reconstruction,
  tariff: TariffId,
  data: PriceVersionView,
): { time: number; km: number } | null {
  if (!hasClassPrice(tariff, trip.priceClass, data)) return null;
  return {
    time: reconstructedTimeCost(trip, r, tariff, data),
    km: kmCost(trip.km, tariff, trip.priceClass, data, r.surchargeCents),
  };
}
