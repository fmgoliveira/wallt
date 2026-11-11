import { expect, type Locator, type Page } from "@playwright/test";

/** Opens the app and waits until the local database is open (the dashboard shows data, not the loading gate). */
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
  await expect(page.getByText("Cannot open your data")).toHaveCount(0);
}

/**
 * Presses a dialog's submit button until the dialog closes. Under load (parallel browsers) a click can land while the
 * sheet is still animating in and be dropped, so a single click is not reliable.
 */
export async function submit(dialog: Locator, button: string) {
  await expect(async () => {
    if (await dialog.isVisible()) await dialog.getByRole("button", { name: button }).click();
    await expect(dialog).toBeHidden({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/** Creates an account through the Accounts screen. */
export async function createAccount(page: Page, name: string, opening = "1000") {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).first().click();
  const form = page.getByRole("dialog", { name: "New account" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Opening balance").fill(opening);
  await submit(form, "Add account");
  await expect(page.getByText(name).first()).toBeVisible();
}
