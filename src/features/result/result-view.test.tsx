// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { createStore, Provider } from "jotai";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/bootstrap";
import de from "@/i18n/locales/de/common.json";
import en from "@/i18n/locales/en/common.json";
import type { Analysis } from "@/domain/analysis/analyze";
import type { Trip } from "@/domain/import/fields";
import { toLocalMinute } from "@/domain/pricing/local-time";
import type { TariffId } from "@/domain/pricing/types";
import { analysisAtom, importFilesAtom, settingsAtom, tripsAtom } from "@/state/atoms";
import { formatCurrency } from "@/lib/format";
import { toDateValue } from "./booked-end";
import { ResultView } from "./result-view";
import { SummaryCard } from "./summary-card";

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
const euro = (c: number) => formatCurrency(c, "de");
/** jest-dom normalizes the element's whitespace, not the expectation's. */
const spaced = (text: string) => text.replace(/\s+/g, " ");

describe("result summary", () => {
  it("shows the three totals as computed by the analysis", async () => {
    const { store } = await withFixtures();
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    expect(headline()).toContain("Aktiv");
    const amount = (id: string) => screen.getByTestId(`${id}-amount`).textContent;
    expect(amount("total-actual")).toBe(euro(a.actualTotal));
    expect(amount("total-best")).toBe(euro(a.bestSingle.total));
    expect(amount("total-optimal")).toBe(euro(a.optimalPath.total));
    expect(screen.getByTestId("total-optimal")).toHaveTextContent("7 Wechsel");
  });

  it("counts only exact recomputations and lists the other kinds", async () => {
    await withFixtures();
    expect(screen.getByTestId("verification")).toHaveTextContent(
      /^75 von 85 Fahrten auf den Cent nachgerechnet$/,
    );
    expect(screen.getByTestId("verification-others")).toHaveTextContent(
      /^9 mit 1 Cent Rundungsabweichung · 1 nicht nachrechenbar$/,
    );
  });

  it("uses the singular for a single trip", async () => {
    await withTrips([trip("BASIS", 2025, 1, 10)]);
    expect(screen.getByTestId("verification")).toHaveTextContent(/^\d von 1 Fahrt auf den Cent/);
  });

  it("says when the user's own switching beat every single tariff (fixtures)", async () => {
    const { store } = await withFixtures();
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    expect(a.bestSingle.saving).toBeLessThan(0);
    expect(headline()).toBe(
      `Du hast durch deine Wechsel ${euro(-a.bestSingle.saving)} weniger bezahlt als im besten einzelnen Tarif (Aktiv).`,
    );
  });

  it("names the saving when a single tariff would have been cheaper", async () => {
    const { store } = await withTrips([trip("COMFORT", 2025, 1, 10), trip("COMFORT", 2025, 2, 10)]);
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    expect(a.bestSingle.saving).toBeGreaterThan(0);
    expect(headline()).toBe(`Mit dem Tarif Basis hättest du ${euro(a.bestSingle.saving)} gespart.`);
    expect(screen.getByTestId("headline").nextElementSibling).toHaveTextContent(
      spaced(
        `Du hast ${euro(a.actualTotal)} bezahlt. Mit Basis wären es für dieselben Fahrten ${euro(a.bestSingle.total)} gewesen.`,
      ),
    );
  });

  it("does not claim a saving when a single tariff would have cost exactly the same", async () => {
    const { store } = await withTrips([trip("COMFORT", 2025, 1, 10), trip("COMFORT", 2025, 2, 10)]);
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    cleanup();
    const equal: Analysis = {
      ...a,
      actualTotal: a.bestSingle.total,
      bestSingle: { ...a.bestSingle, saving: 0 },
    };
    render(<SummaryCard analysis={equal} />);
    expect(headline()).toBe("Du hast genau so viel bezahlt wie im besten einzelnen Tarif (Basis).");
    expect(headline()).not.toMatch(/0,00/);
  });

  it("says so when the user was in the best tariff the whole time", async () => {
    const { store } = await withTrips([trip("BASIS", 2025, 1, 10), trip("BASIS", 2025, 2, 10)]);
    expect(headline()).toBe("Du warst die ganze Zeit im günstigsten Tarif: Basis.");
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    const sub = () => screen.getByTestId("headline").nextElementSibling;

    // These trips are billed slightly above the model, so switching would have saved a little.
    const hindsight = a.actualTotal - a.optimalPath.total;
    expect(hindsight).toBeGreaterThan(0);
    expect(sub()).toHaveTextContent(
      spaced(`Rückblickend hätten Wechsel zwischen den Tarifen ${euro(hindsight)} gespart`),
    );
    expect(sub()).not.toHaveTextContent(/lohnt sich/);

    // Without anything to gain from switching, the sub line says that switching does not pay.
    cleanup();
    render(
      <SummaryCard analysis={{ ...a, optimalPath: { ...a.optimalPath, total: a.actualTotal } }} />,
    );
    expect(sub()).toHaveTextContent(/Ein Wechsel lohnt sich nach diesen Zahlen nicht/);
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

  it("offers only the compared tariffs and pins a confirmed assumption", async () => {
    const { store, user } = await withFixtures();
    await user.click(screen.getByTestId("actual-tariff-2026-02"));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["Basis", "Aktiv", "Comfort"]);
    await user.click(screen.getByRole("menuitemradio", { name: "Aktiv" }));
    expect(store.get(settingsAtom).actualTariffOverrides).toEqual({ "2026-02": "AKTIV" });
    expect(screen.getByTestId("actual-tariff-2026-02")).toHaveAttribute("data-source", "override");
  });

  it("lists a month's own tariff even if it is not compared", async () => {
    const { store, user } = await withFixtures();
    act(() => {
      store.set(settingsAtom, {
        ...store.get(settingsAtom),
        actualTariffOverrides: { "2026-02": "START" },
      });
    });
    await user.click(screen.getByTestId("actual-tariff-2026-02"));
    const start = await screen.findByRole("menuitemradio", { name: /Start/ });
    expect(start).toHaveTextContent("wird nicht verglichen");
    expect(start).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("menuitemradio", { name: /Campus/ })).not.toBeInTheDocument();
  });
});

describe("trip list", () => {
  /** Opens the month of the not-reproducible trip and its booked-end editor. */
  async function openEditor() {
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
    const row = badge.closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Gebuchtes Ende/ }));
    const date = await screen.findByLabelText<HTMLInputElement>("Datum");
    const time = screen.getByLabelText<HTMLSelectElement>("Uhrzeit");
    const apply = () => user.click(screen.getByRole("button", { name: "Übernehmen" }));
    return { store, user, target, row, badge, date, time, apply };
  }

  it("turns a not-reproducible trip into a manual one without raising the exact count", async () => {
    const { store, user, target, row, badge, time, apply } = await openEditor();
    expect(badge).toHaveTextContent("nicht nachrechenbar");
    expect(badge).toHaveAccessibleDescription(/Kein gebuchtes Ende ergibt/);

    await user.selectOptions(time, String(Number(time.value) + 60));
    await apply();

    expect(store.get(settingsAtom).manualBookedEnds[target.trip.id]).toBe(
      target.reconstruction.chargedUntil + 60,
    );
    const updated = within(row).getByTestId("status-badge");
    expect(updated).toHaveAttribute("data-kind", "manual");
    expect(updated).toHaveTextContent("von Hand ergänzt");
    expect(screen.getByTestId("verification")).toHaveTextContent(/^75 von 85 Fahrten/);
    expect(screen.getByTestId("verification-others")).toHaveTextContent(
      /^9 mit 1 Cent Rundungsabweichung · 1 von Hand ergänzt$/,
    );
    // The manual trip still shows how far the model is from the invoice.
    const manual = store.get(analysisAtom)?.trips.find((r) => r.trip.id === target.trip.id);
    const own = manual?.costs[target.trip.tariff];
    const deviation =
      (own?.time ?? 0) + (own?.km ?? 0) - target.trip.billedTime - target.trip.billedKm;
    expect(deviation).not.toBe(0);
    expect(row).toHaveTextContent(
      spaced(`Nachrechnung ${formatCurrency(deviation, "de", { signed: true })}`),
    );
  });

  it("clears a manual booked end again", async () => {
    const { store, user, row, time, apply } = await openEditor();
    await user.selectOptions(time, String(Number(time.value) + 15));
    await apply();
    await user.click(within(row).getByRole("button", { name: "Gebuchtes Ende ändern" }));
    await user.click(await screen.findByRole("button", { name: "Eintrag entfernen" }));
    expect(store.get(settingsAtom).manualBookedEnds).toEqual({});
    expect(within(row).getByTestId("status-badge")).toHaveAttribute(
      "data-kind",
      "not-reproducible",
    );
  });

  it("rejects a booked end before the return", async () => {
    const { store, user, time, date, apply } = await openEditor();
    await user.selectOptions(time, String(Number(time.value) - 15));
    await apply();
    expect(await screen.findByRole("alert")).toHaveTextContent("kann nicht vor");
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAccessibleDescription(/kann nicht vor/);
    expect(store.get(settingsAtom).manualBookedEnds).toEqual({});
  });

  it("rejects a booked end more than 30 days after the start", async () => {
    const { store, target, date, apply } = await openEditor();
    expect(date.max).toBe(toDateValue(target.trip.start + 30 * 24 * 60));
    expect(date.min).toBe(toDateValue(target.reconstruction.chargedUntil));
    fireEvent.change(date, { target: { value: toDateValue(target.trip.start + 31 * 24 * 60) } });
    await apply();
    expect(await screen.findByRole("alert")).toHaveTextContent("höchstens 30 Tage");
    expect(store.get(settingsAtom).manualBookedEnds).toEqual({});
  });

  it("rejects an impossible date", async () => {
    const { store, date, apply } = await openEditor();
    fireEvent.change(date, { target: { value: "2025-02-31" } });
    await apply();
    expect(await screen.findByRole("alert")).toHaveTextContent("Dieses Datum gibt es nicht");
    expect(store.get(settingsAtom).manualBookedEnds).toEqual({});
  });
});

describe("settings bar", () => {
  it("disables the under-26 switch while there are additional drivers", async () => {
    const { user } = await withFixtures();
    const under26 = screen.getByRole("switch", { name: "Ich bin unter 26" });
    expect(under26).toBeDisabled();
    expect(under26).toHaveAccessibleDescription(/nur ohne weitere Fahrer:innen/);
    await user.click(screen.getByRole("button", { name: "Eine weitere Fahrer:in weniger" }));
    expect(under26).toBeEnabled();
    await user.click(under26);
    expect(screen.getAllByTestId("tariff-row").map((r) => r.dataset.tariff)).toContain("CAMPUS");
  });

  it("keeps the period ordered when from is moved past to", async () => {
    const { store, user } = await withFixtures();
    const from = screen.getByLabelText<HTMLSelectElement>("Von");
    const to = screen.getByLabelText<HTMLSelectElement>("Bis");
    await user.selectOptions(to, "2025-03");
    await user.selectOptions(from, "2025-06");
    expect(store.get(settingsAtom).period).toEqual({ from: "2025-06", to: "2025-06" });
    expect(to.value).toBe("2025-06");
    await user.selectOptions(to, "2025-02");
    expect(store.get(settingsAtom).period).toEqual({ from: "2025-02", to: "2025-02" });
    expect(from.value).toBe("2025-02");
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
