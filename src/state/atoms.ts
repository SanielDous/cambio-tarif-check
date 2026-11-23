import { atom } from "jotai";
import { analyze, type Analysis, type Settings } from "@/domain/analysis/analyze";
import { dedupeTrips } from "@/domain/import/dedupe";
import { detectColumns } from "@/domain/import/detect-columns";
import {
  ImportError,
  type ColumnMapping,
  type Detection,
  type RawTable,
  type RowProblem,
  type Trip,
} from "@/domain/import/fields";
import { normalizeRows } from "@/domain/import/normalize-rows";
import { readTable } from "@/domain/import/read-table";
import { PRICE_DATA } from "@/domain/pricing/price-data";

export interface FileReport {
  fileName: string;
  /** Trips read from the file, before duplicates were removed. */
  tripCount: number;
  problems: RowProblem[];
  error?: ImportError["code"];
  /** The user cancelled the column mapping; nothing was read. */
  skipped?: boolean;
}

export interface ImportReport {
  files: FileReport[];
  /** Trips dropped because the same trip was already imported. */
  duplicates: number;
}

export interface PendingMapping {
  table: RawTable;
  detection: Detection;
}

export const DEFAULT_SETTINGS: Settings = {
  additionalDrivers: 0,
  under26: false,
  period: null,
  manualBookedEnds: {},
  actualTariffOverrides: {},
};

const EMPTY_REPORT: ImportReport = { files: [], duplicates: 0 };

/** All imported trips of all files, deduplicated. Held in memory only. */
export const tripsAtom = atom<Trip[]>([]);
export const importReportAtom = atom<ImportReport>(EMPTY_REPORT);
export const settingsAtom = atom<Settings>(DEFAULT_SETTINGS);
/** Files whose columns could not be detected; the mapping dialog works off the first one. */
export const pendingMappingsAtom = atom<PendingMapping[]>([]);
/** Number of files currently being read. */
export const importBusyAtom = atom(0);
/** Number of additional drivers set automatically on the first import, 0 if none. */
export const autoDriversAtom = atom(0);

export const analysisAtom = atom<Analysis | null>((get) => {
  const trips = get(tripsAtom);
  return trips.length === 0 ? null : analyze(trips, get(settingsAtom), PRICE_DATA);
});

/** Merges new trips and a file report into the state. */
const addResultAtom = atom(null, (get, set, result: { trips: Trip[]; report: FileReport }) => {
  const before = get(tripsAtom);
  const merged = dedupeTrips([...before, ...result.trips]);
  set(tripsAtom, merged.trips);
  const report = get(importReportAtom);
  set(importReportAtom, {
    files: [...report.files, result.report],
    duplicates: report.duplicates + merged.duplicates,
  });
  if (before.length === 0 && merged.trips.length > 0) {
    // First trips of this session: take over the number of other drivers found in the export.
    const settings = get(settingsAtom);
    const suggested = analyze(merged.trips, settings, PRICE_DATA)?.suggestedAdditionalDrivers ?? 0;
    set(settingsAtom, { ...settings, additionalDrivers: suggested });
    set(autoDriversAtom, suggested);
  }
});

const addErrorAtom = atom(null, (get, set, fileName: string, error: ImportError["code"]) => {
  const report = get(importReportAtom);
  set(importReportAtom, {
    ...report,
    files: [...report.files, { fileName, tripCount: 0, problems: [], error }],
  });
});

/** Reads the given files; each one either becomes trips, an error entry or a pending mapping. */
export const importFilesAtom = atom(null, async (get, set, files: File[]) => {
  set(importBusyAtom, (n) => n + files.length);
  for (const file of files) {
    try {
      const table = await readTable(file);
      const detection = detectColumns(table.headers);
      if (detection.missing.length === 0 && detection.ambiguous.length === 0) {
        const { trips, problems } = normalizeRows(table, detection.mapping, PRICE_DATA);
        set(addResultAtom, {
          trips,
          report: { fileName: file.name, tripCount: trips.length, problems },
        });
      } else {
        set(pendingMappingsAtom, [...get(pendingMappingsAtom), { table, detection }]);
      }
    } catch (error) {
      set(addErrorAtom, file.name, error instanceof ImportError ? error.code : "unreadable");
    } finally {
      set(importBusyAtom, (n) => n - 1);
    }
  }
});

/** Applies the user's column mapping to the first pending file. */
export const confirmMappingAtom = atom(null, (get, set, mapping: ColumnMapping) => {
  const [pending, ...rest] = get(pendingMappingsAtom);
  if (!pending) return;
  set(pendingMappingsAtom, rest);
  const { trips, problems } = normalizeRows(pending.table, mapping, PRICE_DATA);
  set(addResultAtom, {
    trips,
    report: { fileName: pending.table.fileName, tripCount: trips.length, problems },
  });
});

/** Drops the first pending file and records it as skipped. */
export const cancelMappingAtom = atom(null, (get, set) => {
  const [pending, ...rest] = get(pendingMappingsAtom);
  if (!pending) return;
  set(pendingMappingsAtom, rest);
  const report = get(importReportAtom);
  set(importReportAtom, {
    ...report,
    files: [
      ...report.files,
      { fileName: pending.table.fileName, tripCount: 0, problems: [], skipped: true },
    ],
  });
});

/** Clears trips, report and settings. */
export const resetAtom = atom(null, (_get, set) => {
  set(tripsAtom, []);
  set(importReportAtom, EMPTY_REPORT);
  set(settingsAtom, DEFAULT_SETTINGS);
  set(pendingMappingsAtom, []);
  set(autoDriversAtom, 0);
});
