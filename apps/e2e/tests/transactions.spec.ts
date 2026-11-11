import { expect, test } from "@playwright/test";
import { createAccount, openApp } from "./helpers";

test("add a transaction by hand and find it in the list", async ({ page }) => {
  await openApp(page);
  await createAccount(page, "Everyday");

  await page.goto("/transactions");
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const editor = page.getByRole("dialog", { name: "New transaction" });
  await expect(editor).toBeVisible();

  // amount 12.50 on the keypad
  for (const key of ["1", "2", "5", "0"])
    await editor.getByRole("button", { name: key, exact: true }).click();
  await editor.getByRole("button", { name: "Save now" }).click();

  await expect(page.getByText("Transaction added")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Everyday" }).first()).toBeVisible();
  // the balance on the account reflects it: 1000.00 - 12.50
  await page.goto("/accounts");
  await expect(page.getByRole("main")).toContainText(/987[.,]50/);
});
