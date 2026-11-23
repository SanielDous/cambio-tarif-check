import Papa from "papaparse";
import { cellText, isBlankCell } from "./cells";
import { detectColumns } from "./detect-columns";
import { ImportError, type RawTable } from "./fields";

const MAX_BYTES = 5 * 1024 * 1024;
const HEADER_SEARCH_ROWS = 10;
const HEADER_MIN_FIELDS = 5;

/**
 * The delimiter that splits most of the first non-blank lines into several fields. Papa Parse's
 * own guess is thrown off by title lines and blank lines, which this file format may contain.
 */
function guessDelimiter(text: string): string | undefined {
  const lines = text
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== "")
    .slice(0, HEADER_SEARCH_ROWS * 2);
  let best: { delimiter: string; wide: number; total: number } | undefined;
  for (const delimiter of [";", ",", "\t", "|"]) {
    const counts = lines.map((line) => line.split(delimiter).length - 1);
    const wide = counts.filter((count) => count >= HEADER_MIN_FIELDS - 1).length;
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (wide > 0 && (!best || wide > best.wide || (wide === best.wide && total > best.total))) {
      best = { delimiter, wide, total };
    }
  }
  return best?.delimiter;
}

/** Rows by position: index + 1 is the row number (blank rows are kept so that it stays true). */
function readCsv(bytes: Uint8Array): unknown[][] {
  // TextDecoder drops a leading BOM. Invalid UTF-8 shows up as U+FFFD: retry as windows-1252.
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
  const { data, errors } = Papa.parse<string[]>(text, { delimiter: guessDelimiter(text) });
  const quotes = errors.find((error) => error.type === "Quotes");
  if (quotes) throw new ImportError("unreadable", quotes.message);
  return data;
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
  const numbered = all
    .map((row, index) => ({ row, number: index + 1 }))
    .filter(({ row }) => !row.every(isBlankCell));
  if (numbered.length === 0) throw new ImportError("empty");
  const rows = numbered.map(({ row }) => row);
  const index = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex(
      (row) => Object.keys(detectColumns(row.map(cellText)).mapping).length >= HEADER_MIN_FIELDS,
    );
  const header = rows[index];
  if (index < 0 || header === undefined) {
    throw new ImportError("unsupported", "No header row with recognised columns found");
  }
  const data = numbered.slice(index + 1);
  return {
    fileName,
    headers: header.map(cellText),
    rows: data.map(({ row }) => row),
    rowNumbers: data.map(({ number }) => number),
  };
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
      if (error instanceof ImportError) throw error;
      throw new ImportError("unreadable", error instanceof Error ? error.message : undefined);
    }
    return splitHeader(file.name, all);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("unreadable", error instanceof Error ? error.message : undefined);
  }
}
