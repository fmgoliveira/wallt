import { expect, test } from "@playwright/test";
import { createAccount, openApp, submit } from "./helpers";

test("create a monthly budget and see its progress card", async ({ page }) => {
  await openApp(page);
  await createAccount(page, "Budget account");

  await page.goto("/budgets");
  await page.getByRole("button", { name: "Add budget" }).first().click();
  const form = page.getByRole("dialog", { name: "New budget" });
  await form.getByLabel("Name", { exact: true }).fill("Groceries");
  await form.getByLabel(/^Amount/).fill("300");
  await submit(form, "Add budget");

  const card = page.getByRole("button", { name: /^Groceries, \d+% spent$/ });
  await expect(card).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/300/);
});
