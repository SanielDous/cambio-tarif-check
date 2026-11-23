import { atom } from "jotai";
import {
  analyze,
  countAdditionalDrivers,
  type Analysis,
  type Settings,
} from "@/domain/analysis/analyze";
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
  /** Unique per imported file, also for files with the same name. */
  id: number;
  fileName: string;
  /** Trips read from the file, before duplicates were removed. */
  tripCount: number;
  /** Data rows below the header (blank rows not counted); 0 for a file with only a header. */
  rowCount: number;
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
  id: number;
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

let nextFileId = 0;

const EMPTY_REPORT: ImportReport = { files: [], duplicates: 0 };

/** All imported trips of all files, deduplicated. Held in memory only. */
export const tripsAtom = atom<Trip[]>([]);
export const importReportAtom = atom<ImportReport>(EMPTY_REPORT);
export const settingsAtom = atom<Settings>(DEFAULT_SETTINGS);
/** Files whose columns could not be detected; the mapping dialog works off the first one. */
export const pendingMappingsAtom = atom<PendingMapping[]>([]);
/** Bumped by a reset; results of reads started before it are dropped. */
const generationAtom = atom(0);
/** Number of files currently being read. */
export const importBusyAtom = atom(0);
/** Number of additional drivers suggested by the last import, 0 if none. */
export const autoDriversAtom = atom(0);
/** The user set the number of additional drivers by hand; imports no longer change it. */
const driversSetByHandAtom = atom(false);

/** Sets the number of additional drivers by hand. */
export const setAdditionalDriversAtom = atom(null, (get, set, value: number) => {
  set(settingsAtom, { ...get(settingsAtom), additionalDrivers: value });
  set(driversSetByHandAtom, true);
});

/** Months of rows that are not billed yet, over all imported files. */
const unbilledMonthsAtom = atom((get) =>
  get(importReportAtom).files.flatMap((file) =>
    file.problems.flatMap((problem) =>
      problem.reason === "not-billed" && problem.month !== undefined ? [problem.month] : [],
    ),
  ),
);

export const analysisAtom = atom<Analysis | null>((get) => {
  const trips = get(tripsAtom);
  if (trips.length === 0) return null;
  return analyze(trips, get(settingsAtom), PRICE_DATA, {
    unbilledMonths: get(unbilledMonthsAtom),
  });
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
  if (!get(driversSetByHandAtom) && merged.trips.length > 0) {
    // Take over the number of other drivers found in all trips, until the user sets it.
    const suggested = countAdditionalDrivers(merged.trips);
    set(settingsAtom, { ...get(settingsAtom), additionalDrivers: suggested });
    set(autoDriversAtom, suggested);
  }
});

const addErrorAtom = atom(
  null,
  (get, set, file: { id: number; fileName: string }, error: ImportError["code"]) => {
    const report = get(importReportAtom);
    set(importReportAtom, {
      ...report,
      files: [...report.files, { ...file, tripCount: 0, rowCount: 0, problems: [], error }],
    });
  },
);

/** Reads the given files; each one either becomes trips, an error entry or a pending mapping. */
export const importFilesAtom = atom(null, async (get, set, files: File[]) => {
  set(importBusyAtom, (n) => n + files.length);
  const generation = get(generationAtom);
  for (const file of files) {
    const id = nextFileId++;
    try {
      const table = await readTable(file);
      if (get(generationAtom) !== generation) continue; // reset while reading
      const detection = detectColumns(table.headers);
      if (detection.missing.length === 0 && detection.ambiguous.length === 0) {
        const { trips, problems } = normalizeRows(table, detection.mapping, PRICE_DATA);
        set(addResultAtom, {
          trips,
          report: {
            id,
            fileName: file.name,
            tripCount: trips.length,
            rowCount: table.rows.length,
            problems,
          },
        });
      } else {
        set(pendingMappingsAtom, [...get(pendingMappingsAtom), { id, table, detection }]);
      }
    } catch (error) {
      if (get(generationAtom) !== generation) continue;
      set(
        addErrorAtom,
        { id, fileName: file.name },
        error instanceof ImportError ? error.code : "unreadable",
      );
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
  const { id } = pending;
  const fileName = pending.table.fileName;
  try {
    const { trips, problems } = normalizeRows(pending.table, mapping, PRICE_DATA);
    set(addResultAtom, {
      trips,
      report: {
        id,
        fileName,
        tripCount: trips.length,
        rowCount: pending.table.rows.length,
        problems,
      },
    });
  } catch {
    set(addErrorAtom, { id, fileName }, "unreadable");
  }
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
      {
        id: pending.id,
        fileName: pending.table.fileName,
        tripCount: 0,
        rowCount: 0,
        problems: [],
        skipped: true,
      },
    ],
  });
});

/** Clears trips, report and settings. */
export const resetAtom = atom(null, (_get, set) => {
  set(generationAtom, (n) => n + 1);
  set(tripsAtom, []);
  set(importReportAtom, EMPTY_REPORT);
  set(settingsAtom, DEFAULT_SETTINGS);
  set(pendingMappingsAtom, []);
  set(autoDriversAtom, 0);
  set(driversSetByHandAtom, false);
});
