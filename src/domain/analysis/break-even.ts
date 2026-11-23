import type { TariffId } from "@/domain/pricing/types";

export interface BreakEven {
  lower: TariffId;
  higher: TariffId;
  /** Monthly trip cost in the lower tariff from which the higher one pays off; null = never. */
  monthlyTripCost: number | null;
  /** Number of months whose trip cost in the lower tariff lies above the threshold. */
  monthsAbove: number;
  months: { month: string; above: boolean }[];
}

/**
 * Monthly trip cost (in the lower-fee tariff) from which the higher-fee tariff pays off, for each
 * neighbouring pair with different fees. `tripsCost` is the model cost of the user's trips per
 * tariff without fees, `fee` the monthly fee including additional drivers; both in cents.
 * `monthly` holds the same trip cost per month (without fees), to count the months above the
 * threshold.
 */
export function breakEven(
  tariffs: TariffId[],
  tripsCost: Partial<Record<TariffId, number>>,
  fee: Partial<Record<TariffId, number>>,
  monthly: { month: string; tripsCost: Partial<Record<TariffId, number>> }[] = [],
): BreakEven[] {
  const result: BreakEven[] = [];
  for (let i = 0; i + 1 < tariffs.length; i++) {
    const lower = tariffs[i] as TariffId;
    const higher = tariffs[i + 1] as TariffId;
    const feeDiff = (fee[higher] ?? 0) - (fee[lower] ?? 0);
    if (feeDiff <= 0) continue;
    const costLower = tripsCost[lower] ?? 0;
    const costHigher = tripsCost[higher] ?? 0;
    const s = costLower > 0 ? 1 - costHigher / costLower : 0;
    const threshold = s > 0 ? Math.round(feeDiff / s) : null;
    const months = monthly.map((m) => ({
      month: m.month,
      above: threshold !== null && (m.tripsCost[lower] ?? 0) > threshold,
    }));
    result.push({
      lower,
      higher,
      monthlyTripCost: threshold,
      monthsAbove: months.filter((m) => m.above).length,
      months,
    });
  }
  return result;
}
