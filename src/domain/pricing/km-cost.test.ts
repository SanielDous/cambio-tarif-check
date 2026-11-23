import { describe, expect, it } from "vitest";
import { kmCost } from "./km-cost";
import { latestPrices, PRICE_DATA } from "./price-data";

const PRICES = latestPrices(PRICE_DATA);

describe("kmCost", () => {
  const aktivS = (km: number) => kmCost(km, "AKTIV", "S", PRICES, 3);

  it("uses marginal tiers with the surcharge on both (AKTIV S, +3 ct)", () => {
    expect(aktivS(100)).toBe(2800);
    expect(aktivS(101)).toBe(2822);
    expect(aktivS(250)).toBe(6100);
  });

  it("is 0 for 0 km", () => {
    expect(aktivS(0)).toBe(0);
  });

  it("uses the class prices of the tariff", () => {
    expect(kmCost(13, "BASIS", "L", PRICES, 3)).toBe(546);
    expect(kmCost(150, "START", "S", PRICES, 3)).toBe(4850);
  });
});
