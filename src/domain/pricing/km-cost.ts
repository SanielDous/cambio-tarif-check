import { roundHalfUp } from "./rounding";
import { classPrice } from "./time-cost";
import type { PriceClass, PriceVersionView, TariffId } from "./types";

/** Km cost in integer cents: marginal tiers, the surcharge (cents per km) added to both. */
export function kmCost(
  km: number,
  tariff: TariffId,
  cls: PriceClass,
  data: PriceVersionView,
  surchargeCents: number,
): number {
  const price = classPrice(tariff, cls, data);
  const tier1 = Math.min(km, data.kmTierBoundary);
  const tier2 = Math.max(km - data.kmTierBoundary, 0);
  return roundHalfUp(
    tier1 * (price.kmTier1 + surchargeCents) + tier2 * (price.kmTier2 + surchargeCents),
  );
}
