// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { createStore, Provider } from "jotai";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n/bootstrap";
import de from "@/i18n/locales/de/common.json";
import { ResultView } from "@/features/result/result-view";
import { IndexPage } from "@/routes/index";
import { importFilesAtom, tripsAtom } from "@/state/atoms";
import { LazyView } from "./lazy-view";

const fixture = new File(
  [readFileSync(resolve(import.meta.dirname, "../../tests/fixtures/trips-2025.csv"))],
  "trips-2025.csv",
  { type: "text/csv" },
);

beforeAll(() => {
  // Radix popper measures its content; jsdom has no layout and no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await act(() => i18n.changeLanguage("de"));
});

async function storeWithTrips() {
  const store = createStore();
  await store.set(importFilesAtom, [fixture]);
  return store;
}

describe("index route with the lazy result view", () => {
  it("shows the result once the chunk has loaded", async () => {
    const store = await storeWithTrips();
    render(
      <Provider store={store}>
        <IndexPage />
      </Provider>,
    );
    expect(await screen.findByTestId("headline", undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("LazyView", () => {
  it("reports a failed load, keeps the trips, retries without reload and stores nothing", async () => {
    // React logs the error caught by the boundary.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = await storeWithTrips();
    const trips = store.get(tripsAtom);
    expect(trips.length).toBeGreaterThan(0);

    const load = vi
      .fn<() => Promise<{ default: typeof ResultView }>>()
      .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
      .mockResolvedValue({ default: ResultView });
    render(
      <Provider store={store}>
        <LazyView load={load} />
      </Provider>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(de.lazy.failed);
    expect(store.get(tripsAtom)).toBe(trips);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);

    await userEvent.setup().click(screen.getByRole("button", { name: de.lazy.retry }));
    expect(await screen.findByTestId("headline", undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(store.get(tripsAtom)).toBe(trips);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it("shows a translated status while loading", async () => {
    let resolveLoad: (value: { default: typeof ResultView }) => void = () => undefined;
    const load = () =>
      new Promise<{ default: typeof ResultView }>((resolve) => {
        resolveLoad = resolve;
      });
    render(
      <Provider store={createStore()}>
        <LazyView load={load} />
      </Provider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(de.lazy.loading);
    act(() => resolveLoad({ default: () => <p>loaded</p> }));
    expect(await screen.findByText("loaded")).toBeInTheDocument();
  });
});
