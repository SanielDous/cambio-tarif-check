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
import { PRICE_DATA } from "@/domain/pricing/price-data";
import type { TariffId } from "@/domain/pricing/types";
import { analysisAtom, importFilesAtom, settingsAtom, tripsAtom } from "@/state/atoms";
import { formatCurrency, formatHours } from "@/lib/format";
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
  if (store.get(analysisAtom)) await screen.findByTestId("cost-chart", {}, { timeout: 5000 });
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
      /^9 mit 1 Cent Rundungsabweichung · 1 verspätet zurückgegeben \(Rückgabezeit aus dem Betrag erschlossen\)$/,
    );
    expect(screen.queryByTestId("warnings")).not.toHaveTextContent(/nicht eindeutig/);
  });

  it("counts a confirmed late return as exact at 0 and as rounding at 1 cent", async () => {
    const { store } = await withFixtures();
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    expect(a.verification.overrun).toBe(1);
    cleanup();
    const confirmed = (timeDeviation: number) => ({
      ...a,
      trips: a.trips.map((r) =>
        r.reconstruction.kind === "overrun"
          ? { ...r, reconstruction: { ...r.reconstruction, overrunInferred: false, timeDeviation } }
          : r,
      ),
    });
    render(<SummaryCard analysis={confirmed(0)} />);
    expect(screen.getByTestId("verification")).toHaveTextContent(/^76 von 85 Fahrten/);
    expect(screen.getByTestId("verification-others")).toHaveTextContent(
      /^9 mit 1 Cent Rundungsabweichung$/,
    );
    cleanup();
    render(<SummaryCard analysis={confirmed(1)} />);
    expect(screen.getByTestId("verification")).toHaveTextContent(/^75 von 85 Fahrten/);
    expect(screen.getByTestId("verification-others")).toHaveTextContent(
      /^10 mit 1 Cent Rundungsabweichung$/,
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

  it("warns about trips after the price date, with their number", async () => {
    const day = (n: number) => {
      const [y, m, d] = PRICE_DATA.pricesAsOf.split("-").map(Number) as [number, number, number];
      return trip("BASIS", y, m, d + n);
    };
    await withTrips([trip("BASIS", 2025, 1, 10), day(0), day(1), day(2)]);
    expect(screen.getByTestId("warnings")).toHaveTextContent(
      /2 Fahrten liegen nach dem Preisstand \(.+\) und wurden mit den zuletzt bekannten Preisen berechnet/,
    );
    cleanup();
    await withTrips([trip("BASIS", 2025, 1, 10), day(0)]);
    expect(screen.queryByText(/nach dem Preisstand/)).not.toBeInTheDocument();
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
        expect(c).toHaveTextContent("günstigster Tarif");
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
  it("shows the inferred late return of May 2025 with its booked end and overrun minutes", async () => {
    const { user } = await withFixtures();
    const may = screen.getByRole("button", { name: /^Mai 2025/ });
    expect(may).not.toHaveTextContent(/zu prüfen/);
    expect(screen.queryAllByText(/zu prüfen/)).toHaveLength(0);
    await user.click(may);
    const badge = screen.getAllByTestId("status-badge").find((b) => b.dataset.kind === "overrun");
    if (!badge) throw new Error("badge not shown");
    expect(badge).toHaveTextContent("verspätet zurückgegeben");
    expect(badge).toHaveAccessibleDescription(
      "Der Betrag passt zu einer Rückgabe 13 Minuten nach dem gebuchten Ende. Die Rückgabezeit steht nicht im Export und ist aus dem Betrag erschlossen.",
    );
    const row = badge.closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("gebucht bis 20:00, vermutlich 13 min später zurückgegeben");
    expect(row).toHaveTextContent("5 h 13 min");
    expect(row).not.toHaveTextContent("Nachrechnung");
    expect(within(row).getByRole("button", { name: "Gebuchtes Ende eintragen" })).toBeVisible();
  });

  it("lets the user overrule an inferred late return", async () => {
    const { store, user } = await withFixtures();
    await user.click(screen.getByRole("button", { name: /^Mai 2025/ }));
    const badge = screen.getAllByTestId("status-badge").find((b) => b.dataset.kind === "overrun");
    const row = badge?.closest("tr") as HTMLElement;
    const target = store.get(analysisAtom)?.trips.find((r) => r.reconstruction.overrunInferred);
    if (!target) throw new Error("no inferred overrun");

    await user.click(within(row).getByRole("button", { name: "Gebuchtes Ende eintragen" }));
    const description = await screen.findByText(/^Gebucht bis/);
    expect(description).toHaveTextContent(
      spaced("Gebucht bis 09.05.2025, 20:00 · zurückgegeben vermutlich 09.05.2025, 20:13"),
    );
    expect(screen.queryByText(/Zurückgegeben wurde das Auto am/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keine verspätete Rückgabe" }));

    expect(store.get(settingsAtom).manualBookedEnds).toEqual({ [target.trip.id]: target.trip.end });
    const manual = store.get(analysisAtom)?.trips.find((r) => r.trip.id === target.trip.id);
    expect(manual?.reconstruction.kind).toBe("manual");
    expect(manual?.reconstruction.overrunMinutes).toBe(0);
    expect(within(row).getByTestId("status-badge")).toHaveAttribute("data-kind", "manual");
    expect(row).not.toHaveTextContent("später zurückgegeben");
    // 5 h × 2.10 = 10.50 against 11.41 billed.
    expect(row).toHaveTextContent(
      spaced(`Nachrechnung ${formatCurrency(-91, "de", { signed: true })}`),
    );
    expect(screen.getByTestId("verification")).toHaveTextContent(/^75 von 85 Fahrten/);
    expect(screen.getByTestId("verification-others")).toHaveTextContent(
      /^9 mit 1 Cent Rundungsabweichung · 1 von Hand ergänzt$/,
    );
  });

  /** Monday 2025-12-15, AKTIV S 10:00–11:07, 10 km: a time amount of 1.00 € no booking explains. */
  const unexplained: Trip = {
    id: "unexplained",
    city: "Nowhere",
    vehicleClass: "S Kleinwagen",
    priceClass: "S",
    start: toLocalMinute(2025, 12, 15, 10, 0),
    end: toLocalMinute(2025, 12, 15, 11, 7),
    km: 10,
    billedTime: 100,
    billedKm: 260,
    tariff: "AKTIV",
  };

  /** Opens the month of the not-reproducible trip and its booked-end editor. */
  async function openEditor() {
    const { store, user } = await withTrips([unexplained]);
    const target = store.get(analysisAtom)?.trips[0];
    if (target?.reconstruction.kind !== "not-reproducible") {
      throw new Error("the trip should not be reproducible");
    }
    await user.click(screen.getByRole("button", { name: /^Dezember 2025/ }));
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
    expect(screen.getByTestId("verification")).toHaveTextContent(/^0 von 1 Fahrt/);
    expect(screen.getByTestId("verification-others")).toHaveTextContent(/^1 von Hand ergänzt$/);
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

  it("accepts a booked end before the return as a late return and explains it", async () => {
    const { store, user, target, row, time, apply } = await openEditor();
    expect(screen.getByText(/Bis wann war die Fahrt gebucht\?/)).toHaveTextContent(
      "doppelten Zeitpreis",
    );
    await user.selectOptions(time, String(10 * 60 + 45));
    await apply();
    expect(store.get(settingsAtom).manualBookedEnds[target.trip.id]).toBe(
      toLocalMinute(2025, 12, 15, 10, 45),
    );
    const r = store.get(analysisAtom)?.trips[0]?.reconstruction;
    expect(r?.kind).toBe("manual");
    expect(r?.overrunMinutes).toBe(22);
    expect(row).toHaveTextContent("gebucht bis 10:45, 22 min später zurückgegeben");
  });

  it("rejects a booked end at or before the start", async () => {
    const { store, user, time, date, apply } = await openEditor();
    await user.selectOptions(time, String(10 * 60));
    await apply();
    expect(await screen.findByRole("alert")).toHaveTextContent("kann nicht vor 15.12.2025, 10:15");
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAccessibleDescription(/kann nicht vor/);
    expect(store.get(settingsAtom).manualBookedEnds).toEqual({});
  });

  it("rejects a booked end more than 30 days after the start", async () => {
    const { store, target, date, apply } = await openEditor();
    expect(date.max).toBe(toDateValue(target.trip.start + 30 * 24 * 60));
    expect(date.min).toBe(toDateValue(target.trip.start));
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

describe("incomplete and partial months", () => {
  /** The first row of trips-2025.csv (returned 15.12.2025) without its amounts. */
  function unbilledFile() {
    const text = readFileSync(resolve(FIXTURES, "trips-2025.csv"), "utf8");
    const [header, first] = text.split("\r\n");
    const cells = (first ?? "").split(";");
    // A booking of its own: a copy of a billed trip would count as billed by now.
    cells[7] = "20.12.2025 10:00:00";
    cells[8] = "20.12.2025 12:00:00";
    cells[15] = "";
    cells[16] = "";
    const csv = `${header}\r\n${cells.join(";")}\r\n`;
    return new File([csv], "open.csv", { type: "text/csv" });
  }

  it("marks the first and last month of the fixtures as probably partial", async () => {
    await withFixtures();
    const marks = screen.getAllByTestId("month-partial");
    expect(marks).toHaveLength(2);
    const headers = screen.getAllByTestId("month-header");
    expect(headers[0]).toContainElement(marks[0] as HTMLElement);
    expect(headers[17]).toContainElement(marks[1] as HTMLElement);
    expect(marks[0]).toHaveAccessibleName(
      "Dieser Monat ist im Export vermutlich nicht vollständig enthalten",
    );
    expect(screen.queryByTestId("month-incomplete")).not.toBeInTheDocument();
    expect(screen.getByTestId("warnings")).toHaveTextContent(
      "Vermutlich nur teilweise im Export enthalten: Dez. 2024, Mai 2026.",
    );
  });

  it("marks a month with a not yet billed row as incomplete", async () => {
    const store = createStore();
    await store.set(importFilesAtom, [
      fixture("trips-2025.csv"),
      fixture("trips-2026.csv"),
      unbilledFile(),
    ]);
    await renderResult(store);
    const marks = screen.getAllByTestId("month-incomplete");
    expect(marks).toHaveLength(1);
    const headers = screen.getAllByTestId("month-header");
    const december = headers.findIndex((h) => h.getAttribute("abbr") === "Dezember 2025");
    expect(headers[december]).toContainElement(marks[0] as HTMLElement);
    expect(marks[0]).toHaveAccessibleName(
      "In diesem Monat gibt es noch nicht abgerechnete Fahrten",
    );
    expect(screen.getByTestId("warnings")).toHaveTextContent(
      "In Dez. 2025 gibt es noch nicht abgerechnete Fahrten. Sie fehlen in der Auswertung.",
    );
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

  it("shows the under-26 switch on and locked while the export has Campus trips", async () => {
    const { store } = await withTrips([trip("CAMPUS", 2025, 1, 10), trip("BASIS", 2025, 2, 10)]);
    expect(store.get(settingsAtom).under26).toBe(false);
    expect(store.get(analysisAtom)?.tariffs).toContain("CAMPUS");
    const under26 = screen.getByRole("switch", { name: "Ich bin unter 26" });
    expect(under26).toBeChecked();
    expect(under26).toBeDisabled();
    expect(under26).toHaveAccessibleDescription("Dein Export enthält Fahrten im Campus-Tarif.");
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
  it("shows the fees of a chosen period without trips", async () => {
    const { store, user } = await withFixtures();
    await user.selectOptions(screen.getByLabelText("Von"), "2026-02");
    await user.selectOptions(screen.getByLabelText("Bis"), "2026-03");
    expect(screen.queryByTestId("result-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("summary")).toHaveTextContent("0 Fahrten");
    // Two inherited Aktiv months: 2 × (11.00 € + 3.00 € for the one additional driver found).
    expect(store.get(settingsAtom).additionalDrivers).toBe(1);
    expect(store.get(analysisAtom)?.actualTotal).toBe(2800);
    expect(screen.getByTestId("total-actual-amount").textContent).toBe(euro(2800));
  });

  it("explains a period outside the data and offers the whole period again", async () => {
    const { store, user } = await withFixtures();
    act(() =>
      store.set(settingsAtom, {
        ...store.get(settingsAtom),
        period: { from: "2023-01", to: "2023-02" },
      }),
    );
    expect(screen.getByTestId("result-empty")).toHaveTextContent(
      "Im gewählten Zeitraum gibt es keine Fahrten.",
    );
    expect(screen.queryByTestId("summary")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gesamten Zeitraum anzeigen" }));
    expect(await screen.findByTestId("summary")).toBeInTheDocument();
    await screen.findByTestId("cost-chart");
  });
});

/** The amount button of a matrix cell: tariff row (or "actual") and month index. */
function cellButton(row: string, month: number): HTMLElement {
  const tr =
    row === "actual"
      ? screen.getByTestId("actual-row")
      : (document.querySelector<HTMLElement>(
          `[data-testid="tariff-row"][data-tariff="${row}"]`,
        ) as HTMLElement);
  return tr.querySelectorAll("td")[month]?.querySelector("button") as HTMLElement;
}

/** The lines of the open breakdown: label → text of the amount. */
function breakdownLines(): Record<string, string> {
  const tooltip = screen.getByRole("tooltip");
  return Object.fromEntries(
    [...tooltip.querySelectorAll("dt")].map((dt) => [
      dt.textContent ?? "",
      dt.nextElementSibling?.textContent ?? "",
    ]),
  );
}

describe("breakdown of a matrix cell", () => {
  it("explains a tariff cell with parts that add up to the cell, on focus", async () => {
    const { store } = await withFixtures();
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    const index = a.months.findIndex((m) => m.month === "2025-06");
    const m = a.months[index];
    if (!m) throw new Error("no month");
    expect(m.tripCount).toBeGreaterThan(0);

    const button = cellButton("AKTIV", index);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => button.focus());
    const tooltip = await screen.findByRole("tooltip");
    expect(button).toHaveAttribute("aria-describedby", expect.any(String));

    const lines = breakdownLines();
    const trips = cents(lines["Fahrtkosten"] ?? null);
    expect(cents(lines["davon Zeit"] ?? null) + cents(lines["davon Kilometer"] ?? null)).toBe(
      trips,
    );
    const sum =
      trips + cents(lines["Grundgebühr"] ?? null) + cents(lines["Weitere Fahrer:innen"] ?? "0");
    expect(lines["Summe"]).toBe(euro(sum));
    expect(sum).toBe(m.costs.AKTIV);
    // The cell shows the same amount in whole euros.
    expect(button).toHaveTextContent(spaced(formatCurrency(sum, "de", { decimals: 0 })));
    expect(tooltip).toHaveTextContent(
      `${m.tripCount} ${m.tripCount === 1 ? "Fahrt" : "Fahrten"} · `,
    );
    expect(tooltip).toHaveTextContent(" km");
  });

  it("opens on hover and closes on Escape", async () => {
    const { user } = await withFixtures();
    await user.hover(cellButton("BASIS", 0));
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the switching fee in the actual cell of a month with a switch, and only there", async () => {
    const { store } = await withFixtures();
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    const switched = a.months.findIndex((m) => m.switched);
    const plain = a.months.findIndex((m) => !m.switched && m.tripCount > 0);
    expect(switched).toBeGreaterThan(0);

    act(() => cellButton("actual", switched).focus());
    await screen.findByRole("tooltip");
    let lines = breakdownLines();
    expect(lines["Tarifwechsel"]).toBe(euro(500));
    expect(lines["Summe"]).toBe(euro(a.months[switched]?.actualCost ?? 0));
    expect(screen.getByRole("tooltip")).toHaveTextContent(/aus deinen Fahrten|angenommen|von Hand/);

    act(() => cellButton("actual", plain).focus());
    await screen.findByRole("tooltip");
    lines = breakdownLines();
    expect(lines).not.toHaveProperty("Tarifwechsel");
    expect(lines["Fahrtkosten laut Rechnung"]).toBeDefined();
    expect(lines["Summe"]).toBe(euro(a.months[plain]?.actualCost ?? 0));
  });

  it("is a single tab stop; the arrow keys move between the cells", async () => {
    const { user } = await withFixtures();
    const cells = [...document.querySelectorAll<HTMLElement>("[data-mcell]")];
    expect(cells).toHaveLength(18 * 4);
    expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    act(() => cells[0]?.focus());
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cellButton("BASIS", 1));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(cellButton("AKTIV", 1));
    expect(cells.filter((c) => c.tabIndex === 0)).toEqual([cellButton("AKTIV", 1)]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(cellButton("AKTIV", 17));
  });
});

describe("usage rows of the matrix", () => {
  it("shows trips, kilometres and hours per month with sums equal to the analysis", async () => {
    const { store } = await withFixtures();
    const a = store.get(analysisAtom);
    if (!a) throw new Error("no analysis");
    const rows = screen.getAllByTestId("usage-row");
    expect(rows.map((r) => r.dataset.metric)).toEqual(["trips", "km", "hours"]);
    for (const row of rows) expect(within(row).getByRole("rowheader")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Deine Nutzung" })).toBeInTheDocument();

    const index = a.months.findIndex((m) => m.month === "2025-06");
    const june = a.months[index];
    expect(screen.getAllByTestId("usage-trips")[index]).toHaveTextContent(String(june?.tripCount));
    expect(june?.tripCount).toBeGreaterThan(0);

    expect(screen.getByTestId("usage-total-trips")).toHaveTextContent(String(a.trips.length));
    const km = a.trips.reduce((s, r) => s + r.trip.km, 0);
    expect(
      cents(screen.getByTestId("usage-total-km").textContent?.replace(/\./g, "") + ",00"),
    ).toBe(km * 100);
    const minutes = a.trips.reduce((s, r) => s + r.reconstruction.chargedUntil - r.trip.start, 0);
    expect(screen.getByTestId("usage-total-hours")).toHaveTextContent(formatHours(minutes, "de"));
    expect(screen.getByTestId("usage-total-hours").textContent).toMatch(/^\d+(\.\d{3})*,\d$/);
  });

  it("formats hours per language", async () => {
    await act(() => i18n.changeLanguage("en"));
    await withFixtures();
    expect(screen.getByRole("rowheader", { name: "Your usage" })).toBeInTheDocument();
    expect(screen.getByTestId("usage-total-hours").textContent).toMatch(/^\d+(,\d{3})*\.\d$/);
  });
});
