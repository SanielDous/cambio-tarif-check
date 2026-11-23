import { expect, test } from "@playwright/test";

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
