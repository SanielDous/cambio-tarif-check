// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n/bootstrap";
import { latestPrices, PRICE_DATA, parseIsoDate } from "@/domain/pricing/price-data";
import type { PriceClass, PriceData, PriceVersion, TariffId } from "@/domain/pricing/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { REPOSITORY_URL } from "@/lib/links";
import { HowItWorksView } from "./how-it-works-view";

afterEach(async () => {
  cleanup();
  await act(() => i18n.changeLanguage("de"));
});

/** Intl output uses non-breaking spaces; jest-dom normalizes the element, not the expectation. */
const spaced = (text: string | null) => (text ?? "").replace(/\s+/g, " ");

const PRICES = latestPrices(PRICE_DATA);
const TARIFFS = Object.keys(PRICES.tariffs) as TariffId[];

describe.each(["de", "en"])("how it works page in %s", (lang) => {
  const setup = async () => {
    await act(() => i18n.changeLanguage(lang));
    render(<HowItWorksView />);
    return screen.getByTestId("price-tables");
  };
  const money = (cents: number) => spaced(formatCurrency(cents, lang));

  it("shows every tariff, price class, surcharge period and the switching fee of the price data", async () => {
    const tables = await setup();
    const page = document.body;
    for (const id of TARIFFS) {
      const tariff = PRICES.tariffs[id];
      const row = tables.querySelector<HTMLElement>(`tr[data-tariff="${id}"]`);
      expect(row, id).not.toBeNull();
      expect(within(row as HTMLElement).getByText(i18n.t(`tariffs.${id}`))).toBeInTheDocument();
      expect(row).toHaveTextContent(money(tariff.monthlyFee));
      const group = tables.querySelector<HTMLElement>(`tbody[data-tariff="${id}"]`);
      expect(group, id).not.toBeNull();
      const classes = Object.keys(tariff.prices) as PriceClass[];
      expect(classes.length).toBeGreaterThan(0);
      const rows = within(group as HTMLElement).getAllByRole("row");
      expect(rows).toHaveLength(classes.length);
      for (const c of classes) {
        const price = tariff.prices[c];
        const classRow = rows.find((r) => within(r).queryByRole("rowheader", { name: c }));
        expect(classRow, `${id} ${c}`).toBeDefined();
        const text = classRow?.textContent ?? "";
        const fullDay = PRICE_DATA.dayCapHours * (price?.hourWeekday ?? 0);
        for (const cents of [
          price?.hourWeekday,
          price?.dayCap ?? fullDay,
          PRICE_DATA.weekCapDays * fullDay,
          price?.kmTier1,
          price?.kmTier2,
        ]) {
          expect(spaced(text), `${id} ${c}`).toContain(money(cents ?? NaN));
        }
        if (price && price.hourWeekend !== price.hourWeekday) {
          expect(spaced(text)).toContain(money(price.hourWeekend));
        }
      }
    }
    for (const period of PRICE_DATA.fuelSurcharges) {
      const row = tables.querySelector<HTMLElement>(`tr[data-from="${period.from}"]`);
      expect(row?.textContent).toContain(formatDate(parseIsoDate(period.from), lang));
      expect(row?.textContent).toContain(String(period.cents));
    }
    expect(page).toHaveTextContent(
      i18n.t("howItWorks.prices.switching", { fee: money(PRICES.switchingFee) }),
    );
    expect(page).toHaveTextContent(formatDate(parseIsoDate(PRICE_DATA.pricesAsOf), lang));
    expect(screen.getByRole("link", { name: i18n.t("footer.repository") })).toHaveAttribute(
      "href",
      REPOSITORY_URL,
    );
  });

  it("interpolates the numbers from the price data", async () => {
    await setup();
    const trip = screen.getByText(/^(Nacht|Night)/);
    expect(spaced(trip.textContent)).toContain(money(PRICES.nightHourPrice));
    expect(trip).toHaveTextContent("00:00");
    expect(trip).toHaveTextContent("06:00");
    expect(document.body).toHaveTextContent(money(PRICES.switchingFee));
    expect(screen.getByText(/^(Deckel|Caps)/)).toHaveTextContent(`${PRICE_DATA.dayCapHours}`);
    expect(document.body.textContent).not.toMatch(/\{\{|undefined|NaN/);
  });

  it("renders the cities that charge holidays at the weekend price from the price data", async () => {
    const tables = await setup();
    const cities = new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(
      PRICE_DATA.holidayCities,
    );
    expect(cities).toContain("Aachen");
    expect(cities).toContain("Saarbrücken");
    expect(cities).not.toContain("Hamburg");
    expect(within(tables).getByTestId("holiday-cities")).toHaveTextContent(cities);
    expect(screen.getByText(/^(Wochenende|Weekend)/)).toHaveTextContent(cities);
    const limits = screen.getByRole("region", { name: i18n.t("howItWorks.limits.title") });
    expect(limits).toHaveTextContent(i18n.t("howItWorks.limits.holidays"));
    expect(i18n.t("howItWorks.limits.holidays")).toMatch(/Aachen/);
  });

  it("uses real tables with header scopes, one h1 and ordered headings", async () => {
    const tables = await setup();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
    levels.forEach((level, i) => {
      if (i > 0) expect(level - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    });
    expect(within(tables).getAllByRole("table")).toHaveLength(3);
    for (const th of tables.querySelectorAll("th")) expect(th).toHaveAttribute("scope");
    const regions = tables.querySelectorAll('div[role="region"]');
    expect(regions).toHaveLength(3);
    for (const region of regions) {
      expect(region).toHaveAttribute("tabindex", "0");
      expect(region).toHaveClass("overflow-x-auto");
    }
  });

  it("explains every reconstruction kind with the labels of the result page", async () => {
    await setup();
    const list = screen.getByTestId("kinds-list");
    for (const kind of [
      "verified",
      "verified-rounding",
      "estimated",
      "manual",
      "cancelled",
      "unused",
      "not-reproducible",
    ]) {
      expect(list).toHaveTextContent(i18n.t(`result.kinds.${kind}.label`));
      expect(list).toHaveTextContent(i18n.t(`result.kinds.${kind}.text`));
    }
    expect(list).toHaveTextContent(i18n.t("result.kinds.overrun.label"));
    expect(list).toHaveTextContent(i18n.t("result.kinds.overrun.general"));
  });

  it("lists every price version by its first day, the latest open and the others collapsed", async () => {
    await act(() => i18n.changeLanguage(lang));
    const [v1] = PRICE_DATA.versions as [PriceVersion];
    const v2: PriceVersion = structuredClone({ ...v1, from: "2026-03-15" });
    v2.tariffs.AKTIV.monthlyFee = 1234;
    v2.switchingFee = 900;
    v2.nightHourPrice = 70;
    const data: PriceData = { ...PRICE_DATA, versions: [v1, v2] };
    render(<HowItWorksView data={data} />);
    const tables = screen.getByTestId("price-tables");
    const user = userEvent.setup();

    const validFrom = (iso: string) =>
      i18n.t("howItWorks.prices.validFrom", { date: formatDate(parseIsoDate(iso), lang) });
    const latest = within(tables).getByRole("button", { name: validFrom("2026-03-15") });
    const first = within(tables).getByRole("button", { name: validFrom(PRICE_DATA.validFrom) });
    expect(latest).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-expanded", "false");
    // The open version's tables and the surcharge table.
    expect(within(tables).getAllByRole("table")).toHaveLength(3);
    const aktiv = () => tables.querySelectorAll<HTMLElement>('tr[data-tariff="AKTIV"]');
    expect(aktiv()).toHaveLength(1);
    expect(aktiv()[0]).toHaveTextContent(money(1234));
    // The text around the tables states today's prices.
    expect(document.body).toHaveTextContent(money(900));
    expect(spaced(screen.getByText(/^(Nacht|Night)/).textContent)).toContain(money(70));

    await user.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(within(tables).getAllByRole("table")).toHaveLength(5);
    expect(aktiv()[1]).toHaveTextContent(money(v1.tariffs.AKTIV.monthlyFee));
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
    levels.forEach((level, i) => {
      if (i > 0) expect(level - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    });
  });

  it("shows a single price version without a collapsible section", async () => {
    const tables = await setup();
    expect(within(tables).queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains late returns and what is left out about them", async () => {
    await setup();
    const early = screen.getByRole("region", { name: i18n.t("howItWorks.earlyReturn.title") });
    expect(early).toHaveTextContent(i18n.t("howItWorks.earlyReturn.late"));
    expect(i18n.t("howItWorks.earlyReturn.late")).toMatch(
      /doppelten Zeitpreis|double the time price/,
    );
    const limits = screen.getByRole("region", { name: i18n.t("howItWorks.limits.title") });
    expect(limits).toHaveTextContent(i18n.t("howItWorks.limits.credit"));
    expect(limits).toHaveTextContent(i18n.t("howItWorks.limits.lateFees"));
    expect(i18n.t("howItWorks.limits.credit")).toMatch(/Fahrtguthaben|credit/);
    expect(i18n.t("howItWorks.limits.lateFees")).toMatch(/Verspätungsgebühr|late fee/);
  });
});
