import type { Trip } from "./fields";

/** Removes trips whose id was already seen (the same trip imported twice); keeps the first. */
export function dedupeTrips(trips: Trip[]): { trips: Trip[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: Trip[] = [];
  for (const trip of trips) {
    if (seen.has(trip.id)) continue;
    seen.add(trip.id);
    unique.push(trip);
  }
  return { trips: unique, duplicates: trips.length - unique.length };
}
