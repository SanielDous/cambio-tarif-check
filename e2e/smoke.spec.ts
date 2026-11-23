import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, ROOT_URL } from "./servers";

for (const [where, url] of [
  ["under a sub-path unknown to the build", BASE_URL],
  ["at the site root", ROOT_URL],
] as const) {
  test(`loads every file ${where}, also the parts loaded on demand`, async ({ page }) => {
    const requested: string[] = [];
    const failed: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    page.on("requestfailed", (request) => failed.push(request.url()));
    page.on("response", (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: "cambio Tarif-Check" })).toBeVisible();
    // The stylesheet applies: the drop zone input is visually hidden.
    await expect(page.locator('input[type="file"]').first()).toHaveCSS("position", "absolute");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");
    await expect(page.getByTestId("headline")).toBeVisible();
    await expect(page.locator(".recharts-surface")).toBeVisible();

    await page.goto(`${url}#/how-it-works`);
    await expect(page.getByTestId("price-tables")).toBeVisible();
    await page.getByRole("link", { name: "Start", exact: true }).click();
    await expect(page).toHaveURL(`${url}#/`);

    expect(failed).toEqual([]);
    expect(requested.filter((request) => !request.startsWith(url))).toEqual([]);
  });
}

test("loads in German, switches to English and renders how-it-works", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "cambio Tarif-Check" })).toBeVisible();
  await expect(page.getByText("Finde heraus, welcher cambio-Tarif")).toBeVisible();
  await expect(page.getByText("Kein offizielles Angebot von cambio")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  await page.goto("./#/how-it-works");
  await expect(page.getByRole("heading", { level: 1, name: "So funktioniert’s" })).toBeVisible();

  await page.getByRole("button", { name: "Sprache" }).click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How it works" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByText("Find out which cambio tariff")).toBeVisible();
});

const hasHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test("imports a trip export and shows the summary, without overflow at 390 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.getByText("Du findest den Export im cambio-Kundenportal")).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");
  await expect(page.getByTestId("trip-count")).toHaveText("84 Fahrten");
  await expect(page.getByTestId("headline")).toBeVisible();
  await expect(page.getByRole("table", { name: /Kosten je Tarif und Monat/ })).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

for (const width of [1280, 390]) {
  test(`shows the result with summary, matrix and chart at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");

    const summary = page.getByTestId("summary");
    await expect(summary.getByTestId("headline")).toContainText(/Basis|Aktiv|Comfort/);
    await expect(summary.getByTestId("total-actual")).toContainText("€");
    const matrix = page.getByRole("table", { name: /Kosten je Tarif und Monat/ });
    await expect(matrix).toBeVisible();
    await expect(page.getByTestId("month-header")).toHaveCount(13);
    await expect(page.locator(".recharts-surface")).toBeVisible();
    await expect(matrix.getByRole("rowheader", { name: "Deine Nutzung" })).toBeAttached();
    await expect(matrix.getByTestId("usage-row")).toHaveCount(3);
    await matrix.getByTestId("usage-row").first().scrollIntoViewIfNeeded();
    await expect(matrix.getByTestId("usage-row").first()).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await page.getByRole("button", { name: "Fahrten im Dezember 2025 anzeigen" }).click();
    await expect(page.getByTestId("trip-row").first()).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}

const headingLevels = (page: Page) =>
  page
    .getByRole("heading")
    .evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))));

function expectOrderedOutline(levels: number[]) {
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
  levels.forEach((level, i) => {
    if (i > 0) expect(level - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1);
  });
}

for (const [language, tariff, caption, intro] of [
  ["Deutsch", "Basis", "Preise je Tarif und Wagenklasse", "Preisstand"],
  ["English", "Basis", "Prices per tariff and vehicle class", "The prices are as of"],
] as const) {
  test(`how-it-works renders the price table in ${language}, without overflow at 390 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./#/how-it-works");
    if (language === "English") {
      await page.getByRole("button", { name: "Sprache" }).click();
      await page.getByRole("menuitem", { name: "English" }).click();
    }
    const prices = page.getByTestId("price-tables");
    await expect(prices).toBeVisible();
    await expect(prices.getByRole("table", { name: caption })).toBeVisible();
    await expect(prices.getByRole("rowheader", { name: tariff }).first()).toBeVisible();
    await expect(page.getByText(intro, { exact: false }).first()).toBeVisible();
    expect(await prices.getByRole("table").count()).toBe(3);

    // The wide table scrolls inside its own container, not the page.
    const region = prices.locator('div[role="region"]').nth(1);
    const sizes = await region.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    expect(await hasHorizontalOverflow(page)).toBe(false);
    expectOrderedOutline(await headingLevels(page));
  });
}

test("start page notice links to the explanation", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("Inoffizielles Werkzeug")).toBeVisible();
  await page.getByRole("link", { name: "So funktioniert’s" }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "So funktioniert’s" })).toBeVisible();
});

test.describe("keyboard", () => {
  /** Presses Tab until the focused element matches, within a sane number of steps. */
  async function tabTo(page: Page, selector: string) {
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
    }
    throw new Error(`Not reachable by Tab: ${selector}`);
  }

  test("tabs from the top of the result to a tariff menu and a trip list toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("./");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");
    await expect(page.getByTestId("headline")).toBeVisible();
    await expect(page.locator(".recharts-surface")).toBeVisible();

    // Start from the very top of the document.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => window.scrollTo(0, 0));

    await tabTo(page, 'button[aria-label^="Dein Tarif im"]');
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Focus is inside the menu (on the current tariff), so the arrow keys work right away.
    await expect(menu.locator('[role="menuitemradio"]:focus')).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(menu.locator('[role="menuitemradio"]:focus')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.locator('button[aria-label^="Dein Tarif im"]:focus')).toHaveCount(1);

    await tabTo(page, "button[data-month]");
    await expect(page.locator("button[data-month]:focus")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // Space opens, Enter closes and opens again.
    const toggle = page.locator("button[data-month]:focus");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("trip-row").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("opens the breakdown of a matrix cell by keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("./");
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");
    await expect(page.getByTestId("headline")).toBeVisible();

    // The amount cells are one tab stop, entered once; arrows move inside.
    await tabTo(page, "button[data-mcell]");
    await expect(page.locator("button[data-mcell]:focus")).toHaveAttribute("data-mcell", "0:0");
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Grundgebühr");
    await expect(tooltip).toContainText("Summe");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("button[data-mcell]:focus")).toHaveAttribute("data-mcell", "1:0");
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    expect(await page.locator('button[data-mcell][tabindex="0"]').count()).toBe(1);
  });

  test("keeps the outline of the start page and the result in order", async ({ page }) => {
    await page.goto("./");
    expectOrderedOutline(await headingLevels(page));
    await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");
    await expect(page.getByTestId("headline")).toBeVisible();
    expectOrderedOutline(await headingLevels(page));
  });
});

test("a blocked chunk shows an error; retry loads it without reloading or losing the trips", async ({
  page,
}) => {
  const chunk = "**/assets/result-view-*.js";
  await page.route(chunk, (route) => route.abort());
  await page.goto("./");
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Dieser Teil der Seite konnte nicht geladen werden");
  await expect(page.getByTestId("trip-count")).toHaveText("84 Fahrten");

  await page.unroute(chunk);
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByTestId("headline")).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true);
  expect(await page.evaluate(() => sessionStorage.length + localStorage.length)).toBe(0);
});

test("writes nothing to browser storage and sets no cookies", async ({ page }) => {
  await page.goto("./");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/trips-2025.csv");
  await expect(page.getByTestId("headline")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.goto("./#/how-it-works");
  await expect(page.getByTestId("price-tables")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const state = await page.evaluate(async () => ({
    keys: [...Object.keys(sessionStorage), ...Object.keys(localStorage)],
    cookie: document.cookie,
    databases: "databases" in indexedDB ? await indexedDB.databases() : [],
  }));
  expect(state.keys).toEqual([]);
  expect(state.cookie).toBe("");
  expect(state.databases).toEqual([]);
});
