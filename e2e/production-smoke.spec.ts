import { expect, test } from "@playwright/test";

test("hosted app is reachable without application writes", async ({ page }) => {
  expect(process.env.E2E_HOSTED_BASE_URL, "Set E2E_HOSTED_BASE_URL to the approved deployment.").toBeTruthy();
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, "Hosted smoke refuses service-role credentials.").toBeUndefined();
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  expect(response?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", { name: /Your snack break has standings now|Recent activity/ })).toBeVisible();
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
});
