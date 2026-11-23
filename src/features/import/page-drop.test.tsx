// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n/bootstrap";
import { importReportAtom, tripsAtom } from "@/state/atoms";
import { Dropzone } from "./dropzone";
import { PageDrop } from "./page-drop";

const fixture = () =>
  new File(
    [readFileSync(resolve(import.meta.dirname, "../../../tests/fixtures/trips-2025.csv"))],
    "export.csv",
    { type: "text/csv" },
  );

/** A drag carrying files, as the browser describes it. */
const files = (...list: File[]) => ({ dataTransfer: { files: list, types: ["Files"] } });

function setup(onFiles = vi.fn()) {
  const store = createStore();
  render(
    <Provider store={store}>
      <PageDrop onFiles={onFiles} />
      <main data-testid="page">
        <Dropzone />
      </main>
    </Provider>,
  );
  return { store, onFiles };
}

afterEach(cleanup);

describe("dropping files anywhere on the page", () => {
  it("keeps the browser from opening a file dragged over the page", () => {
    setup();
    // fireEvent returns false when the default action was prevented.
    expect(fireEvent.dragOver(document.body, files(fixture()))).toBe(false);
    expect(fireEvent.drop(window, files())).toBe(false);
  });

  it("imports files dropped outside the drop zone", async () => {
    const { store, onFiles } = setup();
    fireEvent.drop(document.body, files(fixture()));
    await waitFor(() => expect(store.get(tripsAtom)).toHaveLength(84));
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it("imports a file dropped on the drop zone only once", async () => {
    const { store, onFiles } = setup();
    const zone = screen.getByText("Fahrten-Export hier ablegen");
    fireEvent.drop(zone, files(fixture()));
    await waitFor(() => expect(store.get(tripsAtom)).toHaveLength(84));
    expect(store.get(importReportAtom).files).toHaveLength(1);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("shows a full-page overlay while files are dragged over the page", () => {
    setup();
    expect(screen.queryByTestId("page-drop-overlay")).not.toBeInTheDocument();
    act(() => void fireEvent.dragEnter(screen.getByTestId("page"), files(fixture())));
    expect(screen.getByTestId("page-drop-overlay")).toHaveTextContent("Zum Einlesen loslassen");
    act(() => void fireEvent.dragLeave(screen.getByTestId("page"), files(fixture())));
    expect(screen.queryByTestId("page-drop-overlay")).not.toBeInTheDocument();
  });

  it("ignores drags that carry no files", () => {
    setup();
    act(() => void fireEvent.dragEnter(document.body, { dataTransfer: { types: ["text/plain"] } }));
    expect(screen.queryByTestId("page-drop-overlay")).not.toBeInTheDocument();
    expect(fireEvent.dragOver(document.body, { dataTransfer: { types: ["text/plain"] } })).toBe(
      true,
    );
  });
});
