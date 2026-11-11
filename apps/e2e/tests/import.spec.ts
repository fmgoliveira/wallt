import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createAccount, openApp } from "./helpers";

const fixture = resolve(import.meta.dirname, "../../../fixtures/en-comma-iso-bom.csv");

/** Opens the wizard with the fixture and imports it into the only account. */
async function importFixture(page: Page) {
  await openApp(page);
  await createAccount(page, "Imported account", "0");
  await page.goto("/import");
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Drop a file here, or click to choose").click();
  await (await chooser).setFiles(fixture);
  // detection reads the file; the only account is already chosen
  await expect(page.getByText(/rows read/)).toBeVisible();
  await page.getByRole("button", { name: /^Import \d+ transactions?$/ }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
}

test("import a bank CSV and see its rows in the list", async ({ page }) => {
  await importFixture(page);
  await page.goto("/transactions");
  await expect(page.getByText("NETFLIX.COM").first()).toBeVisible();
});

test("one tap undoes the whole import", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.getByText("Import undone")).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByText("NETFLIX.COM")).toHaveCount(0);
});
