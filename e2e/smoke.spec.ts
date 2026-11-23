import { expect, test, type Page } from "@playwright/test";

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
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await page.getByRole("button", { name: "Fahrten im Dezember 2025 anzeigen" }).click();
    await expect(page.getByTestId("trip-row").first()).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}
