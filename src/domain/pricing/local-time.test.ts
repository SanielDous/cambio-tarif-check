import { afterEach, describe, expect, it } from "vitest";
import { dateParts, monthKey, parseLocal, toLocalMinute } from "./local-time";

describe("local-time", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("parses an export time and round-trips through dateParts", () => {
    const t = parseLocal("15.12.2025 17:15:00");
    expect(t).not.toBeNull();
    expect(dateParts(t!)).toEqual({
      year: 2025,
      month: 12,
      day: 15,
      hour: 17,
      minute: 15,
      weekday: 1,
    });
    expect(t).toBe(toLocalMinute(2025, 12, 15, 17, 15));
  });

  it("parses times without seconds", () => {
    expect(parseLocal("02.03.2027 06:00")).toBe(toLocalMinute(2027, 3, 2, 6, 0));
  });

  it("counts minutes from 1970-01-01 00:00", () => {
    expect(toLocalMinute(1970, 1, 1)).toBe(0);
    expect(toLocalMinute(1970, 1, 2, 1, 1)).toBe(1440 + 61);
    expect(dateParts(0).weekday).toBe(4);
  });

  it("knows weekdays (1 = Monday … 7 = Sunday)", () => {
    expect(dateParts(toLocalMinute(2025, 12, 15)).weekday).toBe(1);
    expect(dateParts(toLocalMinute(2027, 3, 5)).weekday).toBe(5);
    expect(dateParts(toLocalMinute(2027, 3, 7, 23, 59)).weekday).toBe(7);
  });

  it("handles leap days and month ends", () => {
    expect(dateParts(toLocalMinute(2028, 2, 29, 12))).toMatchObject({ month: 2, day: 29 });
    expect(dateParts(toLocalMinute(2028, 2, 29) + 1440)).toMatchObject({ month: 3, day: 1 });
    expect(dateParts(toLocalMinute(2025, 12, 31, 23, 59) + 1)).toMatchObject({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
    });
  });

  it("rejects invalid input", () => {
    expect(parseLocal("32.01.2025 10:00")).toBeNull();
    expect(parseLocal("")).toBeNull();
    expect(parseLocal("29.02.2025 10:00")).toBeNull();
    expect(parseLocal("01.13.2025 10:00")).toBeNull();
    expect(parseLocal("01.01.2025 24:00")).toBeNull();
    expect(parseLocal("01.01.2025 10:60")).toBeNull();
    expect(parseLocal("2025-01-01 10:00")).toBeNull();
  });

  it("formats month keys", () => {
    expect(monthKey(toLocalMinute(2025, 1, 31, 23, 59))).toBe("2025-01");
    expect(monthKey(toLocalMinute(2025, 12, 1))).toBe("2025-12");
  });

  it("does not depend on the process time zone", () => {
    const compute = () => {
      const t = parseLocal("30.03.2025 02:30:00")!;
      return { t, parts: dateParts(t), month: monthKey(t), mk: toLocalMinute(2025, 10, 26, 2, 30) };
    };
    process.env.TZ = "America/New_York";
    const newYork = compute();
    process.env.TZ = "Asia/Tokyo";
    const tokyo = compute();
    expect(newYork).toEqual(tokyo);
    expect(newYork.parts).toMatchObject({ year: 2025, month: 3, day: 30, hour: 2, minute: 30 });
  });
});
