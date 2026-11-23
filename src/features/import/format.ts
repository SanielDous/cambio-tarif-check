import { dateParts } from "@/domain/pricing/local-time";
import type { LocalMinute } from "@/domain/pricing/types";

/** Formats a calendar date; built from UTC parts so the browser's time zone never shifts it. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(t: LocalMinute, language: string): string {
  const { year, month, day } = dateParts(t);
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(
    utcDate(year, month, day),
  );
}

/** "YYYY-MM" as a month name with year. */
export function formatMonth(key: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1));
}

export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value);
}
