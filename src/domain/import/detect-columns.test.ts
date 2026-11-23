import { describe, expect, it } from "vitest";
import { FIELD_ALIASES, FIELD_IDS, REQUIRED_FIELDS, type FieldId } from "./fields";
import { detectColumns } from "./detect-columns";

const TODAY = [
  "Datum",
  "fahrende Person",
  "Buchungsobjekt",
  "Kennzeichen",
  "Stadt",
  "Station",
  "Wagenklasse",
  "Buchungsbeginn",
  "Buchungsende",
  "Fahrtbeginn",
  "Fahrtende",
  "Kilometer",
  "CO² Emission der Fahrt in Gramm",
  "Kraftstoffart",
  "CO² Emission Fahrzeug in g/km",
  "Betrag Zeit",
  "Betrag Kilometer",
  "Betrag Gesamt",
  "Währung",
  "Mehrwertsteuer",
  "Tarif",
  "Rechnungsdatum",
  "Rechnungnummer",
  "Verarbeitungsstatus",
  "Kommentar",
  "KommentarKundenService",
  "Abteilung",
  "Kostenstelle",
];

describe("detectColumns", () => {
  it("finds all 14 fields in today's 28 headers", () => {
    expect(TODAY).toHaveLength(28);
    const { mapping, missing, ambiguous } = detectColumns(TODAY);
    expect(Object.keys(mapping)).toHaveLength(14);
    expect(missing).toEqual([]);
    expect(ambiguous).toEqual([]);
    for (const id of FIELD_IDS) {
      expect(TODAY[mapping[id] as number]).toBe(FIELD_ALIASES[id][0]);
    }
  });

  it("requires exactly the first eight fields", () => {
    expect(REQUIRED_FIELDS).toEqual([
      "city",
      "vehicleClass",
      "start",
      "end",
      "km",
      "billedTime",
      "billedKm",
      "tariff",
    ]);
  });

  it("is independent of the column order", () => {
    const shuffled = [...TODAY].reverse();
    shuffled.push(...shuffled.splice(3, 9));
    const { mapping, missing } = detectColumns(shuffled);
    expect(missing).toEqual([]);
    for (const id of FIELD_IDS) {
      expect(shuffled[mapping[id] as number]).toBe(FIELD_ALIASES[id][0]);
    }
  });

  it("accepts header variants through aliases and similarity", () => {
    const headers = [
      "Stadt",
      "Wagen-Klasse",
      "Buchungsstart",
      "Buchungs-Ende",
      "KM",
      "Zeitkosten",
      "Kilometerkosten",
      "TARIF",
    ];
    const { mapping, missing } = detectColumns(headers);
    expect(missing).toEqual([]);
    expect(Object.values(mapping).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(mapping.end).toBe(3);
    expect(mapping.billedKm).toBe(6);
  });

  it("ignores case, diacritics and punctuation, and tolerates a small typo", () => {
    const { mapping, missing } = detectColumns([
      " stadt ",
      "WAGENKLASSE",
      "Buchungsbeginn",
      "Buchungsende",
      "Kilometer",
      "Betrag  Zeit",
      "Betrag Kilometr",
      "Tarif",
    ]);
    expect(missing).toEqual([]);
    expect(mapping.billedKm).toBe(6);
  });

  it("reports a missing required field", () => {
    const without = TODAY.filter((h) => h !== "Tarif");
    const { mapping, missing } = detectColumns(without);
    expect(missing).toEqual(["tariff"]);
    expect(mapping.tariff).toBeUndefined();
  });

  it("does not list missing optional fields", () => {
    const { missing } = detectColumns([
      "Stadt",
      "Wagenklasse",
      "Buchungsbeginn",
      "Buchungsende",
      "Kilometer",
      "Betrag Zeit",
      "Betrag Kilometer",
      "Tarif",
    ]);
    expect(missing).toEqual([]);
  });

  it("flags two equally good columns as ambiguous", () => {
    const headers = [...TODAY, "Kilometer"];
    const { mapping, missing, ambiguous } = detectColumns(headers);
    expect(ambiguous).toEqual<FieldId[]>(["km"]);
    expect(mapping.km).toBeUndefined();
    expect(missing).toEqual([]);
  });

  it("uses a column for one field only", () => {
    const { mapping } = detectColumns(["Buchungsbeginn", "Buchungsbeginn "]);
    expect(mapping.start).toBeUndefined();
    const values = Object.values(detectColumns(TODAY).mapping);
    expect(new Set(values).size).toBe(values.length);
  });

  it("returns everything missing for unrelated headers", () => {
    const { mapping, missing } = detectColumns(["foo", "bar"]);
    expect(mapping).toEqual({});
    expect(missing).toEqual(REQUIRED_FIELDS);
  });
});

describe("detectColumns with ambiguous columns", () => {
  it("does not hand a column of an ambiguous field to another field", () => {
    const { mapping, ambiguous } = detectColumns([...TODAY, "Kilometer"]);
    expect(ambiguous).toEqual(["km"]);
    const kmColumns = [11, TODAY.length];
    expect(Object.values(mapping).filter((c) => kmColumns.includes(c))).toEqual([]);
  });
});
