import { describe, expect, it } from "vitest";
import { isHoliday } from "./holidays";
import { toLocalMinute } from "./local-time";

const at = (date: string, hour = 12, minute = 0) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return toLocalMinute(y, m, d, hour, minute);
};

describe("isHoliday", () => {
  const holidays = [
    "2027-01-01",
    "2027-03-26",
    "2027-03-29",
    "2027-05-06",
    "2027-05-17",
    "2027-11-01",
    "2028-05-01",
    "2028-10-03",
    "2028-12-25",
    "2028-12-26",
  ];
  const workdays = ["2027-01-06", "2027-05-27", "2027-12-24", "2027-12-31", "2028-10-31"];

  for (const date of holidays) {
    it(`${date} is a holiday`, () => expect(isHoliday(at(date))).toBe(true));
  }
  for (const date of workdays) {
    it(`${date} is not a holiday`, () => expect(isHoliday(at(date))).toBe(false));
  }

  it("covers the whole calendar day", () => {
    expect(isHoliday(at("2027-05-06", 0, 0))).toBe(true);
    expect(isHoliday(at("2027-05-06", 23, 59))).toBe(true);
    expect(isHoliday(at("2027-05-05", 23, 59))).toBe(false);
    expect(isHoliday(at("2027-05-07", 0, 0))).toBe(false);
  });

  it("computes Easter for other years", () => {
    // Easter Sunday 2025-04-20, 2026-04-05
    expect(isHoliday(at("2025-04-18"))).toBe(true);
    expect(isHoliday(at("2025-04-21"))).toBe(true);
    expect(isHoliday(at("2025-05-29"))).toBe(true);
    expect(isHoliday(at("2025-06-09"))).toBe(true);
    expect(isHoliday(at("2026-04-03"))).toBe(true);
    expect(isHoliday(at("2026-04-06"))).toBe(true);
    expect(isHoliday(at("2026-04-07"))).toBe(false);
  });
});
