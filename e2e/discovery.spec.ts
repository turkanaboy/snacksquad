import { expect, test } from "@playwright/test";
import { admin, signIn, users } from "./fixtures";

test("random picks save to the private profile and releases stay quiet", async ({ page }) => {
  const articleUrl = "https://example.com/cocoa-dusted-almond-bites";
  const update = await admin()
    .from("snack_releases")
    .update({ article_url: articleUrl })
    .eq("id", "30000000-0000-0000-0000-000000000101");
  if (update.error) throw update.error;

  await signIn(page, users.alex.email);

  await expect(page.getByRole("heading", { name: "New snack releases" })).toBeVisible();
  const releaseLink = page.getByRole("link", { name: "Cocoa-Dusted Almond Bites" });
  await expect(releaseLink).toHaveAttribute("href", articleUrl);
  await expect(releaseLink).toHaveAttribute("target", "_blank");
  await expect(releaseLink).toHaveAttribute("rel", "noreferrer");
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
