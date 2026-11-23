// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { createStore, Provider, useAtomValue } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import "@/i18n/bootstrap";
import { importReportAtom, settingsAtom, tripsAtom } from "@/state/atoms";
import { ImportSummary } from "./import-summary";
import { ImportView } from "./import-view";

const fixtureText = readFileSync(
  resolve(import.meta.dirname, "../../../tests/fixtures/trips-2025.csv"),
  "utf8",
);
const csvFile = (text = fixtureText, name = "export.csv") =>
  new File([text], name, { type: "text/csv" });

/** The first data line, which is row 2 of the file. */
function withFirstRow(change: (line: string) => string): string {
  const [header, first, ...rest] = fixtureText.split("\r\n");
  return [header, change(first ?? ""), ...rest].join("\r\n");
}

function Screen() {
  const hasTrips = useAtomValue(tripsAtom).length > 0;
  return hasTrips ? <ImportSummary /> : <ImportView />;
}

function setup() {
  const store = createStore();
  render(
    <Provider store={store}>
      <Screen />
    </Provider>,
  );
  const user = userEvent.setup({ applyAccept: false });
  const input = () =>
    screen.getByLabelText<HTMLInputElement>(/Fahrten-Export auswählen|Datei hinzufügen/);
  return { store, user, input };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe("import", () => {
  it("imports a recognised export without a dialog", async () => {
    const { store, user, input } = setup();
    await user.upload(input(), csvFile());

    expect(await screen.findByTestId("trip-count")).toHaveTextContent("84 Fahrten");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.get(tripsAtom)).toHaveLength(84);
    expect(store.get(importReportAtom).files).toMatchObject([
      { fileName: "export.csv", tripCount: 84, problems: [] },
    ]);
  });

  it("asks for the column when a header is not recognised", async () => {
    const { store, user, input } = setup();
    const renamed = fixtureText.replace(";Tarif;", ";Vertrag;");
    await user.upload(input(), csvFile(renamed));

    const dialog = await screen.findByRole("dialog", { name: "Spalten zuordnen" });
    const confirm = within(dialog).getByRole("button", { name: "Zuordnung übernehmen" });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getAllByRole("row")).toHaveLength(6); // header + five preview rows

    await user.selectOptions(within(dialog).getByLabelText("Tarif"), "Vertrag");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(await screen.findByTestId("trip-count")).toHaveTextContent("84 Fahrten");
    expect(store.get(tripsAtom)).toHaveLength(84);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("blocks the mapping while a column is used twice", async () => {
    const { user, input } = setup();
    await user.upload(input(), csvFile(fixtureText.replace(";Tarif;", ";Vertrag;")));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Tarif"), "Vertrag");
    const city = within(dialog).getByLabelText("Stadt");
    await user.selectOptions(city, "Vertrag");
    expect(within(dialog).getByRole("button", { name: "Zuordnung übernehmen" })).toBeDisabled();
    expect(within(dialog).getAllByText(/nur einem Feld/)).not.toHaveLength(0);
  });

  it("skips the file when the mapping dialog is cancelled", async () => {
    const { store, user, input } = setup();
    await user.upload(input(), csvFile(fixtureText.replace(";Tarif;", ";Vertrag;"), "odd.csv"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Datei überspringen" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(store.get(tripsAtom)).toHaveLength(0);
    expect(store.get(importReportAtom).files).toMatchObject([
      { fileName: "odd.csv", tripCount: 0, skipped: true },
    ]);
    expect(screen.getByText(/Übersprungen/)).toBeInTheDocument();
    expect(input()).toBeEnabled();
  });

  it("shows an inline message for an unsupported file and stays usable", async () => {
    const { store, user, input } = setup();
    await user.upload(input(), new File(["%PDF-1.7 random"], "scan.pdf"));

    expect(await screen.findByText(/nicht unterstützt/)).toBeInTheDocument();
    expect(store.get(importReportAtom).files[0]?.error).toBe("unsupported");

    await user.upload(input(), csvFile());
    expect(await screen.findByTestId("trip-count")).toHaveTextContent("84 Fahrten");
    expect(screen.getByText(/nicht unterstützt/)).toBeInTheDocument();
  });

  it("reports the same file imported twice as duplicates", async () => {
    const { store, user, input } = setup();
    await user.upload(input(), csvFile());
    await screen.findByTestId("trip-count");
    await user.upload(input(), csvFile(fixtureText, "again.csv"));

    expect(await screen.findByText("84 doppelte Fahrten entfernt")).toBeInTheDocument();
    expect(store.get(importReportAtom).duplicates).toBe(84);
    expect(store.get(tripsAtom)).toHaveLength(84);
  });

  it("lists rejected rows by reason with their row numbers", async () => {
    const { store, user, input } = setup();
    const broken = withFirstRow((line) => line.replace("15.12.2025 17:15:00", "gestern"));
    await user.upload(input(), csvFile(broken));

    expect(await screen.findByText("Datum oder Uhrzeit nicht lesbar")).toBeInTheDocument();
    expect(screen.getByText(/Zeile 2/)).toBeInTheDocument();
    expect(store.get(tripsAtom)).toHaveLength(83);
  });

  it("takes over the number of other drivers once and says so", async () => {
    const { store, user, input } = setup();
    await user.upload(input(), csvFile());

    expect(await screen.findByText(/weitere fahrende Person/)).toBeInTheDocument();
    expect(store.get(settingsAtom).additionalDrivers).toBe(1);
  });

  it("starts over after confirmation", async () => {
    const { store, user, input } = setup();
    await user.upload(input(), csvFile());
    await screen.findByTestId("trip-count");

    await user.click(screen.getByRole("button", { name: "Neu starten" }));
    const dialog = await screen.findByRole("dialog", { name: "Neu starten?" });
    expect(store.get(tripsAtom)).toHaveLength(84);
    await user.click(within(dialog).getByRole("button", { name: "Ja, neu starten" }));

    await waitFor(() => expect(store.get(tripsAtom)).toHaveLength(0));
    expect(store.get(importReportAtom)).toEqual({ files: [], duplicates: 0 });
    expect(await screen.findByLabelText(/Fahrten-Export auswählen/)).toBeInTheDocument();
  });

  it("persists nothing in the browser", async () => {
    const { user, input } = setup();
    await user.upload(input(), csvFile());
    await screen.findByTestId("trip-count");

    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(document.cookie).toBe("");
  });
});
