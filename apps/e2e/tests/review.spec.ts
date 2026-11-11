import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createAccount, openApp } from "./helpers";

const fixture = resolve(import.meta.dirname, "../../../fixtures/en-comma-iso-bom.csv");

test("categorise a transaction from the review queue", async ({ page }) => {
  await openApp(page);
  await createAccount(page, "Review account", "0");
  await page.goto("/import");
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Drop a file here, or click to choose").click();
  await (await chooser).setFiles(fixture);
  await page.getByRole("button", { name: /^Import \d+ transactions?$/ }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/review");
  const count = page.getByText(/^\d+ to review/);
  await expect(count).toBeVisible();
  const before = Number((await count.innerText()).match(/^\d+/)?.[0]);
  expect(before).toBeGreaterThan(0);

  // choose a category for the first one: the queue moves on and the count drops
  await page.getByRole("button", { name: "Choose…" }).first().click();
  await page.getByRole("dialog").getByText("Supermercado", { exact: true }).click();
  await expect(page.getByText(/^Categorised as /)).toBeVisible();
  await expect(
    page.getByText(new RegExp(`^${before - 1} to review|Nothing to review`)),
  ).toBeVisible();
});
