import { expect, test } from "@playwright/test";
import { generateTotp } from "../../server/src/auth/totp";
import { BASE_URL, SETUP_TOKEN } from "../env";
import { openApp } from "./helpers";

const EMAIL = "owner@example.test";
const PASSWORD = "correct horse battery staple";
const STEP_MS = 30_000;

/** Creates the first user and finishes 2FA enrolment through the API, returning the authenticator secret. */
async function createOwner(request: import("@playwright/test").APIRequestContext) {
  const setup = await request.post(`${BASE_URL}/auth/setup`, {
    data: { setupToken: SETUP_TOKEN, email: EMAIL, password: PASSWORD },
  });
  expect(setup.ok()).toBe(true);
  const { enrolToken, secret } = (await setup.json()) as { enrolToken: string; secret: string };
  // The previous 30 s step is still accepted (±1) and is "used" here, so the UI can take a later one.
  const confirm = await request.post(`${BASE_URL}/auth/2fa/confirm`, {
    data: {
      enrolToken,
      code: generateTotp(secret, Date.now() - STEP_MS),
      deviceName: "e2e setup",
      platform: "other",
    },
  });
  expect(confirm.ok()).toBe(true);
  return secret;
}

// The first user can only be created once per server run, so a retry could not repeat the setup.
test.describe.configure({ retries: 0 });

test("sign in to the server with password and a 2FA code", async ({ page, request }) => {
  const secret = await createOwner(request);

  await openApp(page, "/settings");
  await page.getByRole("button", { name: "Sign in to sync" }).click();
  await page.getByLabel("Server address").fill(BASE_URL);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("6-digit code").fill(generateTotp(secret, Date.now() + STEP_MS));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByText(/Signed in as owner@example\.test/)).toBeVisible();
});
