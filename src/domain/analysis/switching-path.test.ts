import { describe, expect, it } from "vitest";
import { optimalPath } from "./switching-path";

function bruteForce(costs: number[][], fee: number): number {
  const months = costs.length;
  const tariffs = costs[0]?.length ?? 0;
  let best = Infinity;
  const walk = (m: number, prev: number, sum: number) => {
    if (m === months) {
      best = Math.min(best, sum);
      return;
    }
    for (let t = 0; t < tariffs; t++) {
      walk(m + 1, t, sum + (costs[m]?.[t] ?? 0) + (m > 0 && t !== prev ? fee : 0));
    }
  };
  walk(0, -1, 0);
  return best;
}

describe("optimalPath", () => {
  const costs = [
    [10, 0],
    [0, 10],
    [10, 0],
  ];

  it("stays in one tariff when switching is expensive", () => {
    const r = optimalPath(costs, 5);
    expect(r.total).toBe(10);
    expect(new Set(r.path).size).toBe(1);
  });

  it("switches when it pays off", () => {
    expect(optimalPath(costs, 1)).toEqual({ path: [1, 0, 1], total: 2 });
  });

  it("picks the cheapest tariff for a single month", () => {
    expect(optimalPath([[7, 3, 5]], 500)).toEqual({ path: [1], total: 3 });
  });

  it("prefers fewer switches on ties", () => {
    // switching costs 0 here, so all paths tie on cost; zero-cost differences must not switch
    expect(
      optimalPath(
        [
          [1, 1],
          [1, 1],
          [1, 1],
        ],
        0,
      ).path,
    ).toEqual([0, 0, 0]);
  });

  it("equals brute force on random inputs", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 200; i++) {
      const c = Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () => Math.floor(rnd() * 20)),
      );
      const fee = Math.floor(rnd() * 8);
      const r = optimalPath(c, fee);
      expect(r.total).toBe(bruteForce(c, fee));
      const check = r.path.reduce(
        (sum, t, m) => sum + (c[m]?.[t] ?? 0) + (m > 0 && t !== r.path[m - 1] ? fee : 0),
        0,
      );
      expect(check).toBe(r.total);
    }
  });
});
