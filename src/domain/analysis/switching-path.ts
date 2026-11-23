/**
 * Exact minimum over all month-by-month tariff sequences (dynamic programming). `costs[m][t]` is
 * the cost of month m in tariff t; every change between consecutive months adds `switchFee`, the
 * first month is free to choose. On equal cost the path with fewer switches wins. `switchFee` is
 * one fee for all months, or one per month: `switchFee[m]` for a change into month m.
 */
export function optimalPath(
  costs: number[][],
  switchFee: number | readonly number[],
): { path: number[]; total: number } {
  const feeOf = (m: number) => (typeof switchFee === "number" ? switchFee : (switchFee[m] ?? 0));
  const months = costs.length;
  const tariffs = costs[0]?.length ?? 0;
  if (months === 0 || tariffs === 0) return { path: [], total: 0 };

  interface Cell {
    cost: number;
    switches: number;
    prev: number;
  }
  const better = (a: Cell, b: Cell | undefined) =>
    b === undefined || a.cost < b.cost || (a.cost === b.cost && a.switches < b.switches);

  let layer: Cell[] = (costs[0] ?? []).map((cost) => ({ cost, switches: 0, prev: -1 }));
  const history: Cell[][] = [layer];
  for (let m = 1; m < months; m++) {
    const row = costs[m] ?? [];
    const fee = feeOf(m);
    const next: Cell[] = [];
    for (let t = 0; t < tariffs; t++) {
      let best: Cell | undefined;
      layer.forEach((from, p) => {
        const change = p !== t;
        const cand: Cell = {
          cost: from.cost + (row[t] ?? 0) + (change ? fee : 0),
          switches: from.switches + (change ? 1 : 0),
          prev: p,
        };
        if (better(cand, best)) best = cand;
      });
      next.push(best as Cell);
    }
    layer = next;
    history.push(layer);
  }

  let end = 0;
  layer.forEach((cell, t) => {
    if (better(cell, layer[end]) && t !== end) end = t;
  });
  const total = layer[end]?.cost ?? 0;
  const path = new Array<number>(months);
  let t = end;
  for (let m = months - 1; m >= 0; m--) {
    path[m] = t;
    t = history[m]?.[t]?.prev ?? -1;
  }
  return { path, total };
}
