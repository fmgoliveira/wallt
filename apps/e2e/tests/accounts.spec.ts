import { expect, test } from "@playwright/test";
import { createAccount, openApp, submit } from "./helpers";

test("first run: the guide leads to a first account", async ({ page }) => {
  await openApp(page);
  await expect(page.getByText("Welcome to Wallt")).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  // onboarding opens the new-account form straight away
  const form = page.getByRole("dialog", { name: "New account" });
  await expect(form).toBeVisible();
  await form.getByLabel("Name", { exact: true }).fill("Main checking");
  await form.getByLabel("Opening balance").fill("1000");
  await submit(form, "Add account");
  await expect(page.getByText("Main checking").first()).toBeVisible();
});

test("an account created once is still there after a reload", async ({ page }) => {
  await openApp(page);
  await createAccount(page, "Savings pot", "250");
  await page.reload();
  await expect(page.getByText("Savings pot")).toBeVisible();
});
