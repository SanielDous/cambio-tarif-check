import { dateParts, toLocalMinute } from "@/domain/pricing/local-time";
import type { LocalMinute } from "@/domain/pricing/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of the day containing t, the value format of a date input. */
export function toDateValue(t: LocalMinute): string {
  const p = dateParts(t);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export type BookedEndResult =
  { ok: true; value: LocalMinute } | { ok: false; error: "invalid" | "tooEarly" | "tooLate" };

/**
 * Parses a date input value and a minute of the day into a booked end and checks it against the
 * allowed range [min, max]. Impossible dates (31 February) are rejected by round-tripping through
 * the calendar arithmetic.
 */
export function parseBookedEnd(
  date: string,
  minuteOfDay: number,
  min: LocalMinute,
  max: LocalMinute,
): BookedEndResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return { ok: false, error: "invalid" };
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  const day = toLocalMinute(y, m, d);
  const back = dateParts(day);
  if (back.year !== y || back.month !== m || back.day !== d) return { ok: false, error: "invalid" };
  const value = day + minuteOfDay;
  if (value < min) return { ok: false, error: "tooEarly" };
  if (value > max) return { ok: false, error: "tooLate" };
  return { ok: true, value };
}
