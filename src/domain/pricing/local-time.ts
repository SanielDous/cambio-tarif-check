import type { LocalMinute } from "./types";

// All conversions are pure integer arithmetic on the proleptic Gregorian calendar, so results
// never depend on the time zone of the process (no Date objects involved).

const MINUTES_PER_DAY = 1440;

/** Days since 1970-01-01 for a calendar date (algorithm by Howard Hinnant). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Calendar date for a number of days since 1970-01-01. */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function daysInMonth(year: number, month: number): number {
  return (
    daysFromCivil(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) -
    daysFromCivil(year, month, 1)
  );
}

export function toLocalMinute(y: number, m: number, d: number, hh = 0, mm = 0): LocalMinute {
  return daysFromCivil(y, m, d) * MINUTES_PER_DAY + hh * 60 + mm;
}

const LOCAL_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Parses "DD.MM.YYYY HH:MM[:SS]" (seconds are dropped); null if malformed or impossible. */
export function parseLocal(text: string): LocalMinute | null {
  const match = LOCAL_PATTERN.exec(text.trim());
  if (!match) return null;
  const [day, month, year, hour, minute, second] = match
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part))) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return toLocalMinute(year, month, day, hour, minute);
}

/** Days since 1970-01-01 of the calendar day containing t. */
export function dayNumber(t: LocalMinute): number {
  return Math.floor(t / MINUTES_PER_DAY);
}

/** Weekday of a day number, 1 = Monday … 7 = Sunday (1970-01-01 was a Thursday). */
export function weekdayOfDay(days: number): number {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

export function dateParts(t: LocalMinute): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const days = dayNumber(t);
  const minuteOfDay = t - days * MINUTES_PER_DAY;
  return {
    ...civilFromDays(days),
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    weekday: weekdayOfDay(days),
  };
}

/** "YYYY-MM" of the month containing t. */
export function monthKey(t: LocalMinute): string {
  const { year, month } = civilFromDays(dayNumber(t));
  return `${year}-${String(month).padStart(2, "0")}`;
}
