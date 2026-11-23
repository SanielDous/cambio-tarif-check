import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { PRICE_DATA } from "@/domain/pricing/price-data";
import { detectColumns } from "./detect-columns";
import { ImportError } from "./fields";
import { normalizeRows } from "./normalize-rows";
import { readTable } from "./read-table";
import { addMissingCellReferences } from "./xlsx-repair";

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");

type Cell = { t: "s" | "n"; v: string | number; style?: number } | null;

const HEADERS = [
  "Stadt",
  "Wagenklasse",
  "Buchungsbeginn",
  "Buchungsende",
  "Kilometer",
  "Betrag Zeit",
  "Betrag Kilometer",
  "Tarif",
];

function sheetXml(rows: Cell[][], shared: string[], refs: "all" | "none" | "mixed"): string {
  const letters = "ABCDEFGHIJ";
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === null) return "";
          const withRef = refs === "all" || (refs === "mixed" && c % 2 === 0);
          let value = String(cell.v);
          if (cell.t === "s") {
            shared.push(String(cell.v));
            value = String(shared.length - 1);
          }
          const attrs = [
            withRef ? `r="${letters[c]}${r + 1}"` : "",
            cell.style ? `s="${cell.style}"` : "",
            `t="${cell.t}"`,
          ]
            .filter(Boolean)
            .join(" ");
          return `<c ${attrs}><v>${value}</v></c>`;
        })
        .join("");
      const rowRef = refs === "all" || (refs === "mixed" && r % 2 === 0) ? ` r="${r + 1}"` : "";
      return `<row${rowRef}>${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const s = (v: string): Cell => ({ t: "s", v });
const n = (v: number, style?: number): Cell => (style ? { t: "n", v, style } : { t: "n", v });

const SHEET1: Cell[][] = [
  HEADERS.map(s),
  [
    s("Aachen"),
    s("S Kleinwagen"),
    n(46006.71875, 1),
    n(46006.80625, 1),
    n(19),
    n(4.98),
    n(4.94),
    s("AKTIV"),
  ],
];
const SHEET2: Cell[][] = [["Foo", "Bar"].map(s), [s("1"), s("2")]];

/** A minimal workbook as Excel writes it: deflated parts, shared strings, a date style. */
function workbook(sheets: Cell[][][], refs: "all" | "none" | "mixed"): Uint8Array {
  const shared: string[] = [];
  const sheetFiles: Record<string, Uint8Array> = {};
  sheets.forEach((rows, i) => {
    sheetFiles[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(rows, shared, refs));
  });
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets
        .map((_, i) => `<sheet name="Sheet${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          "",
        )}<Relationship Id="rId99" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId98" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="22" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${ns}" count="${shared.length}" uniqueCount="${shared.length}">${shared
        .map((text) => `<si><t>${text}</t></si>`)
        .join("")}</sst>`,
    ),
    ...sheetFiles,
  });
}

const asFile = (bytes: Uint8Array, name = "x.xlsx") => new File([bytes as BlobPart], name);

const EXPECTED_ROW = [
  "Aachen",
  "S Kleinwagen",
  new Date(Date.UTC(2025, 11, 15, 17, 15)),
  new Date(Date.UTC(2025, 11, 15, 19, 21)),
  19,
  4.98,
  4.94,
  "AKTIV",
];

describe("XLSX reading of ordinary workbooks", () => {
  it("reads an Excel-style workbook (r first, shared strings, date style) and leaves it untouched", async () => {
    const bytes = workbook([SHEET1], "all");
    expect(await addMissingCellReferences(bytes)).toBe(bytes);
    const table = await readTable(asFile(bytes));
    expect(table.headers).toEqual(HEADERS);
    expect(table.rows).toEqual([EXPECTED_ROW]);
    expect(table.rowNumbers).toEqual([2]);
    const { trips, problems } = normalizeRows(
      table,
      detectColumns(table.headers).mapping,
      PRICE_DATA,
    );
    expect(problems).toEqual([]);
    expect(trips).toHaveLength(1);
  });

  it("reads the same content without any r attributes", async () => {
    const table = await readTable(asFile(workbook([SHEET1], "none")));
    expect(table).toEqual(await readTable(asFile(workbook([SHEET1], "all"))));
  });

  it("reads the same content when only some rows and cells have r", async () => {
    const table = await readTable(asFile(workbook([SHEET1], "mixed")));
    expect(table).toEqual(await readTable(asFile(workbook([SHEET1], "all"))));
  });

  it("reads the first sheet of two", async () => {
    const table = await readTable(asFile(workbook([SHEET1, SHEET2], "none")));
    expect(table.headers).toEqual(HEADERS);
  });

  it("reads a deflated copy of the portal-style fixture like the stored original", async () => {
    const original = new Uint8Array(readFileSync(resolve(FIXTURES, "trips-2025.xlsx")));
    const deflated = zipSync(unzipSync(original), { level: 6 });
    expect(deflated.length).not.toBe(original.length);
    const a = await readTable(asFile(original));
    const b = await readTable(asFile(deflated));
    expect(b).toEqual(a);
    expect(a.rows).toHaveLength(84);
  });

  it("reports the true row numbers of an XLSX with a title line and a blank row", async () => {
    const rows: Cell[][] = [[s("Export")], [], SHEET1[0] as Cell[], SHEET1[1] as Cell[]];
    const table = await readTable(asFile(workbook([rows], "all")));
    expect(table.rowNumbers).toEqual([4]);
  });

  it("rejects a workbook that inflates to more than 100 MB as too-large", async () => {
    const bytes = workbook([SHEET1], "none");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i + 4 < bytes.length; i++) {
      // Central directory entries: declare 200 MB for each part.
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 200 * 1024 * 1024, true);
    }
    const error = await readTable(asFile(bytes)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect(error).toMatchObject({ code: "too-large" });
  });
});
