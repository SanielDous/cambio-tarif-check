import type { ReconstructionKind } from "@/domain/analysis/reconstruct-booking";
import type { TariffId } from "@/domain/pricing/types";

/** All tariffs in the order of their monthly fee. */
export const ALL_TARIFFS: TariffId[] = ["CAMPUS", "BASIS", "START", "AKTIV", "COMFORT"];

/** The CSS variable holding a tariff's identity colour (see `src/styles/index.css`). */
export const tariffColorVar = (tariff: TariffId) => `--tariff-${tariff.toLowerCase()}`;

/** `var(...)` reference to a tariff's identity colour, for inline styles. */
export const tariffColor = (tariff: TariffId) => `var(${tariffColorVar(tariff)})`;

/** Kinds whose billed amount was reproduced to the cent from the export alone. */
export const EXACT_KINDS: ReconstructionKind[] = ["verified", "cancelled", "unused"];

/** Kinds for which the user can enter the booked end by hand. */
export const EDITABLE_KINDS: ReconstructionKind[] = ["estimated", "not-reproducible", "manual"];

/** Id of the trip list section of a month, the target of the matrix month headers. */
export const monthSectionId = (month: string) => `trips-${month}`;
