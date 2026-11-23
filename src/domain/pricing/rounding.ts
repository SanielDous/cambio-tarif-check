/** Removes float noise below 1e-6 cents before a rounding decision. */
const denoise = (cents: number) => Math.round(cents * 1e6) / 1e6;

/** Rounds to integer cents, halves up (used for invoice amounts). */
export function roundHalfUp(cents: number): number {
  return Math.floor(denoise(cents) + 0.5);
}

/**
 * Best known approximation of how the public price calculator rounds the time cost: the amount
 * in euros is held as a single-precision float and then rounded half-up to cents. This only
 * matters for exact half cents, which go up or down depending on the float32 representation
 * (0.525 → 0.52, 2.625 → 2.63). It matches 654 of 663 recorded time costs; the misses are all
 * half cents, so the calculator's real rule also depends on price and duration.
 */
export function roundCalculator(cents: number): number {
  return Math.round(Math.fround(cents / 100) * 100);
}
