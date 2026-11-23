import type { LocalMinute, PriceClass, TariffId } from "@/domain/pricing/types";

export interface Trip {
  id: string; // stable hash of start, end, vehicleClass, km, billedTime, billedKm
  city: string;
  vehicleClass: string;
  priceClass: PriceClass;
  start: LocalMinute;
  end: LocalMinute;
  km: number;
  billedTime: number;
  billedKm: number; // integer cents
  tariff: TariffId;
  driver?: string;
  status?: string;
}

export type FieldId =
  | "city"
  | "vehicleClass"
  | "start"
  | "end"
  | "km"
  | "billedTime"
  | "billedKm"
  | "tariff"
  | "driver"
  | "tripStart"
  | "tripEnd"
  | "billedTotal"
  | "status"
  | "invoiceDate";

/** All fields, required ones first. */
export const FIELD_IDS: FieldId[] = [
  "city",
  "vehicleClass",
  "start",
  "end",
  "km",
  "billedTime",
  "billedKm",
  "tariff",
  "driver",
  "tripStart",
  "tripEnd",
  "billedTotal",
  "status",
  "invoiceDate",
];

/** The fields a trip cannot be analysed without (the first eight). */
export const REQUIRED_FIELDS: FieldId[] = FIELD_IDS.slice(0, 8);

/**
 * Accepted header names per field; the first alias is the header of today's portal export.
 * Matching ignores case, diacritics and every character that is not a letter or digit.
 */
export const FIELD_ALIASES: Record<FieldId, string[]> = {
  city: ["Stadt", "Ort", "Standort", "City"],
  vehicleClass: ["Wagenklasse", "Fahrzeugklasse", "Klasse", "Vehicle Class", "Car Class"],
  start: [
    "Buchungsbeginn",
    "Buchungsstart",
    "Beginn der Buchung",
    "Buchung von",
    "Booking Start",
    "Booking Begin",
    "Reservation Start",
  ],
  end: [
    "Buchungsende",
    "Buchungsschluss",
    "Ende der Buchung",
    "Buchung bis",
    "Booking End",
    "Reservation End",
  ],
  km: ["Kilometer", "KM", "Gefahrene Kilometer", "Distanz", "Strecke", "Distance", "Kilometers"],
  billedTime: [
    "Betrag Zeit",
    "Zeitkosten",
    "Zeitbetrag",
    "Betrag Stunden",
    "Kosten Zeit",
    "Amount Time",
    "Time Cost",
    "Time Amount",
  ],
  billedKm: [
    "Betrag Kilometer",
    "Kilometerkosten",
    "Kilometerbetrag",
    "Betrag KM",
    "Kosten Kilometer",
    "Amount Kilometers",
    "Distance Cost",
    "Km Amount",
  ],
  tariff: ["Tarif", "Tarifname", "Tariff"],
  driver: ["fahrende Person", "Fahrer", "Fahrerin", "Fahrer/in", "Person", "Driver"],
  tripStart: ["Fahrtbeginn", "Fahrtstart", "Beginn der Fahrt", "Trip Start", "Drive Start"],
  tripEnd: ["Fahrtende", "Ende der Fahrt", "Trip End", "Drive End"],
  billedTotal: [
    "Betrag Gesamt",
    "Gesamtbetrag",
    "Betrag",
    "Summe",
    "Gesamtkosten",
    "Total Amount",
    "Total",
    "Amount Total",
  ],
  status: ["Verarbeitungsstatus", "Status", "Abrechnungsstatus", "Processing Status"],
  invoiceDate: ["Rechnungsdatum", "Datum der Rechnung", "Rechnung vom", "Invoice Date"],
};

export interface RawTable {
  fileName: string;
  headers: string[];
  rows: unknown[][];
  /** 1-based row number in the file as seen in an editor, parallel to `rows`. */
  rowNumbers: number[];
}

/** Column index per field. */
export type ColumnMapping = Partial<Record<FieldId, number>>;

export interface Detection {
  mapping: ColumnMapping;
  /** Required fields without a matching column. */
  missing: FieldId[];
  /** Fields for which two or more columns qualify equally; they are not in `mapping`. */
  ambiguous: FieldId[];
}

export type RowProblem = {
  fileName: string;
  /** 1-based row number in the file as seen in a spreadsheet or editor. */
  rowNumber: number;
  reason:
    | "invalid-date"
    | "invalid-number"
    | "end-before-start"
    | "unknown-tariff"
    | "unknown-class"
    | "before-price-data"
    | "not-billed";
  detail?: string;
  /** Month key ("YYYY-MM") of the row's end; set for "not-billed" rows whose end is readable. */
  month?: string;
};

export class ImportError extends Error {
  readonly code: "empty" | "unsupported" | "unreadable" | "too-large";

  constructor(code: ImportError["code"], message?: string) {
    super(message ?? code);
    this.name = "ImportError";
    this.code = code;
  }
}
