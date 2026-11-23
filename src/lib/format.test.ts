import { describe, expect, it } from "vitest";
import { toLocalMinute } from "@/domain/pricing/local-time";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMonth,
  formatMonthName,
  formatNumber,
  formatTime,
  formatWeekdayDate,
} from "./format";

// Intl puts a no-break space between amount and euro sign in German.
const nb = (text: string) => text.replace(/ /g, "\u00a0");
// English times may use narrow no-break spaces; compare with plain spaces.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatCurrency", () => {
  it("formats cents as euros in German", () => {
    expect(formatCurrency(123456, "de")).toBe(nb("1.234,56 €"));
    expect(formatCurrency(5, "de")).toBe(nb("0,05 €"));
    expect(formatCurrency(-82, "de")).toBe(nb("-0,82 €"));
  });

  it("formats cents as euros in English", () => {
    expect(formatCurrency(123456, "en")).toBe("€1,234.56");
    expect(formatCurrency(-82, "en")).toBe("-€0.82");
  });

  it("rounds to whole euros when asked", () => {
    expect(formatCurrency(11249, "de", { decimals: 0 })).toBe(nb("112 €"));
    expect(formatCurrency(11250, "en", { decimals: 0 })).toBe("€113");
    expect(formatCurrency(-11250, "en", { decimals: 0 })).toBe("-€113");
    expect(formatCurrency(-49, "de", { decimals: 0 })).toBe(nb("0 €"));
  });

  it("signs positive amounts when asked and leaves zero unsigned", () => {
    expect(formatCurrency(100, "de", { signed: true })).toBe(nb("+1,00 €"));
    expect(formatCurrency(-100, "en", { signed: true })).toBe("-€1.00");
    expect(formatCurrency(0, "en", { signed: true })).toBe("€0.00");
  });
});

describe("formatMonth", () => {
  it("formats short and long month names", () => {
    expect(formatMonth("2025-01", "de", "short")).toBe("Jan. 2025");
    expect(formatMonth("2025-01", "en", "short")).toBe("Jan 2025");
    expect(formatMonth("2025-03", "de")).toBe("März 2025");
    expect(formatMonth("2025-03", "en")).toBe("March 2025");
    expect(formatMonthName("2025-12", "de")).toBe("Dez");
    expect(formatMonthName("2025-12", "en")).toBe("Dec");
  });
});

describe("date and time", () => {
  // Late evening on New Year's Eve: any time-zone shift would change day, month and year.
  const t = toLocalMinute(2025, 12, 31, 23, 45);

  it("formats in German without any time-zone shift", () => {
    expect(formatDate(t, "de")).toBe("31.12.2025");
    expect(formatWeekdayDate(t, "de")).toBe("Mi., 31.12.2025");
    expect(formatTime(t, "de")).toBe("23:45");
    expect(formatDateTime(t, "de")).toBe("31.12.2025, 23:45");
  });

  it("formats in English without any time-zone shift", () => {
    expect(formatDate(t, "en")).toBe("Dec 31, 2025");
    expect(formatWeekdayDate(t, "en")).toBe("Wed, Dec 31, 2025");
    expect(plain(formatTime(t, "en"))).toBe("11:45 PM");
    expect(plain(formatDateTime(t, "en"))).toBe("Dec 31, 2025, 11:45 PM");
  });
});

describe("formatDuration and formatNumber", () => {
  it("formats durations", () => {
    const units = { hour: "h", minute: "min" };
    expect(formatDuration(135, units)).toBe("2 h 15 min");
    expect(formatDuration(45, units)).toBe("45 min");
    expect(formatDuration(180, units)).toBe("3 h");
    expect(formatDuration(0, units)).toBe("0 min");
    expect(formatDuration(135, { hour: "Std.", minute: "Min." })).toBe("2 Std. 15 Min.");
  });

  it("formats numbers per language", () => {
    expect(formatNumber(1234, "de")).toBe("1.234");
    expect(formatNumber(1234, "en")).toBe("1,234");
  });
});
