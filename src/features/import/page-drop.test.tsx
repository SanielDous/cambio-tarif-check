// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  describe("never leaves the overlay behind", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const overlay = () => screen.queryByTestId("page-drop-overlay");
    /** Enters three levels deep, as when the pointer crosses into children: unbalanced leaves. */
    function enterDeep() {
      const page = screen.getByTestId("page");
      act(() => void fireEvent.dragEnter(document.body, files()));
      act(() => void fireEvent.dragEnter(page, files()));
      act(() => void fireEvent.dragEnter(page.firstElementChild ?? page, files()));
      expect(overlay()).toBeInTheDocument();
    }
    /** A dragleave whose `relatedTarget` is set: null when the drag left the window. */
    function leave(relatedTarget: EventTarget | null) {
      const event = createEvent.dragLeave(screen.getByTestId("page"), files());
      Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
      act(() => void fireEvent(screen.getByTestId("page"), event));
    }

    it("hides after 400 ms without a dragover", () => {
      setup();
      enterDeep();
      for (let i = 0; i < 5; i++) {
        act(() => void vi.advanceTimersByTime(300));
        act(() => void fireEvent.dragOver(document.body, files()));
        expect(overlay()).toBeInTheDocument();
      }
      act(() => void vi.advanceTimersByTime(399));
      expect(overlay()).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(1));
      expect(overlay()).not.toBeInTheDocument();
    });

    it("shows again on the next drag after the watchdog hid it", () => {
      setup();
      enterDeep();
      act(() => void vi.advanceTimersByTime(400));
      expect(overlay()).not.toBeInTheDocument();
      act(() => void fireEvent.dragEnter(screen.getByTestId("page"), files()));
      expect(overlay()).toBeInTheDocument();
    });

    it("hides on a dragleave that leaves the window", () => {
      setup();
      enterDeep();
      leave(screen.getByTestId("page"));
      expect(overlay()).toBeInTheDocument();
      leave(null);
      expect(overlay()).not.toBeInTheDocument();
    });

    it("hides on drop", () => {
      setup();
      enterDeep();
      act(() => void fireEvent.drop(document.body, { dataTransfer: { types: ["Files"] } }));
      expect(overlay()).not.toBeInTheDocument();
    });

    it("hides on dragend", () => {
      setup();
      enterDeep();
      act(() => void fireEvent.dragEnd(window, files()));
      expect(overlay()).not.toBeInTheDocument();
    });

    it("hides when the window loses focus", () => {
      setup();
      enterDeep();
      act(() => void fireEvent.blur(window));
      expect(overlay()).not.toBeInTheDocument();
    });

    it("hides on Escape, not on other keys", () => {
      setup();
      enterDeep();
      act(() => void fireEvent.keyDown(window, { key: "Enter" }));
      expect(overlay()).toBeInTheDocument();
      act(() => void fireEvent.keyDown(window, { key: "Escape" }));
      expect(overlay()).not.toBeInTheDocument();
    });

    it("removes every listener and the watchdog on unmount", () => {
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      const { unmount } = render(
        <Provider store={createStore()}>
          <PageDrop />
        </Provider>,
      );
      act(() => void fireEvent.dragEnter(window, files()));
      unmount();
      const added = add.mock.calls.map(([type, listener]) => [type, listener]);
      const removed = remove.mock.calls.map(([type, listener]) => [type, listener]);
      expect(added.map(([type]) => type).sort()).toEqual(
        ["blur", "dragend", "dragenter", "dragleave", "dragover", "drop", "keydown"].sort(),
      );
      expect(removed).toEqual(expect.arrayContaining(added));
      expect(vi.getTimerCount()).toBe(0);
      add.mockRestore();
      remove.mockRestore();
    });
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
