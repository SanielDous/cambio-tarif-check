import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { analysisAtom, importFilesAtom, importReportAtom } from "./atoms";

const fixtureText = readFileSync(
  resolve(import.meta.dirname, "../../tests/fixtures/trips-2025.csv"),
  "utf8",
);
const [header = "", ...dataLines] = fixtureText.split("\r\n");
const csvFile = (lines: string[], name: string) =>
  new File([[header, ...lines, ""].join("\r\n")], name, { type: "text/csv" });

const START = 7;
const END = 8;
const TRIP_END = 10;
const BILLED_TIME = 15;
const BILLED_KM = 16;
const STATUS = 23;

/** A fixture line as an earlier export shows it before billing: booked end, no amounts. */
function unbilled(line: string, changes: Record<number, string> = {}): string {
  const cells = line.split(";");
  cells[END] = "15.12.2025 20:00:00"; // the booked end, not yet the return
  cells[TRIP_END] = "";
  cells[BILLED_TIME] = "";
  cells[BILLED_KM] = "";
  cells[STATUS] = "OPEN";
  for (const [index, value] of Object.entries(changes)) cells[Number(index)] = value;
  return cells.join(";");
}

const december = (store: ReturnType<typeof createStore>) =>
  store.get(analysisAtom)?.months.find((month) => month.month === "2025-12");

describe("months with trips that are not billed yet", () => {
  const first = dataLines[0] ?? "";
  const older = () => csvFile([unbilled(first), ...dataLines.slice(1)], "older.csv");
  const newer = () => csvFile(dataLines, "newer.csv");

  it("flags the month while the trip is not billed in any imported file", async () => {
    const store = createStore();
    await store.set(importFilesAtom, [older()]);
    expect(store.get(importReportAtom).files[0]?.problems).toMatchObject([
      { reason: "not-billed", month: "2025-12" },
    ]);
    expect(december(store)?.incomplete).toBe(true);
  });

  it("drops the flag once a later export holds the billed trip", async () => {
    const store = createStore();
    await store.set(importFilesAtom, [older()]);
    await store.set(importFilesAtom, [newer()]);
    expect(december(store)?.incomplete).toBe(false);
  });

  it("drops the flag also when the newer export comes first", async () => {
    const store = createStore();
    await store.set(importFilesAtom, [newer(), older()]);
    expect(december(store)?.incomplete).toBe(false);
  });

  it("keeps the flag for an unbilled row without a billed counterpart", async () => {
    const store = createStore();
    const other = unbilled(first, { [START]: "20.12.2025 10:00:00", [END]: "20.12.2025 12:00:00" });
    await store.set(importFilesAtom, [newer(), csvFile([other], "open.csv")]);
    expect(december(store)?.incomplete).toBe(true);
  });
});
