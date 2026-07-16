import { expect, test } from "@playwright/test";

test("loads the unauthenticated application shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your snack break has standings now." })).toBeVisible();
  await expect(page.getByLabel("Company email")).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
