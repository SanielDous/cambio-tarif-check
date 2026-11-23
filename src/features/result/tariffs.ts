import type { ReconstructionKind } from "@/domain/analysis/reconstruct-booking";
import type { TariffId } from "@/domain/pricing/types";

/** The CSS variable holding a tariff's identity colour (see `src/styles/index.css`). */
export const tariffColorVar = (tariff: TariffId) => `--tariff-${tariff.toLowerCase()}`;

/** `var(...)` reference to a tariff's identity colour, for inline styles. */
export const tariffColor = (tariff: TariffId) => `var(${tariffColorVar(tariff)})`;

/**
 * Kinds whose billed amount was reproduced to the cent from the export alone. A late return
 * ("overrun") counts as exact only with a time deviation of 0, as rounding with ±1 cent.
 */
export const EXACT_KINDS: ReconstructionKind[] = ["verified", "cancelled", "unused"];

/** Kinds for which the user can enter the booked end by hand. */
export const EDITABLE_KINDS: ReconstructionKind[] = ["estimated", "not-reproducible", "manual"];

/** Id of the trip list section of a month, the target of the matrix month headers. */
export const monthSectionId = (month: string) => `trips-${month}`;
