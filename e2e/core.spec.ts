import { expect, test } from "@playwright/test";
import { signIn, signedInPage, userClient, users } from "./fixtures";

test("logs, reacts, protects private rows, replaces, deletes, and moderates", async ({ browser, page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const snack = `E2E Crunch ${suffix}`;
  const replacement = `E2E Crisp ${suffix}`;

  await signIn(page, users.alex.email);
  await page.getByRole("button", { name: /Log Snack|Log$/ }).first().click();
  await page.getByLabel("Snack name").fill(snack);
  await page.getByLabel("Category").selectOption("Chips/Savory Snacks");
  await page.getByRole("button", { name: "Add and log" }).click();
  await expect(page.getByRole("heading", { name: snack })).toBeVisible();
  await expect(page.getByRole("button", { name: `You logged ${snack}` })).toBeDisabled();

  const jordan = await signedInPage(browser, users.jordan.email);
  await expect(jordan.page.getByRole("heading", { name: snack })).toBeVisible();
  await jordan.page.getByRole("button", { name: `Upvote ${snack}` }).click();
  await expect(jordan.page.getByRole("button", { name: `Remove upvote from ${snack}` })).toHaveAttribute("aria-pressed", "true");
  await jordan.page.getByRole("button", { name: `Remove upvote from ${snack}` }).click();
  await expect(jordan.page.getByRole("button", { name: `Upvote ${snack}` })).toHaveAttribute("aria-pressed", "false");
  await jordan.page.getByRole("button", { name: `Upvote ${snack}` }).click();
  await jordan.page.locator(".activity-row").filter({ hasText: snack }).getByRole("button", { name: "Alex Morgan" }).click();
  await expect(jordan.page.getByRole("heading", { name: "Alex Morgan" })).toBeVisible();
  await expect(jordan.page.getByRole("heading", { name: "Private snack log" })).toHaveCount(0);

  const jordanClient = await userClient(users.jordan.email);
  const privateRows = await jordanClient.from("snack_logs").select("id").eq("user_id", users.alex.id);
  expect(privateRows.error).toBeNull();
  expect(privateRows.data).toEqual([]);

  await page.reload();
  await expect(page.getByRole("button", { name: `You logged ${snack}` })).toContainText("1");
  await page.getByRole("button", { name: "Profile" }).first().click();
  const privateLog = page.locator(".private-log li").filter({ hasText: snack });
  await privateLog.getByRole("button", { name: "Replace" }).click();
  await page.getByLabel("Snack name").fill(replacement);
  await page.getByRole("button", { name: "Add and use" }).click();
  await expect(page.getByRole("heading", { name: replacement })).toBeVisible();
  await expect(page.getByRole("heading", { name: snack })).toHaveCount(0);

  await page.getByRole("button", { name: "Profile" }).first().click();
  await page.getByLabel("Display name").fill(`Alex E2E ${suffix}`);
  await page.getByLabel("Favorite snack").selectOption({ label: replacement });
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator(".status-message")).toContainText("Profile saved");
  await page.getByLabel("Display name").fill("Alex Morgan");
  await page.getByLabel("Favorite snack").selectOption("");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("heading", { name: "Alex Morgan" })).toBeVisible();
  const replacedLog = page.locator(".private-log li").filter({ hasText: replacement });
  await replacedLog.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".status-message")).toContainText("removed");

  const jordanDismiss = jordan.page.getByRole("button", { name: "Dismiss" });
  if (await jordanDismiss.isVisible()) await jordanDismiss.click();
  await jordan.page.getByRole("button", { name: /Log Snack|Log$/ }).first().click();
  await jordan.page.getByLabel("Brand, product, or barcode").fill(replacement);
  const searchResult = jordan.page.locator(".search-result").filter({ hasText: replacement });
  await expect(searchResult).toBeVisible();
  await searchResult.getByRole("button", { name: "Suggest correction" }).click();
  await jordan.page.getByLabel("What changed?").fill(`E2E correction ${suffix}`);
  await jordan.page.getByRole("button", { name: "Send correction" }).click();
  await expect(jordan.page.locator(".error-message")).toContainText("Change the name or category");
  await jordan.page.getByLabel("Corrected name").fill(`${replacement} Approved`);
  await jordan.page.getByLabel("Corrected category").selectOption("Protein");
  await jordan.page.getByRole("button", { name: "Send correction" }).click();
  await expect(jordan.page.locator(".success-message")).toContainText("Correction sent");
  await expect(jordan.page.locator(".global-notice")).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Profile" }).first().click();
  const alexDismiss = page.getByRole("button", { name: "Dismiss" });
  if (await alexDismiss.isVisible()) await alexDismiss.click();
  const correction = page.locator(".correction-list li").filter({ hasText: `E2E correction ${suffix}` });
  await correction.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".status-message")).toContainText("Correction approved");
  await jordan.page.getByLabel("Brand, product, or barcode").fill(`${replacement} Approved`);
  await expect(jordan.page.locator(".search-result").filter({ hasText: `${replacement} Approved` })).toContainText("Protein");

  await jordan.context.close();
});

test("remote-search failure keeps manual logging available and critical screens fit", async ({ page }) => {
  await signIn(page, users.priya.email);
  await page.route("**/functions/v1/snack-metadata", (route) => route.fulfill({
    status: 200,
    json: { products: [{ name: "Remote E2E Bar", brand: "Test Kitchen", category: "Protein" }] },
  }));
  await page.getByRole("button", { name: /Log Snack|Log$/ }).first().click();
  await page.getByLabel("Brand, product, or barcode").fill("remote e2e bar");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(".search-result").filter({ hasText: "Remote E2E Bar" })).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await page.route("**/functions/v1/snack-metadata", (route) => route.fulfill({ status: 503, json: { unavailable: true } }));
  await page.getByLabel("Brand, product, or barcode").fill("unavailable snack");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("status")).toContainText("temporarily unavailable");
  await expect(page.getByRole("button", { name: "Add and log" })).toBeEnabled();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const skip = page.getByRole("link", { name: "Skip to content" });
  for (let attempt = 0; attempt < 10 && !await skip.evaluate((element) => element === document.activeElement); attempt += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(skip).toBeFocused();
});
