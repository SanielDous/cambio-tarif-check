import { isHolidayDay } from "./holidays";
import { dayNumber, weekdayOfDay } from "./local-time";
import type { ClassPrice, LocalMinute, PriceClass, PriceData, TariffId } from "./types";

const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Prices of a class in a tariff; throws if the tariff does not offer the class. */
export function classPrice(tariff: TariffId, cls: PriceClass, data: PriceData): ClassPrice {
  const price = data.tariffs[tariff].prices[cls];
  if (!price) throw new Error(`Tariff ${tariff} has no price class ${cls}`);
  return price;
}

const normalisedCities = new WeakMap<PriceData, Set<string>>();

/** Trim, lower-case and strip diacritics, so spelling variants of a city name compare equal. */
function normaliseCity(city: string): string {
  return city.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Whether public holidays are charged at the weekend price in this city. An unknown city or none
 * means no holiday pricing. Call it once per booking, not per minute.
 */
export function chargesHolidays(city: string | undefined, data: PriceData): boolean {
  if (city === undefined) return false;
  let set = normalisedCities.get(data);
  if (!set) {
    set = new Set(data.holidayCities.map(normaliseCity));
    normalisedCities.set(data, set);
  }
  return set.has(normaliseCity(city));
}

function isWeekend(weekday: number, hour: number, data: PriceData): boolean {
  const { weekendStart: from, weekendEnd: to } = data;
  if (weekday === from.weekday) return hour >= from.hour;
  if (weekday === to.weekday) return hour < to.hour;
  // Weekdays strictly between Friday and Monday: Saturday and Sunday.
  return weekday > from.weekday || weekday < to.weekday;
}

/** Hour price for the full hour starting at the full hour `hourStart`. */
function priceOfHour(
  hourStart: LocalMinute,
  price: ClassPrice,
  data: PriceData,
  holidays: boolean,
): number {
  const day = dayNumber(hourStart);
  const hour = (hourStart - day * DAY) / HOUR;
  if (hour >= data.nightStartHour && hour < data.nightEndHour) return data.nightHourPrice;
  if (price.hourWeekend === price.hourWeekday) return price.hourWeekday;
  return isWeekend(weekdayOfDay(day), hour, data) || (holidays && isHolidayDay(day))
    ? price.hourWeekend
    : price.hourWeekday;
}

/** Hour price in cents that applies to the minute starting at t. */
export function hourPriceAt(
  t: LocalMinute,
  tariff: TariffId,
  cls: PriceClass,
  data: PriceData,
  city: string | undefined,
): number {
  return priceOfHour(
    Math.floor(t / HOUR) * HOUR,
    classPrice(tariff, cls, data),
    data,
    chargesHolidays(city, data),
  );
}

/**
 * Cost of returning late, [bookedEnd, returned), in fractional cents: every minute after the booked
 * end costs twice the hour price that applies to it (night and weekend prices included), without
 * any cap. The invoice rounds it as a line item of its own.
 */
export function overrunCost(
  bookedEnd: LocalMinute,
  returned: LocalMinute,
  tariff: TariffId,
  cls: PriceClass,
  data: PriceData,
  city: string | undefined,
): number {
  // cents × 60, as in `uncapped`, divided once at the end.
  const price = classPrice(tariff, cls, data);
  const holidays = chargesHolidays(city, data);
  let sum = 0;
  for (let t = bookedEnd; t < returned; t++) {
    sum += 2 * priceOfHour(Math.floor(t / HOUR) * HOUR, price, data, holidays);
  }
  return sum / HOUR;
}

/**
 * Uncapped cost of [from, to) in cents × 60 (an integer), stopping early once `limit` is reached.
 * Prices only change at full hours, so the walk goes hour by hour.
 */
function uncapped(
  from: LocalMinute,
  to: LocalMinute,
  limit: number,
  price: ClassPrice,
  data: PriceData,
  holidays: boolean,
): number {
  let sum = 0;
  let t = from;
  while (t < to && sum < limit) {
    const hourStart = Math.floor(t / HOUR) * HOUR;
    const next = Math.min(hourStart + HOUR, to);
    sum += (next - t) * priceOfHour(hourStart, price, data, holidays);
    t = next;
  }
  return sum;
}

/** Capped time cost in fractional cents for a booking [start, end), caps anchored at `start`. */
export function timeCost(
  start: LocalMinute,
  end: LocalMinute,
  tariff: TariffId,
  cls: PriceClass,
  data: PriceData,
  city: string | undefined,
): number {
  const price = classPrice(tariff, cls, data);
  const holidays = chargesHolidays(city, data);
  // Work in cents × 60 (integers) and divide once at the end to avoid float drift.
  const fullDay = data.dayCapHours * price.hourWeekday * HOUR;
  const dayCap = price.dayCap === undefined ? fullDay : price.dayCap * HOUR;
  const weekCap = data.weekCapDays * fullDay;
  let total = 0;
  for (let weekStart = start; weekStart < end; weekStart += WEEK) {
    const weekEnd = Math.min(weekStart + WEEK, end);
    let week = 0;
    for (let dayStart = weekStart; dayStart < weekEnd && week < weekCap; dayStart += DAY) {
      const dayEnd = Math.min(dayStart + DAY, weekEnd);
      week += Math.min(uncapped(dayStart, dayEnd, dayCap, price, data, holidays), dayCap);
    }
    total += Math.min(week, weekCap);
  }
  return total / HOUR;
}
