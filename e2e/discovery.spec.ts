import { expect, test } from "@playwright/test";
import { signIn, users } from "./fixtures";

test("random picks save to the private profile and releases stay quiet", async ({ page }) => {
  await signIn(page, users.alex.email);

  await expect(page.getByRole("heading", { name: "New snack releases" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cocoa-Dusted Almond Bites" })).toBeVisible();
  await expect(page.locator(".release-feed")).toHaveCSS("animation-name", "none");

  await page.getByRole("button", { name: "Choose for me" }).click();
  const result = page.locator(".random-snack-result");
  await expect(result).toBeVisible();
  const snackName = (await result.locator("b").textContent())!;
  await page.getByRole("button", { name: `Like ${snackName}`, exact: true }).click();
  await expect(page.getByRole("status")).toContainText("added to your likes");

  await page.getByRole("button", { name: "Profile" }).first().click();
  await expect(page.getByRole("heading", { name: "Likes", exact: true }).locator("..")).toContainText(snackName);
});
