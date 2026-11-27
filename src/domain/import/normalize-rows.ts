import { monthKey, parseLocal } from "@/domain/pricing/local-time";
import { parseIsoDate, pricesAt } from "@/domain/pricing/price-data";
import {
  PRICE_CLASSES,
  TARIFF_IDS,
  type LocalMinute,
  type PriceData,
} from "@/domain/pricing/types";
import { cellText, isBlankCell } from "./cells";
import {
  BILLED_STATUSES,
  bookingKey,
  type ColumnMapping,
  type FieldId,
  type RawTable,
  type RowProblem,
  type Trip,
  type UnknownStatus,
} from "./fields";

const KNOWN_BILLED = new Set(BILLED_STATUSES.map((status) => status.toUpperCase()));

/** Whether a status is one of the known statuses of a billed row. */
export const isBilledStatus = (status: string): boolean =>
  KNOWN_BILLED.has(status.trim().toUpperCase());

class RowError extends Error {
  readonly reason: RowProblem["reason"];
  readonly detail: string | undefined;

  constructor(reason: RowProblem["reason"], detail?: string) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

/** Strings are "DD.MM.YYYY HH:MM[:SS]"; Date cells carry the wall clock in their UTC fields. */
function toTime(cell: unknown, field: FieldId): LocalMinute {
  if (cell instanceof Date) {
    const ms = cell.getTime();
    // Seconds are dropped like in the text format; the detour over whole seconds absorbs the
    // float error of date serials (17:14:59.999 is 17:15).
    if (Number.isFinite(ms)) return Math.floor(Math.round(ms / 1000) / 60);
  } else if (typeof cell === "string") {
    const t = parseLocal(cell);
    if (t !== null) return t;
  }
  throw new RowError("invalid-date", field);
}

const NUMBER_FORMATS = [
  /^-?\d+$/,
  /^-?\d+,\d+$/,
  // German thousands points. "1.234" is therefore 1234, never 1.234.
  /^-?\d{1,3}(\.\d{3})+(,\d+)?$/,
  /^-?\d+\.\d{1,2}$/,
];

/** Plain numbers only: malformed text is rejected rather than guessed. Never negative. */
function toNumber(cell: unknown, field: FieldId): number {
  let value: number | undefined;
  if (typeof cell === "number") {
    if (Number.isFinite(cell)) value = cell;
  } else if (typeof cell === "string") {
    const text = cell
      .replace(/^\s*(?:€|EUR)/i, "")
      .replace(/(?:€|EUR)\s*$/i, "")
      .trim();
    if (NUMBER_FORMATS.some((format) => format.test(text))) {
      value = Number(text.replaceAll(".", "").replace(",", "."));
      // Dot decimals ("4.98") must keep their point.
      if (NUMBER_FORMATS[3]?.test(text) && !NUMBER_FORMATS[2]?.test(text)) value = Number(text);
    }
  }
  if (value === undefined) throw new RowError("invalid-number", field);
  if (value < 0) throw new RowError("invalid-number", `${field}: negative value`);
  return value + 0; // turns -0 into 0
}

const toCents = (cell: unknown, field: FieldId): number => Math.round(toNumber(cell, field) * 100);

/** Deterministic 53-bit string hash (cyrb53), base 36. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const text = (cell: unknown): string => cellText(cell).trim();

function toTrip(row: unknown[], mapping: ColumnMapping, data: PriceData): Trip {
  const cell = (field: FieldId): unknown => {
    const index = mapping[field];
    return index === undefined ? undefined : row[index];
  };

  // A known billed status is a billed trip; an unknown or missing one is decided by the amounts
  // alone. Not billed yet either way: no amounts at all.
  const status = text(cell("status"));
  if (isBlankCell(cell("billedTime")) && isBlankCell(cell("billedKm"))) {
    throw new RowError("not-billed");
  }

  const start = toTime(cell("start"), "start");
  const end = toTime(cell("end"), "end");
  const km = toNumber(cell("km"), "km");
  const billedTime = isBlankCell(cell("billedTime"))
    ? 0
    : toCents(cell("billedTime"), "billedTime");
  const billedKm = isBlankCell(cell("billedKm")) ? 0 : toCents(cell("billedKm"), "billedKm");
  // Without a known billed status a trip with km is never free: amounts of 0 stand for an invoice
  // that is still to come. With one it is a genuinely free trip (fully credited, say), kept so
  // that it is listed and flagged rather than silently dropped.
  if (billedTime === 0 && billedKm === 0 && km > 0 && !isBilledStatus(status)) {
    throw new RowError("not-billed");
  }
  if (end < start) throw new RowError("end-before-start");
  if (end < parseIsoDate(data.validFrom)) throw new RowError("before-price-data", data.validFrom);

  const vehicleClass = text(cell("vehicleClass"));
  const token = vehicleClass.split(/\s+/)[0]?.toUpperCase() ?? "";
  const priceClass = PRICE_CLASSES.find((c) => c === token);
  if (priceClass === undefined) throw new RowError("unknown-class", vehicleClass);

  const tariffText = text(cell("tariff")).toUpperCase();
  const tariff = TARIFF_IDS.find((t) => t === tariffText);
  if (tariff === undefined) throw new RowError("unknown-tariff", tariffText);
  // The price list valid at the return prices the trip. A tariff or class that list does not have
  // (START and XL before 2024-05-02) is unknown for the trip.
  const prices = pricesAt(data, end);
  const offered = prices.tariffs[tariff];
  if (!offered) throw new RowError("unknown-tariff", tariff);
  if (!Object.values(prices.tariffs).some((t) => t.prices[priceClass])) {
    throw new RowError("unknown-class", vehicleClass);
  }
  if (!offered.prices[priceClass]) {
    throw new RowError("unknown-class", `${tariff} offers no class ${priceClass}`);
  }

  const trip: Trip = {
    id: hash([start, end, vehicleClass, km, billedTime, billedKm].join("|")),
    city: text(cell("city")),
    vehicleClass,
    priceClass,
    start,
    end,
    km,
    billedTime,
    billedKm,
    tariff,
  };
  // The trip end is optional: an empty or unreadable cell is simply left out.
  const tripEndCell = cell("tripEnd");
  if (!isBlankCell(tripEndCell)) {
    try {
      trip.tripEnd = toTime(tripEndCell, "tripEnd");
    } catch {
      // ignored on purpose
    }
  }
  const driver = text(cell("driver"));
  if (driver !== "") trip.driver = driver;
  if (status !== "") trip.status = status;
  return trip;
}

/** Month key of a row's end, if it can be read. */
function endMonth(row: unknown[], mapping: ColumnMapping): string | undefined {
  const index = mapping.end;
  if (index === undefined) return undefined;
  try {
    return monthKey(toTime(row[index], "end"));
  } catch {
    return undefined;
  }
}

/** `bookingKey` of a row, if its start can be read. */
function rowBookingKey(row: unknown[], mapping: ColumnMapping): string | undefined {
  const index = mapping.start;
  if (index === undefined) return undefined;
  const cell = (field: FieldId) => {
    const i = mapping[field];
    return i === undefined ? "" : text(row[i]);
  };
  try {
    return bookingKey({
      start: toTime(row[index], "start"),
      vehicleClass: cell("vehicleClass"),
      city: cell("city"),
    });
  } catch {
    return undefined;
  }
}

/** Validates the rows of a table into trips; every rejected row becomes a `RowProblem`. */
export function normalizeRows(
  table: RawTable,
  mapping: ColumnMapping,
  data: PriceData,
): { trips: Trip[]; problems: RowProblem[]; unknownStatuses: UnknownStatus[] } {
  const trips: Trip[] = [];
  const problems: RowProblem[] = [];
  // Insertion order: the order in which the values first appear.
  const unknown = new Map<string, number>();
  table.rows.forEach((row, index) => {
    if (row.every(isBlankCell)) return;
    if (mapping.status !== undefined) {
      const status = text(row[mapping.status]);
      if (status !== "" && !isBilledStatus(status)) {
        unknown.set(status, (unknown.get(status) ?? 0) + 1);
      }
    }
    try {
      trips.push(toTrip(row, mapping, data));
    } catch (error) {
      if (!(error instanceof RowError)) throw error;
      const problem: RowProblem = {
        fileName: table.fileName,
        rowNumber: table.rowNumbers[index] ?? index + 2,
        reason: error.reason,
      };
      if (error.detail !== undefined) problem.detail = error.detail;
      if (error.reason === "not-billed") {
        const month = endMonth(row, mapping);
        if (month !== undefined) problem.month = month;
        const key = rowBookingKey(row, mapping);
        if (key !== undefined) problem.bookingKey = key;
      }
      problems.push(problem);
    }
  });
  return {
    trips,
    problems,
    unknownStatuses: [...unknown].map(([value, rows]) => ({ value, rows })),
  };
}
