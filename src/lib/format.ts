import { dateParts } from "@/domain/pricing/local-time";
import type { LocalMinute } from "@/domain/pricing/types";

// Dates are built from the naive local parts as UTC instants and formatted in UTC, so the
// browser's time zone never shifts a time or a date.

function utcFromParts(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

function utcFromMinute(t: LocalMinute): Date {
  const { year, month, day, hour, minute } = dateParts(t);
  return utcFromParts(year, month, day, hour, minute);
}

function utcFromMonthKey(key: string): Date {
  return utcFromParts(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1);
}

const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(
  key: string,
  create: () => T,
): T {
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = create();
    formatters.set(key, formatter);
  }
  return formatter as T;
}

export interface CurrencyOptions {
  /** 2 (default) or 0 for whole euros, rounded half away from zero. */
  decimals?: 0 | 2;
  /** Prefix positive amounts with "+" (zero stays unsigned). */
  signed?: boolean;
}

/** Integer cents as euros: "1.234,56 €" (de), "€1,234.56" (en). */
export function formatCurrency(
  cents: number,
  language: string,
  { decimals = 2, signed = false }: CurrencyOptions = {},
): string {
  const formatter = cached(
    `currency|${language}|${decimals}|${signed}`,
    () =>
      new Intl.NumberFormat(language, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        signDisplay: signed ? "exceptZero" : "auto",
      }),
  );
  const euros = decimals === 0 ? Math.sign(cents) * Math.round(Math.abs(cents) / 100) : cents / 100;
  return formatter.format(euros === 0 ? 0 : euros);
}

export function formatNumber(value: number, language: string): string {
  return cached(`number|${language}`, () => new Intl.NumberFormat(language)).format(value);
}

/** "YYYY-MM" as "Jan. 2025" / "Jan 2025" (short) or "Januar 2025" / "January 2025" (long). */
export function formatMonth(
  key: string,
  language: string,
  style: "short" | "long" = "long",
): string {
  return cached(
    `month|${language}|${style}`,
    () => new Intl.DateTimeFormat(language, { month: style, year: "numeric", timeZone: "UTC" }),
  ).format(utcFromMonthKey(key));
}

/** "YYYY-MM" as the short month name alone: "Jan." / "Jan". */
export function formatMonthName(key: string, language: string): string {
  return cached(
    `monthName|${language}`,
    () => new Intl.DateTimeFormat(language, { month: "short", timeZone: "UTC" }),
  ).format(utcFromMonthKey(key));
}

/** Calendar date: "15.12.2025" / "Dec 15, 2025". */
export function formatDate(t: LocalMinute, language: string): string {
  return cached(
    `date|${language}`,
    () => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }),
  ).format(utcFromMinute(t));
}

/** Date with weekday: "Mo., 15.12.2025" / "Mon, Dec 15, 2025". */
export function formatWeekdayDate(t: LocalMinute, language: string): string {
  return cached(
    `weekdayDate|${language}`,
    () =>
      new Intl.DateTimeFormat(language, {
        weekday: "short",
        day: "numeric",
        month: language.startsWith("de") ? "2-digit" : "short",
        year: "numeric",
        timeZone: "UTC",
      }),
  ).format(utcFromMinute(t));
}

/** Time of day: "17:15" / "5:15 PM". */
export function formatTime(t: LocalMinute, language: string): string {
  return cached(
    `time|${language}`,
    () => new Intl.DateTimeFormat(language, { timeStyle: "short", timeZone: "UTC" }),
  ).format(utcFromMinute(t));
}

/** Date and time: "15.12.2025, 17:15" / "Dec 15, 2025, 5:15 PM". */
export function formatDateTime(t: LocalMinute, language: string): string {
  return cached(
    `dateTime|${language}`,
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
  ).format(utcFromMinute(t));
}

/** A length of time in minutes with the given unit labels: "2 h 15 min", "45 min", "3 h". */
export function formatDuration(minutes: number, units: { hour: string; minute: string }): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} ${units.minute}`;
  return m === 0 ? `${h} ${units.hour}` : `${h} ${units.hour} ${m} ${units.minute}`;
}

/** A number with exactly `digits` decimals: "12,5" (de), "12.5" (en). */
export function formatDecimal(value: number, language: string, digits = 1): string {
  return cached(
    `decimal|${language}|${digits}`,
    () =>
      new Intl.NumberFormat(language, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }),
  ).format(value);
}

/** Minutes as hours with one decimal: "12,5" (de), "12.5" (en). */
export function formatHours(minutes: number, language: string): string {
  return formatDecimal(minutes / 60, language, 1);
}
