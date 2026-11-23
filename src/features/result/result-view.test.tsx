// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { createStore, Provider } from "jotai";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/bootstrap";
import de from "@/i18n/locales/de/common.json";
import en from "@/i18n/locales/en/common.json";
import type { Trip } from "@/domain/import/fields";
import { toLocalMinute } from "@/domain/pricing/local-time";
import type { TariffId } from "@/domain/pricing/types";
import { analysisAtom, importFilesAtom, settingsAtom, tripsAtom } from "@/state/atoms";
import { ResultView } from "./result-view";

const FIXTURES = resolve(import.meta.dirname, "../../../tests/fixtures");
const fixture = (name: string) =>
  new File([readFileSync(resolve(FIXTURES, name))], name, { type: "text/csv" });

type Store = ReturnType<typeof createStore>;

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
  await act(() => i18n.changeLanguage("de"));
});

/** Renders the result for the given store and waits for the lazy chart to resolve. */
async function renderResult(store: Store) {
  render(
    <Provider store={store}>
      <ResultView />
    </Provider>,
  );
  if (store.get(analysisAtom)) await screen.findByTestId("cost-chart");
  return userEvent.setup();
}

/** Both fixtures through the real import, as the app does it. */
async function withFixtures() {
  const store = createStore();
  await store.set(importFilesAtom, [fixture("trips-2025.csv"), fixture("trips-2026.csv")]);
  const user = await renderResult(store);
  return { store, user };
}

/** "2.312,49 €" → 231249 */
const cents = (text: string | null) =>
  Number((text ?? "").replace(/[^\d,-]/g, "").replace(",", ""));

let counter = 0;
function trip(tariff: TariffId, y: number, m: number, d: number): Trip {
  counter++;
  return {
    id: `synthetic-${counter}`,
    city: "Nowhere",
    vehicleClass: "S Kleinwagen",
    priceClass: "S",
    start: toLocalMinute(y, m, d, 10, 0),
    end: toLocalMinute(y, m, d, 11, 0),
    km: 10,
    billedTime: 400,
    billedKm: 300,
    tariff,
  };
}

async function withTrips(trips: Trip[]) {
  const store = createStore();
  store.set(tripsAtom, trips);
  const user = await renderResult(store);
  return { store, user };
}

const headline = () => screen.getByTestId("headline").textContent;

describe("result summary", () => {
  it("names the best tariff and shows the three totals", async () => {
    await withFixtures();
    expect(headline()).toContain("Aktiv");
    for (const id of ["total-actual", "total-best", "total-optimal"]) {
      expect(screen.getByTestId(id)).toHaveTextContent(/\d+,\d\d\s€/);
    }
    expect(screen.getByTestId("total-optimal")).toHaveTextContent("7 Wechsel");
    expect(screen.getByTestId("verification")).toHaveTextContent(
      "84 von 85 Fahrten auf den Cent nachgerechnet",
    );
  });

  it("says when the user's own switching beat every single tariff (fixtures)", async () => {
    const { store } = await withFixtures();
    const a = store.get(analysisAtom);
    expect(a?.bestSingle.saving).toBeLessThan(0);
    expect(headline()).toMatch(
      /^Du hast durch deine Wechsel \d+,\d\d\s€ weniger bezahlt als im besten einzelnen Tarif \(Aktiv\)\.$/,
    );
  });

  it("names the saving when a single tariff would have been cheaper", async () => {
    await withTrips([trip("COMFORT", 2025, 1, 10), trip("COMFORT", 2025, 2, 10)]);
    expect(headline()).toMatch(/^Mit dem Tarif Basis hättest du \d+,\d\d\s€ gespart\.$/);
  });

  it("says so when the user was in the best tariff the whole time", async () => {
    await withTrips([trip("BASIS", 2025, 1, 10), trip("BASIS", 2025, 2, 10)]);
    expect(headline()).toBe("Du warst die ganze Zeit im günstigsten Tarif: Basis.");
  });

  it("leaves no German text in the summary in English", async () => {
    await withFixtures();
    await act(() => i18n.changeLanguage("en"));
    const text = screen.getByTestId("summary").textContent ?? "";
    expect(text).toContain("recomputed to the cent");

    const fragments = (value: unknown): string[] =>
      typeof value === "string"
        ? value.split(/\{\{[^}]*\}\}/).map((s) => s.trim())
        : Object.values(value as object).flatMap(fragments);
    const english = new Set(fragments(en.result));
    const german = fragments(de.result.summary).filter((s) => s.length >= 4 && !english.has(s));
    expect(german.length).toBeGreaterThan(10);
    for (const s of german) expect(text).not.toContain(s);
  });
});

describe("tariff matrix", () => {
  it("has 18 month columns, three tariff rows and the actual row", async () => {
    await withFixtures();
    expect(screen.getAllByTestId("month-header")).toHaveLength(18);
    expect(screen.getAllByTestId("tariff-row").map((r) => r.dataset.tariff)).toEqual([
      "BASIS",
      "AKTIV",
      "COMFORT",
    ]);
    expect(screen.getByTestId("actual-row")).toBeInTheDocument();
  });

  it("marks exactly one cheapest, one actual and one path cell per month", async () => {
    await withFixtures();
    const rows = screen.getAllByTestId("tariff-row");
    for (let month = 0; month < 18; month++) {
      const cells = rows.map((row) => row.querySelectorAll("td")[month] as HTMLElement);
      expect(cells.filter((c) => c.dataset.cheapest)).toHaveLength(1);
      expect(cells.filter((c) => c.dataset.actual)).toHaveLength(1);
      expect(cells.filter((c) => c.dataset.path)).toHaveLength(1);
      for (const c of cells.filter((c) => c.dataset.cheapest)) {
        expect(c).toHaveAttribute("title", expect.stringContaining("günstigster Tarif"));
      }
    }
  });

  it("recomputes all figures when the number of additional drivers changes", async () => {
    const { user } = await withFixtures();
    expect(screen.getByTestId("drivers-value")).toHaveTextContent("1");
    const before = cents(screen.getByTestId("total-AKTIV").textContent);
    await user.click(screen.getByRole("button", { name: "Eine weitere Fahrer:in mehr" }));
    expect(screen.getByTestId("drivers-value")).toHaveTextContent("2");
    expect(cents(screen.getByTestId("total-AKTIV").textContent) - before).toBe(18 * 300);
    expect(screen.getByRole("switch", { name: "Ich bin unter 26" })).toBeDisabled();
  });

  it("lets the user correct the actual tariff of a month", async () => {
    const { store, user } = await withFixtures();
    // Without additional drivers, as in the owner's example (the import sets one).
    await user.click(screen.getByRole("button", { name: "Eine weitere Fahrer:in weniger" }));
    const before = cents(screen.getByTestId("actual-total").textContent);
    for (const m of ["2026-02", "2026-03", "2026-04"]) {
      expect(screen.getByTestId(`actual-tariff-${m}`)).toHaveTextContent("Aktivangenommen");
    }

    await user.click(screen.getByTestId("actual-tariff-2026-01"));
    await user.click(await screen.findByRole("menuitemradio", { name: "Basis" }));

    expect(store.get(settingsAtom).actualTariffOverrides).toEqual({ "2026-01": "BASIS" });
    const jan = screen.getByTestId("actual-tariff-2026-01");
    expect(jan).toHaveAttribute("data-source", "override");
    expect(jan).toHaveTextContent("Basisvon Hand");
    for (const m of ["2026-02", "2026-03", "2026-04"]) {
      const cell = screen.getByTestId(`actual-tariff-${m}`);
      expect(cell).toHaveAttribute("data-source", "inherited");
      expect(cell).toHaveTextContent("Basisangenommen");
    }
    // Four months without the Aktiv fee of 11 €; the switch to Basis moves from May to January,
    // so the switching fees stay the same.
    expect(before - cents(screen.getByTestId("actual-total").textContent)).toBe(4400);

    await user.click(screen.getByTestId("actual-tariff-2026-01"));
    await user.click(await screen.findByRole("menuitem", { name: /Wieder aus den Fahrten/ }));
    expect(store.get(settingsAtom).actualTariffOverrides).toEqual({});
    expect(cents(screen.getByTestId("actual-total").textContent)).toBe(before);
  });

  it("opens a month in the trip list from its column header", async () => {
    const { user } = await withFixtures();
    expect(screen.queryAllByTestId("trip-row")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Fahrten im Dezember 2025 anzeigen" }));
    const trigger = screen.getByRole("button", { name: /Dezember 2025/, expanded: true });
    expect(trigger).toBeInTheDocument();
    expect(screen.getAllByTestId("trip-row").length).toBeGreaterThan(0);
  });
});

describe("trip list", () => {
  it("turns a not-reproducible trip into a manual one when its booked end is entered", async () => {
    const { store, user } = await withFixtures();
    const target = store
      .get(analysisAtom)
      ?.trips.find((r) => r.reconstruction.kind === "not-reproducible");
    if (!target) throw new Error("fixture without a not-reproducible trip");

    const monthName = new Intl.DateTimeFormat("de", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${target.month}-01T00:00:00Z`));
    await user.click(screen.getByRole("button", { name: new RegExp(`^${monthName}`) }));

    const badge = screen
      .getAllByTestId("status-badge")
      .find((b) => b.dataset.kind === "not-reproducible");
    if (!badge) throw new Error("badge not shown");
    expect(badge).toHaveTextContent("nicht nachrechenbar");
    expect(badge).toHaveAccessibleDescription(/Kein gebuchtes Ende ergibt/);
    const row = badge.closest("tr") as HTMLElement;

    await user.click(within(row).getByRole("button", { name: "Gebuchtes Ende eintragen" }));
    const time = await screen.findByLabelText("Uhrzeit");
    const later = Number((time as HTMLSelectElement).value) + 60;
    await user.selectOptions(time, String(later));
    await user.click(screen.getByRole("button", { name: "Übernehmen" }));

    expect(store.get(settingsAtom).manualBookedEnds[target.trip.id]).toBe(
      target.reconstruction.chargedUntil + 60,
    );
    const updated = within(row).getByTestId("status-badge");
    expect(updated).toHaveAttribute("data-kind", "manual");
    expect(updated).toHaveTextContent("von Hand ergänzt");
  });

  it("rejects a booked end before the return", async () => {
    const { store, user } = await withFixtures();
    const target = store
      .get(analysisAtom)
      ?.trips.find((r) => r.reconstruction.kind === "not-reproducible");
    if (!target) throw new Error("fixture without a not-reproducible trip");
    act(() => {
      store.set(settingsAtom, {
        ...store.get(settingsAtom),
        period: { from: target.month, to: target.month },
      });
    });
    await user.click(screen.getAllByRole("button", { name: /Fahrten/, expanded: false })[0]!);
    const row = screen
      .getAllByTestId("status-badge")
      .find((b) => b.dataset.kind === "not-reproducible")
      ?.closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Gebuchtes Ende eintragen" }));
    const time = await screen.findByLabelText("Uhrzeit");
    await user.selectOptions(time, String(Number((time as HTMLSelectElement).value) - 15));
    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("kann nicht vor");
    expect(store.get(settingsAtom).manualBookedEnds).toEqual({});
  });
});

describe("empty state", () => {
  it("explains an empty period and offers the whole period again", async () => {
    const { user } = await withFixtures();
    await user.selectOptions(screen.getByLabelText("Von"), "2026-02");
    await user.selectOptions(screen.getByLabelText("Bis"), "2026-03");
    expect(screen.getByTestId("result-empty")).toHaveTextContent(
      "Im gewählten Zeitraum gibt es keine Fahrten.",
    );
    expect(screen.queryByTestId("summary")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gesamten Zeitraum anzeigen" }));
    expect(await screen.findByTestId("summary")).toBeInTheDocument();
    await screen.findByTestId("cost-chart");
  });
});
