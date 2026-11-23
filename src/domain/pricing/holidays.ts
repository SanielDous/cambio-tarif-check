import { dateParts, dayNumber, toLocalMinute } from "./local-time";
import type { LocalMinute } from "./types";

// The calculator prices these days at the weekend rate: the nine nationwide public holidays plus
// All Saints (1 November). Corpus Christi, although a holiday in several states, gets the
// weekday rate (recorded calculator responses, see the research document).

/** Day number (days since 1970-01-01) of Easter Sunday (anonymous Gregorian algorithm). */
function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNumber(toLocalMinute(year, month, day));
}

function holidaysOf(year: number): Set<number> {
  const fixed: [number, number][] = [
    [1, 1], // New Year's Day
    [5, 1], // Labour Day
    [10, 3], // German Unity Day
    [11, 1], // All Saints (priced as a holiday by the calculator)
    [12, 25], // Christmas Day
    [12, 26], // Second day of Christmas
  ];
  const easter = easterSunday(year);
  return new Set([
    ...fixed.map(([month, day]) => dayNumber(toLocalMinute(year, month, day))),
    easter - 2, // Good Friday
    easter + 1, // Easter Monday
    easter + 39, // Ascension Day
    easter + 50, // Whit Monday
  ]);
}

const byYear = new Map<number, Set<number>>();
const byDay = new Map<number, boolean>();

/** Whether the calendar day with this day number is a holiday (cached, for hot loops). */
export function isHolidayDay(days: number): boolean {
  let result = byDay.get(days);
  if (result === undefined) {
    const { year } = dateParts(days * 1440);
    let set = byYear.get(year);
    if (!set) {
      set = holidaysOf(year);
      byYear.set(year, set);
    }
    result = set.has(days);
    byDay.set(days, result);
  }
  return result;
}

/** Whether t falls on a holiday (whole calendar day 00:00–24:00). */
export function isHoliday(t: LocalMinute): boolean {
  return isHolidayDay(dayNumber(t));
}
