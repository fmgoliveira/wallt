import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, SETUP_TOKEN } from "./env";

/**
 * Web end-to-end tests (plan §10 P7.4). They run against the production-like setup: the Hono server serving the
 * static Expo web export on one origin (which is what sends the COOP/COEP headers the in-browser SQLite needs).
 * Build the app first: `pnpm --filter @wallt/app build`. The server gets a throw-away data directory and key.
 */
const root = resolve(import.meta.dirname, "../..");

export default defineConfig({
  testDir: "./tests",
  // The browser database lives in OPFS per origin; every test gets a fresh browser context, so tests are isolated.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // CI uses the Google Chrome already on the runner image (E2E_CHANNEL=chrome): no browser or apt download there.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
      },
    },
  ],
  webServer: {
    command: "pnpm --filter @wallt/server start",
    cwd: root,
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      DATA_DIR: mkdtempSync(join(tmpdir(), "wallt-e2e-")),
      WEB_DIR: join(root, "apps/app/dist"),
      ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      LOG_LEVEL: "warn",
      SETUP_TOKEN,
    },
  },
});
