import { test, expect } from "playwright/test";

/**
 * Regression: the "Report this answer" dialog must stay closed until the report button is clicked.
 * (A `display: grid` rule once overrode the browser's hidden-when-closed style and the modal showed after every answer.)
 */
const composerSel = "textarea:not([aria-label='Details (optional)'])";

test("report dialog is closed after an answer, opens only on click, and every close path works", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.85.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator(composerSel).first().waitFor({ timeout: 30_000 });
  await page.locator(composerSel).first().fill("who made keplar?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  const card = page.locator("article").last();
  await expect(card).toContainText("Hassen", { timeout: 30_000 });

  const dialog = page.getByTestId("report-dialog");
  const isOpen = () => dialog.evaluate((d: HTMLDialogElement) => d.open);
  await expect(dialog).toBeHidden();
  expect(await isOpen()).toBe(false);
  // Nothing blocks the page: the composer is still usable.
  await page.locator(composerSel).first().fill("still typing");
  await expect(page.locator(composerSel).first()).toHaveValue("still typing");

  const trigger = card.getByRole("button", { name: "Report this answer" });
  for (const how of ["Cancel", "X", "Escape", "Backdrop"] as const) {
    await trigger.click();
    await expect(dialog).toBeVisible();
    expect(await isOpen()).toBe(true);
    if (how === "Cancel") await dialog.getByRole("button", { name: "Cancel" }).click();
    else if (how === "X") await dialog.getByRole("button", { name: "Close" }).click();
    else if (how === "Escape") await page.keyboard.press("Escape");
    else await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
    expect(await isOpen()).toBe(false);
  }
  await page.locator(composerSel).first().fill("typing after close");
  await expect(page.locator(composerSel).first()).toHaveValue("typing after close");
});
