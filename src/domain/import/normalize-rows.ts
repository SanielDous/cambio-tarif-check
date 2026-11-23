import { parseLocal, toLocalMinute } from "@/domain/pricing/local-time";
import type { LocalMinute, PriceClass, PriceData, TariffId } from "@/domain/pricing/types";
import type { ColumnMapping, FieldId, RawTable, RowProblem, Trip } from "./fields";

const PRICE_CLASSES: PriceClass[] = ["XS", "S", "M", "L", "XL"];
const TARIFFS: TariffId[] = ["CAMPUS", "BASIS", "START", "AKTIV", "COMFORT"];

class RowError extends Error {
  readonly reason: RowProblem["reason"];
  readonly detail: string | undefined;

  constructor(reason: RowProblem["reason"], detail?: string) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

const isEmpty = (cell: unknown): boolean =>
  cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");

/** Strings are "DD.MM.YYYY HH:MM[:SS]"; Date cells carry the wall clock in their UTC fields. */
function toTime(cell: unknown, field: FieldId): LocalMinute {
  if (cell instanceof Date) {
    const ms = cell.getTime();
    // Whole minutes since the epoch in UTC are the naive local minutes (rounded: serials are floats).
    if (Number.isFinite(ms)) return Math.round(ms / 60_000);
  } else if (typeof cell === "string") {
    const t = parseLocal(cell);
    if (t !== null) return t;
  }
  throw new RowError("invalid-date", field);
}

/** Numbers as text may use a decimal comma and thousands points. */
function toNumber(cell: unknown, field: FieldId): number {
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  if (typeof cell === "string") {
    const text = cell.replace(/\s|€/g, "");
    let normalized = text;
    if (text.includes(",")) normalized = text.replaceAll(".", "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) normalized = text.replaceAll(".", "");
    if (/^-?(\d+\.?\d*|\.\d+)$/.test(normalized)) return Number(normalized);
  }
  throw new RowError("invalid-number", field);
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

const text = (cell: unknown): string => (isEmpty(cell) ? "" : String(cell).trim());

function toTrip(row: unknown[], mapping: ColumnMapping, data: PriceData): Trip {
  const cell = (field: FieldId): unknown => {
    const index = mapping[field];
    return index === undefined ? undefined : row[index];
  };

  if (isEmpty(cell("billedTime")) && isEmpty(cell("billedKm"))) throw new RowError("not-billed");

  const start = toTime(cell("start"), "start");
  const end = toTime(cell("end"), "end");
  const km = toNumber(cell("km"), "km");
  const billedTime = isEmpty(cell("billedTime")) ? 0 : toCents(cell("billedTime"), "billedTime");
  const billedKm = isEmpty(cell("billedKm")) ? 0 : toCents(cell("billedKm"), "billedKm");
  if (end < start) throw new RowError("end-before-start");
  const [y, m, d] = data.validFrom.split("-").map(Number) as [number, number, number];
  if (end < toLocalMinute(y, m, d)) throw new RowError("before-price-data", data.validFrom);

  const vehicleClass = text(cell("vehicleClass"));
  const token = vehicleClass.split(/\s+/)[0]?.toUpperCase() ?? "";
  const priceClass = PRICE_CLASSES.find((c) => c === token);
  if (priceClass === undefined) throw new RowError("unknown-class", vehicleClass);

  const tariffText = text(cell("tariff")).toUpperCase();
  const tariff = TARIFFS.find((t) => t === tariffText);
  if (tariff === undefined) throw new RowError("unknown-tariff", tariffText);
  if (!data.tariffs[tariff].prices[priceClass]) {
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
  const driver = text(cell("driver"));
  if (driver !== "") trip.driver = driver;
  const status = text(cell("status"));
  if (status !== "") trip.status = status;
  return trip;
}

/** Validates the rows of a table into trips; every rejected row becomes a `RowProblem`. */
export function normalizeRows(
  table: RawTable,
  mapping: ColumnMapping,
  data: PriceData,
): { trips: Trip[]; problems: RowProblem[] } {
  const trips: Trip[] = [];
  const problems: RowProblem[] = [];
  // Row numbers count the header as row 1.
  table.rows.forEach((row, index) => {
    if (row.every(isEmpty)) return;
    try {
      trips.push(toTrip(row, mapping, data));
    } catch (error) {
      if (!(error instanceof RowError)) throw error;
      const problem: RowProblem = {
        fileName: table.fileName,
        rowNumber: index + 2,
        reason: error.reason,
      };
      if (error.detail !== undefined) problem.detail = error.detail;
      problems.push(problem);
    }
  });
  return { trips, problems };
}
