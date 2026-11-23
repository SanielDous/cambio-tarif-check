import { describe, expect, it } from "vitest";
import { toLocalMinute } from "@/domain/pricing/local-time";
import { parseBookedEnd, toDateValue } from "./booked-end";

const min = toLocalMinute(2025, 2, 27, 20, 0);
const max = toLocalMinute(2025, 3, 28, 10, 0);

describe("parseBookedEnd", () => {
  it("accepts a date and time within the range", () => {
    expect(parseBookedEnd("2025-02-28", 9 * 60 + 15, min, max)).toEqual({
      ok: true,
      value: toLocalMinute(2025, 2, 28, 9, 15),
    });
    expect(parseBookedEnd("2025-02-27", 20 * 60, min, max)).toEqual({ ok: true, value: min });
    expect(parseBookedEnd("2025-03-28", 10 * 60, min, max)).toEqual({ ok: true, value: max });
  });

  it("rejects impossible and malformed dates", () => {
    expect(parseBookedEnd("2025-02-31", 600, min, max)).toEqual({ ok: false, error: "invalid" });
    expect(parseBookedEnd("2025-02-29", 600, min, max)).toEqual({ ok: false, error: "invalid" });
    expect(parseBookedEnd("2025-13-01", 600, min, max)).toEqual({ ok: false, error: "invalid" });
    expect(parseBookedEnd("", 600, min, max)).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects values before the minimum and after the maximum", () => {
    expect(parseBookedEnd("2025-02-27", 19 * 60 + 45, min, max)).toEqual({
      ok: false,
      error: "tooEarly",
    });
    expect(parseBookedEnd("2025-03-28", 10 * 60 + 15, min, max)).toEqual({
      ok: false,
      error: "tooLate",
    });
  });

  it("formats the date input value", () => {
    expect(toDateValue(toLocalMinute(2025, 3, 5, 23, 59))).toBe("2025-03-05");
  });
});
