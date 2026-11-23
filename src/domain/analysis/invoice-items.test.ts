import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns } from "@/domain/import/detect-columns";
import type { Trip } from "@/domain/import/fields";
import { normalizeRows } from "@/domain/import/normalize-rows";
import { readTable } from "@/domain/import/read-table";
import { parseLocal } from "@/domain/pricing/local-time";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import { roundHalfUp } from "@/domain/pricing/rounding";
import { overrunCost, timeCost } from "@/domain/pricing/time-cost";
import type { LocalMinute } from "@/domain/pricing/types";
import { reconstructBooking, type Reconstruction, unusedTimeCost } from "./reconstruct-booking";
import { tripCostInTariff } from "./trip-cost";

/**
 * The invoice line items of the 85 fixture trips (`tests/fixtures/invoice-items.json`), checked
 * against the reconstruction from the export alone. The invoice shows what the export lacks: the
 * booked end and how the time amount splits into items.
 */

type ItemKind = "full" | "cancelled" | "overrun" | "late";

interface InvoiceTrip {
  /** `DD.MM.YYYY HH:mm`, the export's "Buchungsbeginn". */
  bookingStart: string;
  tariff: string;
  priceClass: string;
  timeItems: { kind: ItemKind; start: string; end: string; gross: number }[];
  km: number;
  kmGross: number;
}

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");

async function readTrips(name: string): Promise<Trip[]> {
  const file = new File([readFileSync(resolve(FIXTURES, name))], name);
  const table = await readTable(file);
  const { trips, problems } = normalizeRows(
    table,
    detectColumns(table.headers).mapping,
    PRICE_DATA,
  );
  if (problems.length > 0) throw new Error(`Problems in ${name}: ${JSON.stringify(problems)}`);
  return trips;
}

const trips = [...(await readTrips("trips-2025.csv")), ...(await readTrips("trips-2026.csv"))];
const invoices = JSON.parse(
  readFileSync(resolve(FIXTURES, "invoice-items.json"), "utf8"),
) as InvoiceTrip[];

const minute = (text: string): LocalMinute => {
  const t = parseLocal(text);
  if (t === null) throw new Error(`Bad time ${text}`);
  return t;
};

interface Case {
  trip: Trip;
  invoice: InvoiceTrip;
  r: Reconstruction;
  item: (kind: ItemKind) => { start: LocalMinute; end: LocalMinute; gross: number } | undefined;
}

const cases: Case[] = trips.map((trip) => {
  const matching = invoices.filter((i) => minute(i.bookingStart) === trip.start);
  if (matching.length !== 1) throw new Error(`${matching.length} invoices for trip ${trip.id}`);
  const invoice = matching[0]!;
  return {
    trip,
    invoice,
    r: reconstructBooking(trip, PRICE_DATA),
    item: (kind) => {
      const found = invoice.timeItems.find((i) => i.kind === kind);
      return found && { start: minute(found.start), end: minute(found.end), gross: found.gross };
    },
  };
});

const has = (c: Case, kind: ItemKind) => c.item(kind) !== undefined;
const label = ({ trip, invoice }: Case) =>
  `${invoice.bookingStart} ${trip.tariff} ${trip.priceClass}`;

/**
 * Whether the invoice charges the full price up to the model's charged-until (the export's
 * return rounded up to the quarter hour). A return a few minutes late (`late` item) is billed as a
 * booking up to the end of that item, which the model sees as its charged-until.
 */
const chargedAsInModel = ({ r, item }: Case) => {
  const full = item("full");
  return full === undefined || (item("late") ?? full).end === r.chargedUntil;
};

/** The model's amount for each invoice item of a trip, in integer cents. */
function modelItems({ trip, r }: Case): Partial<Record<ItemKind, number>> {
  const { tariff, priceClass: cls, city } = trip;
  const used = timeCost(trip.start, r.chargedUntil, tariff, cls, PRICE_DATA, city);
  if (r.kind === "cancelled") return { cancelled: roundHalfUp(0.5 * used) };
  const items: Partial<Record<ItemKind, number>> = {
    full: roundHalfUp(used),
    cancelled: unusedTimeCost(r.chargedUntil, r.bookedEnd, tariff, cls, PRICE_DATA, city),
  };
  if (r.overrunMinutes > 0) {
    const returned = r.bookedEnd + r.overrunMinutes;
    items.overrun = roundHalfUp(overrunCost(r.bookedEnd, returned, tariff, cls, PRICE_DATA, city));
  }
  return items;
}

describe("invoice line items of the fixture trips", () => {
  it("has one invoice per trip, with the trip's tariff, class, km and time amount", () => {
    expect(cases).toHaveLength(85);
    expect(invoices).toHaveLength(85);
    for (const { trip, invoice } of cases) {
      expect([invoice.tariff, invoice.priceClass, invoice.km]).toEqual([
        trip.tariff,
        trip.priceClass,
        trip.km,
      ]);
      expect(invoice.timeItems.reduce((sum, i) => sum + i.gross, 0)).toBe(trip.billedTime);
    }
  });

  it("matches every time item within 1 cent where the full price ends as in the model", () => {
    const stats = { exact: 0, oneCent: 0, offElsewhere: 0, off: [] as string[] };
    for (const c of cases) {
      const model = modelItems(c);
      // A return a few minutes late is billed as a "late" item to the next quarter hour at the
      // regular price; the model sees a normal booking up to there, so it gets the sum.
      const late = c.item("late");
      const items = c.invoice.timeItems
        .filter((i) => i.kind !== "late")
        .map((i) => ({
          kind: i.kind,
          gross: i.gross + (i.kind === "full" && late ? late.gross : 0),
        }));
      for (const { kind, gross } of items) {
        const diff = Math.abs((model[kind] ?? 0) - gross);
        if (diff === 0) stats.exact++;
        else if (diff === 1) stats.oneCent++;
        else if (chargedAsInModel(c)) {
          stats.off.push(`${label(c)} ${kind}: model ${model[kind]}, invoice ${gross}`);
        } else stats.offElsewhere++;
      }
      // No item the invoice lacks: the model's other items are 0.
      for (const [kind, amount] of Object.entries(model)) {
        if (!items.some((i) => i.kind === kind)) expect(amount, `${label(c)} ${kind}`).toBe(0);
      }
    }
    console.info(
      `Invoice time items: ${stats.exact} exact, ${stats.oneCent} within 1 cent, ` +
        `${stats.offElsewhere} off (all of the trip charged past its export end)`,
    );
    expect(stats.off).toEqual([]);
    expect([stats.exact, stats.oneCent, stats.offElsewhere]).toEqual([119, 8, 2]);
  });

  /*
   * The model charges the full price up to the export's return rounded up to the quarter hour.
   * One invoice charges a quarter hour more: the export says 18:45, the invoice charges the full
   * price until 19:00 (presumably a return a few seconds after 18:45; the export drops seconds).
   * Four other trips with an export end on a quarter hour were charged exactly up to it, and
   * both readings explain that trip's amount within 1 cent, so the export alone cannot tell
   * them apart. These tests find such trips by that rule, not by name, and report them.
   */
  it("charges the full price up to the invoiced end of the full item, but for one trip", () => {
    const past = cases.filter((c) => !chargedAsInModel(c));
    expect(past).toHaveLength(1);
    for (const c of past) {
      expect(c.trip.end % 15).toBe(0);
      expect(c.item("full")!.end).toBe(c.r.chargedUntil + 15);
      console.info(`Charged past the export's quarter-hour end: ${label(c)}`);
    }
  });

  it("reconstructs the invoiced booked end of every trip returned on time and charged as modelled", () => {
    const onTime = cases.filter((c) => !has(c, "late") && !has(c, "overrun"));
    expect(onTime).toHaveLength(83);
    const agree = onTime.filter(
      ({ r, item }) => r.bookedEnd === (item("cancelled") ?? item("full"))!.end,
    );
    console.info(`Booked end as invoiced: ${agree.length} of ${onTime.length} trips`);
    expect(onTime.filter((c) => !agree.includes(c))).toEqual(
      onTime.filter((c) => !chargedAsInModel(c)),
    );
    expect(agree).toHaveLength(82);
  });

  it("finds the invoiced booked end from the invoiced charged-until where the two differ", () => {
    for (const c of cases.filter((c) => !chargedAsInModel(c))) {
      const chargedUntil = c.item("full")!.end;
      const r = reconstructBooking({ ...c.trip, end: chargedUntil }, PRICE_DATA);
      expect(r.chargedUntil).toBe(chargedUntil);
      expect(r.bookedEnd).toBe((c.item("cancelled") ?? c.item("full"))!.end);
    }
  });

  it("reads a return a few minutes late as a normal booking up to the end of the late item", () => {
    const late = cases.filter((c) => has(c, "late"));
    expect(late.map(label)).toEqual(["11.12.2025 09:15 AKTIV S"]);
    const { r, trip, item } = late[0]!;
    const end = item("late")!.end;
    expect(r.kind).toMatch(/^verified/);
    expect([r.chargedUntil, r.bookedEnd, r.overrunMinutes]).toEqual([end, end, 0]);
    expect(Math.abs(r.timeDeviation)).toBeLessThanOrEqual(1);
    const model = timeCost(trip.start, end, trip.tariff, trip.priceClass, PRICE_DATA, trip.city);
    expect(Math.abs(roundHalfUp(model) - (item("full")!.gross + item("late")!.gross))).toBe(0);
  });

  it("reconstructs the overrun: booked end and minutes as invoiced", () => {
    const overrun = cases.filter((c) => has(c, "overrun"));
    expect(overrun.map(label)).toEqual(["09.05.2025 15:00 AKTIV S"]);
    const { r, item } = overrun[0]!;
    const invoiced = item("overrun")!;
    expect(r.kind).toBe("overrun");
    expect(r.bookedEnd).toBe(invoiced.start);
    expect(r.overrunMinutes).toBe(invoiced.end - invoiced.start);
  });

  it("classifies the whole-booking cancellation and the unused booking", () => {
    const cancelledOnly = cases.filter((c) =>
      c.invoice.timeItems.every((i) => i.kind === "cancelled"),
    );
    expect(cancelledOnly.map(({ r }) => r.kind)).toEqual(["cancelled"]);
    const unused = cases.filter(
      (c) => c.trip.km === 0 && c.invoice.timeItems.every((i) => i.kind === "full"),
    );
    expect(unused.map(({ r }) => r.kind)).toEqual(["unused"]);
  });

  it("reproduces every invoiced km amount", () => {
    const wrong = cases
      .filter(({ trip, r, invoice }) => {
        const cost = tripCostInTariff(trip, r, trip.tariff, PRICE_DATA);
        return cost?.km !== invoice.kmGross;
      })
      .map(label);
    expect(wrong).toEqual([]);
  });
});
