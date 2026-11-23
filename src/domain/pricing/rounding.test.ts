import { describe, expect, it } from "vitest";
import { roundCalculator, roundHalfUp } from "./rounding";

describe("roundHalfUp", () => {
  it("rounds halves up", () => {
    expect(roundHalfUp(52.5)).toBe(53);
    expect(roundHalfUp(157.5)).toBe(158);
    expect(roundHalfUp(262.5)).toBe(263);
    expect(roundHalfUp(52.49)).toBe(52);
    expect(roundHalfUp(0)).toBe(0);
  });

  it("is robust against float noise", () => {
    expect(roundHalfUp(1.005 * 100)).toBe(101);
    expect(roundHalfUp(4.725 * 100)).toBe(473);
    expect(roundHalfUp(0.1 * 3 * 100)).toBe(30);
  });
});

describe("roundCalculator", () => {
  it("decides exact half cents by the single-precision value of the euro amount", () => {
    // Recorded: AKTIV S 15 min 0.52, 75 min 2.63, 7 min 0.25; BASIS S 15 min 0.82; CAMPUS S 30 min 1.38
    expect(roundCalculator(52.5)).toBe(52);
    expect(roundCalculator(262.5)).toBe(263);
    expect(roundCalculator(24.5)).toBe(25);
    expect(roundCalculator(82.5)).toBe(82);
    expect(roundCalculator(137.5)).toBe(138);
  });

  it("rounds everything else to the nearest cent", () => {
    expect(roundCalculator(210)).toBe(210);
    expect(roundCalculator(416.25)).toBe(416);
    expect(roundCalculator(58.75)).toBe(59);
    expect(roundCalculator(2310 / 60 + 0.1)).toBe(39);
    expect(roundCalculator(0)).toBe(0);
  });
});
