import type { TariffId } from "@/domain/pricing/types";

/**
 * Monthly trip cost (in the lower-fee tariff) from which the higher-fee tariff pays off, for each
 * neighbouring pair with different fees. `tripsCost` is the model cost of the user's trips per
 * tariff without fees, `fee` the monthly fee including additional drivers; both in cents.
 */
export function breakEven(
  tariffs: TariffId[],
  tripsCost: Partial<Record<TariffId, number>>,
  fee: Partial<Record<TariffId, number>>,
): { lower: TariffId; higher: TariffId; monthlyTripCost: number | null }[] {
  const result: { lower: TariffId; higher: TariffId; monthlyTripCost: number | null }[] = [];
  for (let i = 0; i + 1 < tariffs.length; i++) {
    const lower = tariffs[i] as TariffId;
    const higher = tariffs[i + 1] as TariffId;
    const feeDiff = (fee[higher] ?? 0) - (fee[lower] ?? 0);
    if (feeDiff <= 0) continue;
    const costLower = tripsCost[lower] ?? 0;
    const costHigher = tripsCost[higher] ?? 0;
    const s = costLower > 0 ? 1 - costHigher / costLower : 0;
    result.push({
      lower,
      higher,
      monthlyTripCost: s > 0 ? Math.round(feeDiff / s) : null,
    });
  }
  return result;
}
