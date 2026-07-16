import { expect, test } from "@playwright/test";
import { signIn, signedInPage, users } from "./fixtures";

test("Fantasy is reachable from responsive navigation and bracket renders", async ({ page }) => {
  await signIn(page, users.marcus.email);
  await page.getByRole("button", { name: "Bracket" }).first().click();
  await expect(page.getByRole("heading", { name: "One snack survives." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The bracket" })).toBeVisible();
  await page.getByRole("button", { name: "Fantasy" }).first().click();
  await expect(page.getByRole("heading", { name: "Draft your snack shelf." })).toBeVisible();
});

test("four managers can create, join, and start a Fantasy draft", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The lifecycle is shared; responsive reachability runs in both projects.");
  const leagueName = `E2E League ${Date.now()}`;
  await signIn(page, users.alex.email);
  await page.getByRole("button", { name: "Fantasy" }).click();
  await page.getByLabel("League name").fill(leagueName);
  await page.getByRole("button", { name: "Create league" }).click();
  const switcher = page.locator(".league-switcher");
  await expect(switcher).toContainText(leagueName);
  const code = (await switcher.getByText(/Code /).textContent())!.replace("Code ", "").trim();

  const managers = [];
  for (const user of [users.jordan, users.priya, users.marcus]) {
    managers.push(await signedInPage(browser, user.email));
  }
  for (const manager of managers) {
    await manager.page.getByRole("button", { name: "Fantasy" }).click();
    await manager.page.getByLabel("Join code").fill(code);
    await manager.page.getByRole("button", { name: "Join league" }).click();
    await expect(manager.page.locator(".league-switcher")).toContainText(leagueName);
  }

  await page.reload();
  const start = page.getByRole("button", { name: "Start season" });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.locator(".draft-status")).toContainText("drafting");
  await Promise.all(managers.map((manager) => manager.context.close()));
});
