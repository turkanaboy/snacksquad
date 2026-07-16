import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, users } from "./fixtures";

async function latestMagicLink(request: APIRequestContext, email: string) {
  const list = await request.get("http://127.0.0.1:54324/api/v1/messages");
  const body = await list.json() as { messages?: Array<{ ID: string; To?: Array<{ Address?: string }> }> };
  const message = body.messages?.find((item) => item.To?.some((recipient) => recipient.Address === email));
  if (!message) return "";
  const detail = await request.get(`http://127.0.0.1:54324/api/v1/message/${message.ID}`);
  const content = await detail.json() as { HTML?: string; Text?: string };
  return `${content.HTML || ""}\n${content.Text || ""}`.match(/https?:\/\/[^\s"'<>]+/)?.[0]?.replaceAll("&amp;", "&") || "";
}

test("rejects an ineligible email without creating a user", async ({ page }) => {
  const email = `outside-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByLabel("Company email").fill(email);
  await page.getByRole("button", { name: "Email me a magic link" }).click();
  await expect(page.getByRole("alert")).toContainText("Carnegie Higher Ed company email");
  const result = await admin().auth.admin.listUsers();
  expect(result.data.users.some((user) => user.email === email)).toBe(false);
});

test("completes one real Mailpit magic link, refreshes, and signs out", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One delivery proves the shared local email path.");
  const leagueId = "00000000-0000-0000-0000-000000000001";
  await page.goto(`/?view=fantasy&league=${leagueId}`);
  await page.getByLabel("Company email").fill(users.alex.email);
  await page.getByRole("button", { name: "Email me a magic link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");

  await expect.poll(() => latestMagicLink(request, users.alex.email), { timeout: 10_000 }).toMatch(/^http/);
  const link = await latestMagicLink(request, users.alex.email);
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(new RegExp(`view=fantasy.*league=${leagueId}`));
  for (let attempt = 0; attempt < 3 && await page.getByRole("alert").filter({ hasText: "JWT issued at future" }).isVisible(); attempt += 1) {
    await page.waitForTimeout(1_000);
    await page.reload();
  }
  await expect(page.getByRole("heading", { name: /Draft your snack shelf|Earn the unlock/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Draft your snack shelf|Earn the unlock/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Company email")).toBeVisible();
});

test("shows a friendly invalid-callback error", async ({ page }) => {
  await page.goto("/?error_description=Email%20link%20is%20invalid%20or%20has%20expired");
  await expect(page.getByRole("alert")).toContainText(/invalid|expired/i);
});
