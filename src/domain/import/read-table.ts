import Papa from "papaparse";
import { detectColumns } from "./detect-columns";
import { ImportError, type RawTable } from "./fields";

const MAX_BYTES = 5 * 1024 * 1024;
const HEADER_SEARCH_ROWS = 10;
const HEADER_MIN_FIELDS = 5;

const isBlank = (cell: unknown): boolean =>
  cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean"
    ? String(cell)
    : "";
}

function readCsv(bytes: Uint8Array): unknown[][] {
  // TextDecoder drops a leading BOM. Invalid UTF-8 shows up as U+FFFD: retry as windows-1252.
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
  return Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;
}

/**
 * First sheet of an XLSX workbook, loaded on demand to keep the library out of the main bundle.
 * read-excel-file returns date cells as `Date` objects whose UTC fields are the wall-clock values
 * of the cell (it never applies the process time zone); normalizeRows reads only those.
 */
async function readXlsx(file: File): Promise<unknown[][]> {
  const [{ readSheet }, { addMissingCellReferences }] = await Promise.all([
    import("read-excel-file/universal"),
    import("./xlsx-repair"),
  ]);
  const bytes = await addMissingCellReferences(new Uint8Array(await file.arrayBuffer()));
  return readSheet(new Blob([bytes as BlobPart]));
}

/** Drops everything above the header row and returns headers and data rows. */
function splitHeader(fileName: string, all: unknown[][]): RawTable {
  const rows = all.filter((row) => !row.every(isBlank));
  if (rows.length === 0) throw new ImportError("empty");
  const index = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex(
      (row) => Object.keys(detectColumns(row.map(cellText)).mapping).length >= HEADER_MIN_FIELDS,
    );
  const header = rows[index];
  if (index < 0 || header === undefined) {
    throw new ImportError("unsupported", "No header row with recognised columns found");
  }
  return { fileName, headers: header.map(cellText), rows: rows.slice(index + 1) };
}

/** Reads a CSV or XLSX trip export into headers and raw rows. Throws only `ImportError`. */
export async function readTable(file: File): Promise<RawTable> {
  try {
    if (file.size > MAX_BYTES) throw new ImportError("too-large");
    const extension = /\.([^./\\]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "";
    const isXlsx = extension === "xlsx";
    if (!isXlsx && !["csv", "txt", "tsv", ""].includes(extension)) {
      throw new ImportError("unsupported", `Unsupported file type .${extension}`);
    }
    if (file.size === 0) throw new ImportError("empty");
    let all: unknown[][];
    try {
      all = isXlsx ? await readXlsx(file) : readCsv(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      throw new ImportError("unreadable", error instanceof Error ? error.message : undefined);
    }
    return splitHeader(file.name, all);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("unreadable", error instanceof Error ? error.message : undefined);
  }
}
