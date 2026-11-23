import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, ROOT_PORT, SUB_PATH } from "./e2e/servers";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Built once; served under a sub-path unknown to the build, and at the root.
    command: `pnpm build && node e2e/preview.mjs ${ROOT_PORT}:/ ${PORT}:${SUB_PATH}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
